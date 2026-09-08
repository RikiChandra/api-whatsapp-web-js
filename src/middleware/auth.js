const crypto = require('crypto');
const config = require('../config');

function safeEqual(a, b) {
  const left = Buffer.from(String(a));
  const right = Buffer.from(String(b));
  if (left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
}

function extractToken(req) {
  const authorization = String(req.headers.authorization || '').trim();
  if (authorization) {
    const bearer = authorization.match(/^Bearer\s+(.+)$/i);
    return (bearer ? bearer[1] : authorization).trim();
  }

  const headerToken = req.headers['x-api-token'] || req.headers['x-service-token'];
  if (typeof headerToken === 'string' && headerToken.trim()) {
    return headerToken.trim();
  }

  return '';
}

function auth(req, res, next) {
  if (!config.token) {
    if (config.isProduction) {
      return res.status(503).json({
        ok: false,
        error: { code: 'token_missing', message: 'SERVICE_TOKEN is not configured' },
      });
    }
    return next();
  }

  const provided = extractToken(req);
  if (!provided) {
    return res.status(401).json({
      ok: false,
      error: {
        code: 'unauthorized',
        message: 'Missing Authorization: Bearer <SERVICE_TOKEN> header',
      },
    });
  }

  if (!safeEqual(provided, config.token)) {
    return res.status(401).json({
      ok: false,
      error: { code: 'unauthorized', message: 'Unauthorized' },
    });
  }

  return next();
}

module.exports = { auth };
