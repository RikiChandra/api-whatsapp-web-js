const fs = require('fs');
const path = require('path');
const qrcode = require('qrcode');
const { Client, LocalAuth } = require('whatsapp-web.js');
const config = require('../config');
const logger = require('../logger');
const { httpError } = require('../errors');
const { discoverPersistedSessions } = require('./sessionStore');

class SessionManager {
  constructor() {
    this.sessions = new Map();
  }

  list() {
    return [...this.sessions.entries()].map(([id, session]) => ({
      id,
      status: session.status,
    }));
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

  async boot(sessionId) {
    const existing = this.sessions.get(sessionId);
    if (existing) return existing;

    if (!config.chromePath && (process.env.PUPPETEER_EXECUTABLE_PATH || process.env.CHROME_PATH)) {
      logger.warn('configured Chrome path not found, falling back to Puppeteer bundled Chromium');
    }

    const client = new Client({
      authStrategy: new LocalAuth({
        clientId: sessionId,
        dataPath: config.sessionDir,
      }),
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
    };

    this.sessions.set(sessionId, session);
    this.bindEvents(sessionId, session, client);

    client.initialize().catch((error) => {
      session.status = 'error';
      logger.error('session initialize failed', { sessionId, message: error.message });
    });

    return session;
  }

  bindEvents(sessionId, session, client) {
    client.on('qr', async (qr) => {
      session.qrDataUri = await qrcode.toDataURL(qr);
      session.status = 'qr';
    });

    client.on('authenticated', () => {
      session.status = 'authenticated';
      session.readyAt = null;
    });

    client.on('auth_failure', (message) => {
      session.status = 'auth_failure';
      session.readyAt = null;
      logger.error('auth failure', { sessionId, message });
    });

    client.on('ready', () => {
      session.status = 'ready';
      session.readyAt = Date.now();
      logger.info('session ready', { sessionId });
    });

    client.on('disconnected', (reason) => {
      session.status = 'disconnected';
      session.readyAt = null;
      logger.warn('session disconnected', { sessionId, reason });
    });
  }

  async stop(sessionId) {
    const session = this.get(sessionId);
    try {
      await session.client.destroy();
    } catch (_) {
      /* already gone */
    }
    this.sessions.delete(sessionId);
  }

  async destroy(sessionId) {
    const session = this.sessions.get(sessionId);
    if (session) {
      try {
        await session.client.destroy();
      } catch (_) {
        /* already gone */
      }
      this.sessions.delete(sessionId);
    }

    const authDir = path.join(config.sessionDir, `session-${sessionId}`);
    if (fs.existsSync(authDir)) {
      fs.rmSync(authDir, { recursive: true, force: true });
    }
  }

  async autoStartPersistedSessions() {
    if (!config.autoStartSessions) return;

    for (const sessionId of discoverPersistedSessions(config.sessionDir)) {
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
    await Promise.all(
      [...this.sessions.values()].map((session) => session.client.destroy().catch(() => {})),
    );
    this.sessions.clear();
  }
}

module.exports = new SessionManager();
