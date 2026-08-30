class HttpError extends Error {
  constructor(message, status = 500, code = 'internal_error') {
    super(message);
    this.name = 'HttpError';
    this.status = status;
    this.code = code;
  }
}

function httpError(message, status, code) {
  return new HttpError(message, status, code);
}

module.exports = { HttpError, httpError };
