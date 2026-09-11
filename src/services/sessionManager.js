const qrcode = require('qrcode');
const { Client, LocalAuth } = require('whatsapp-web.js');
const config = require('../config');
const logger = require('../logger');
const { httpError } = require('../errors');
const {
  discoverPersistedSessions,
  sessionDirFor,
  clearStaleLocks,
  removeDirSafe,
  sleep,
} = require('./sessionStore');

const REUSABLE_STATUSES = new Set(['initializing', 'qr', 'authenticated', 'ready']);
const SETTLED_STATUSES = new Set(['qr', 'ready', 'error', 'auth_failure']);
const DEAD_STATUSES = new Set(['error', 'disconnected', 'auth_failure']);
const INIT_TIMEOUT_MS = 90000;
const AUTH_STUCK_MS = 120000;

class SessionManager {
  constructor() {
    this.sessions = new Map();
    this.shuttingDown = false;
    this.reconnectTimers = new Map();
    this.reconnectCounts = new Map();
  }

  list() {
    return [...this.sessions.entries()].map(([id, session]) => ({
      id,
      status: session.status,
    }));
  }

  has(sessionId) {
    return this.sessions.has(sessionId);
  }

  get(sessionId) {
    const session = this.sessions.get(sessionId);
    if (!session) throw httpError('Session not found', 404, 'session_not_found');
    return session;
  }

  requireReady(sessionId) {
    const session = this.get(sessionId);
    if (session.status !== 'ready') {
      throw httpError(`Session not ready (status: ${session.status})`, 409, 'session_not_ready');
    }
    return session;
  }

  isReusable(session) {
    if (!session || DEAD_STATUSES.has(session.status)) return false;
    if (!REUSABLE_STATUSES.has(session.status)) return false;

    const age = Date.now() - (session.startedAt || 0);
    if (session.status === 'initializing' && age > INIT_TIMEOUT_MS) return false;
    if (session.status === 'authenticated' && !session.readyAt && age > AUTH_STUCK_MS) return false;
    return true;
  }

  async boot(sessionId, { force = false } = {}) {
    const existing = this.sessions.get(sessionId);
    if (!force && this.isReusable(existing)) {
      return existing;
    }

    if (existing) {
      await this.stop(sessionId, { clearReconnect: false });
    }

    this.clearReconnect(sessionId);
    clearStaleLocks(sessionDirFor(config.sessionDir, sessionId));

    if (!config.chromePath && (process.env.PUPPETEER_EXECUTABLE_PATH || process.env.CHROME_PATH)) {
      logger.warn('configured Chrome path not found, falling back to Puppeteer bundled Chromium');
    }

    const client = new Client({
      authStrategy: new LocalAuth({
        clientId: sessionId,
        dataPath: config.sessionDir,
        rmMaxRetries: 8,
      }),
      authTimeoutMs: 60000,
      takeoverOnConflict: true,
      takeoverTimeoutMs: 5000,
      webVersionCache: { type: 'local' },
      puppeteer: {
        headless: true,
        ...(config.chromePath ? { executablePath: config.chromePath } : {}),
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-accelerated-2d-canvas',
          '--no-first-run',
          '--no-zygote',
          '--disable-gpu',
        ],
      },
    });

    const session = {
      client,
      status: 'initializing',
      qrDataUri: null,
      readyAt: null,
      startedAt: Date.now(),
    };

    this.sessions.set(sessionId, session);
    this.bindEvents(sessionId, session, client);

    client.initialize().catch((error) => {
      session.status = 'error';
      logger.error('session initialize failed', { sessionId, message: error.message });
      this.scheduleReconnect(sessionId, 'initialize_failed');
    });

    return session;
  }

  async waitForBoot(sessionId, timeoutMs = 45000) {
    const started = Date.now();

    while (Date.now() - started < timeoutMs) {
      const session = this.sessions.get(sessionId);
      if (!session) throw httpError('Session not found', 404, 'session_not_found');

      if (session.qrDataUri || SETTLED_STATUSES.has(session.status)) {
        if (session.status === 'qr' && !session.qrDataUri) {
          await sleep(250);
          continue;
        }
        return session;
      }

      await sleep(300);
    }

    return this.get(sessionId);
  }

  bindEvents(sessionId, session, client) {
    client.on('loading_screen', (percent, message) => {
      logger.info('session loading', { sessionId, percent, message });
    });

    client.on('qr', async (qr) => {
      try {
        session.qrDataUri = await qrcode.toDataURL(qr);
        session.status = 'qr';
        logger.info('session qr ready', { sessionId });
      } catch (error) {
        logger.error('failed to render qr', { sessionId, message: error.message });
      }
    });

    client.on('authenticated', () => {
      session.status = 'authenticated';
      session.readyAt = null;
      logger.info('session authenticated', { sessionId });
    });

    client.on('change_state', (state) => {
      logger.info('session state', { sessionId, state });
    });

    client.on('auth_failure', (message) => {
      session.status = 'auth_failure';
      session.readyAt = null;
      logger.error('auth failure', { sessionId, message });
    });

    client.on('ready', () => {
      session.status = 'ready';
      session.readyAt = Date.now();
      session.qrDataUri = null;
      this.reconnectCounts.delete(sessionId);
      logger.info('session ready', { sessionId });
    });

    client.on('disconnected', (reason) => {
      if (this.shuttingDown) return;
      if (this.sessions.get(sessionId) !== session) return;

      session.status = 'disconnected';
      session.readyAt = null;
      session.qrDataUri = null;
      logger.warn('session disconnected', { sessionId, reason });
      this.scheduleReconnect(sessionId, reason);
    });
  }

  clearReconnect(sessionId) {
    const timer = this.reconnectTimers.get(sessionId);
    if (timer) {
      clearTimeout(timer);
      this.reconnectTimers.delete(sessionId);
    }
  }

  scheduleReconnect(sessionId, reason) {
    if (this.shuttingDown) return;
    if (this.reconnectTimers.has(sessionId)) return;

    const count = (this.reconnectCounts.get(sessionId) || 0) + 1;
    if (count > 5) {
      logger.error('session restart gave up', { sessionId, reason });
      return;
    }
    this.reconnectCounts.set(sessionId, count);

    const delay = String(reason).toUpperCase().includes('LOGOUT') ? 2500 : 4000;
    logger.info('scheduling session restart', { sessionId, reason, delay, attempt: count });

    const timer = setTimeout(() => {
      this.reconnectTimers.delete(sessionId);
      if (this.shuttingDown) return;

      this.boot(sessionId, { force: true }).catch((error) => {
        logger.error('session restart failed', { sessionId, message: error.message });
      });
    }, delay);

    this.reconnectTimers.set(sessionId, timer);
  }

  async stop(sessionId, { clearReconnect = true } = {}) {
    if (clearReconnect) this.clearReconnect(sessionId);

    const session = this.sessions.get(sessionId);
    if (!session) return;

    this.sessions.delete(sessionId);

    try {
      await session.client.destroy();
    } catch (_) {
      /* already gone */
    }

    await sleep(500);
    clearStaleLocks(sessionDirFor(config.sessionDir, sessionId));
  }

  async destroy(sessionId) {
    this.clearReconnect(sessionId);
    await this.stop(sessionId);

    const authDir = sessionDirFor(config.sessionDir, sessionId);
    try {
      removeDirSafe(authDir);
    } catch (error) {
      logger.error('failed to remove session folder', { sessionId, message: error.message });
      throw httpError(`Failed to reset session files: ${error.message}`, 503, 'session_reset_failed');
    }
  }

  async autoStartPersistedSessions() {
    if (!config.autoStartSessions) return;

    const sessionIds = new Set(discoverPersistedSessions(config.sessionDir));
    if (config.defaultSession) sessionIds.add(config.defaultSession);

    for (const sessionId of sessionIds) {
      try {
        await this.boot(sessionId);
        logger.info('auto-started persisted session', { sessionId });
      } catch (error) {
        logger.error('failed to auto-start persisted session', {
          sessionId,
          message: error.message,
        });
      }
    }
  }

  async shutdown() {
    this.shuttingDown = true;

    for (const sessionId of this.reconnectTimers.keys()) {
      this.clearReconnect(sessionId);
    }

    await Promise.all(
      [...this.sessions.entries()].map(async ([sessionId, session]) => {
        try {
          await session.client.destroy();
        } catch (_) {
          /* already gone */
        }
        clearStaleLocks(sessionDirFor(config.sessionDir, sessionId));
      }),
    );
    this.sessions.clear();
  }
}

module.exports = new SessionManager();
