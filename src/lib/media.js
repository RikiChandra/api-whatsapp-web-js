const { MessageMedia } = require('whatsapp-web.js');
const { httpError } = require('../errors');

async function buildOutgoingMedia({ url, base64, mimeType, filename } = {}) {
  if (url) {
    return MessageMedia.fromUrl(url, { unsafeMime: true });
  }

  if (base64) {
    return new MessageMedia(mimeType || 'application/octet-stream', base64, filename);
  }

  throw httpError('media requires `url` or `base64`', 400);
}

function withTimeout(promise, ms) {
  return Promise.race([
    promise.catch(() => null),
    new Promise((resolve) => setTimeout(() => resolve(null), ms)),
  ]);
}

module.exports = { buildOutgoingMedia, withTimeout };
