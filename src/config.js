const fs = require('fs');
const path = require('path');

function envBool(value, fallback = false) {
  if (value === undefined || value === null || value === '') return fallback;
  return !['0', 'false', 'no', 'off'].includes(String(value).toLowerCase());
}

function existingFile(filePath) {
  if (!filePath) return undefined;
  try {
    return fs.existsSync(filePath) ? filePath : undefined;
  } catch (_) {
    return undefined;
  }
}

const nodeEnv = process.env.NODE_ENV || 'development';
const isProduction = nodeEnv === 'production';

module.exports = {
  nodeEnv,
  isProduction,
  host: process.env.HOST || '127.0.0.1',
  port: parseInt(process.env.PORT || '3000', 10),
  token: process.env.SERVICE_TOKEN || process.env.API_TOKEN || process.env.SIDECAR_TOKEN || '',
  defaultSession: process.env.DEFAULT_SESSION || 'main',
  sessionDir: process.env.SESSION_DIR || path.join(process.cwd(), 'sessions'),
  pidFile: process.env.PID_FILE || process.env.SIDECAR_PID_FILE || '',
  autoStartSessions: envBool(process.env.AUTO_START_SESSIONS, true),
  chromePath: existingFile(process.env.PUPPETEER_EXECUTABLE_PATH || process.env.CHROME_PATH),
  bodyLimit: process.env.BODY_LIMIT || '50mb',
};
