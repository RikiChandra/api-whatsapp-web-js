const { Router } = require('express');
const config = require('../config');
const sessionManager = require('../services/sessionManager');
const { normalizeWaId } = require('../lib/waId');
const { serializeMessage } = require('../lib/serialize');
const { buildOutgoingMedia } = require('../lib/media');
const { success } = require('../lib/response');
const { httpError } = require('../errors');
const { asyncHandler } = require('../middleware/errorHandler');
const logger = require('../logger');

function sessionIdFrom(req) {
  return req.params.id || req.body?.session || config.defaultSession;
}

function recipientFrom(body = {}) {
  return normalizeWaId(
    body.to
    || body.phone
    || body.group_id
    || body.groupId
    || body.chat_id
    || body.chatId,
  );
}

function textFrom(body = {}) {
  return body.message ?? body.body ?? '';
}

const router = Router({ mergeParams: true });

router.post('/', asyncHandler(async (req, res) => {
  const sessionId = sessionIdFrom(req);
  const session = sessionManager.requireReady(sessionId);
  const to = recipientFrom(req.body);
  const message = textFrom(req.body);

  if (!to) {
    throw httpError(
      '`to`, `phone`, `group_id`, or `chat_id` is required',
      422,
      'validation_error',
    );
  }
  if (!message) throw httpError('`message` is required', 422, 'validation_error');

  let result;

  try {
    result = await session.client.sendMessage(to, message);
  } catch (error) {
    logger.error('sendMessage text failed', {
      sessionId,
      to,
      message: error.message,
    });
    throw httpError(
      'Failed to send WhatsApp message. Check session status and recipient format.',
      503,
      'message_send_failed',
    );
  }

  success(res, { session: sessionId, message: serializeMessage(result) }, 201);
}));

router.post('/media', asyncHandler(async (req, res) => {
  const sessionId = sessionIdFrom(req);
  const session = sessionManager.requireReady(sessionId);
  const body = req.body || {};
  const to = recipientFrom(body);

  if (!to) {
    throw httpError(
      '`to`, `phone`, `group_id`, or `chat_id` is required',
      422,
      'validation_error',
    );
  }

  const media = await buildOutgoingMedia(body);
  let result;

  try {
    result = await session.client.sendMessage(to, media, {
      caption: body.caption || body.message || undefined,
      sendMediaAsDocument: body.asDocument === true,
      sendMediaAsSticker: body.asSticker === true,
    });
  } catch (error) {
    logger.error('sendMessage media failed', {
      sessionId,
      to,
      message: error.message,
    });
    throw httpError(
      'Failed to send WhatsApp media message. Check session status, recipient, and media payload.',
      503,
      'media_send_failed',
    );
  }

  success(res, { session: sessionId, message: serializeMessage(result) }, 201);
}));

module.exports = router;
