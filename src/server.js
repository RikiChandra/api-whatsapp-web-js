const fs = require('fs');
const path = require('path');
const config = require('./config');
const logger = require('./logger');
const { createApp } = require('./app');
const sessionManager = require('./services/sessionManager');

function writePidFile() {
  if (!config.pidFile) return;

  try {
    fs.mkdirSync(path.dirname(config.pidFile), { recursive: true });
    fs.writeFileSync(config.pidFile, String(process.pid));
  } catch (error) {
    logger.error('failed to write PID file', { message: error.message });
  }
}

function start() {
  if (config.isProduction && !config.token) {
    logger.error('SERVICE_TOKEN is required in production');
    process.exit(1);
  }

  fs.mkdirSync(config.sessionDir, { recursive: true });
  writePidFile();

  process.on('unhandledRejection', (reason) => {
    logger.error('unhandled rejection', { message: String(reason?.message || reason) });
  });

  process.on('uncaughtException', (error) => {
    logger.error('uncaught exception', { message: error.message });
    const recoverable = /EBUSY|detached Frame|Execution context was destroyed/i.test(error.message || '');
    if (!recoverable) {
      process.exit(1);
    }
  });

  const app = createApp();
  const server = app.listen(config.port, config.host, () => {
    logger.info(`listening on http://${config.host}:${config.port}`);
    sessionManager.autoStartPersistedSessions().catch((error) => {
      logger.error('failed to auto-start persisted sessions', { message: error.message });
    });
  });

  let shuttingDown = false;
  function shutdown(signal) {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info(`caught ${signal}, shutting down`);
    sessionManager.shutdown()
      .finally(() => {
        server.close(() => process.exit(0));
      });
    setTimeout(() => process.exit(1), 15000).unref();
  }

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGHUP', () => shutdown('SIGHUP'));

  return server;
}

module.exports = { start };
