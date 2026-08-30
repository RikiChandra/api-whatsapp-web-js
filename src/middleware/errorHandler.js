const { HttpError } = require('../errors');
const logger = require('../logger');

function asyncHandler(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

function notFound(_req, res) {
  res.status(404).json({
    ok: false,
    error: { code: 'not_found', message: 'Not found' },
  });
}

function errorHandler(err, _req, res, _next) {
  const status = err instanceof HttpError ? err.status : (err.status || err.http || 500);
  const message = err.message || 'Internal error';
  const code = err.code || (status >= 500 ? 'internal_error' : 'request_error');

  if (status >= 500) {
    logger.error(message, { stack: err.stack });
  }

  res.status(status).json({
    ok: false,
    error: { code, message },
  });
}

module.exports = { asyncHandler, notFound, errorHandler };
