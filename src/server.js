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

  const app = createApp();
  const server = app.listen(config.port, config.host, () => {
    logger.info(`listening on http://${config.host}:${config.port}`);
    sessionManager.autoStartPersistedSessions().catch((error) => {
      logger.error('failed to auto-start persisted sessions', { message: error.message });
    });
  });

  function shutdown(signal) {
    logger.info(`caught ${signal}, shutting down`);
    sessionManager.shutdown()
      .finally(() => {
        server.close(() => process.exit(0));
      });
    setTimeout(() => process.exit(1), 10000).unref();
  }

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  return server;
}

module.exports = { start };
