const { Router } = require('express');
const sessionManager = require('../services/sessionManager');
const { success } = require('../lib/response');
const { asyncHandler } = require('../middleware/errorHandler');
const { httpError } = require('../errors');
const { serializeContact, serializeGroup } = require('../lib/serialize');

const router = Router();

router.get('/', (_req, res) => {
  success(res, { sessions: sessionManager.list() });
});

router.get('/:id', (req, res) => {
  const session = sessionManager.get(req.params.id);
  success(res, {
    id: req.params.id,
    status: session.status,
  });
});

router.post('/:id/start', asyncHandler(async (req, res) => {
  await sessionManager.boot(req.params.id);
  const session = await sessionManager.waitForBoot(req.params.id);
  success(res, {
    id: req.params.id,
    status: session.status,
    qr: session.qrDataUri,
  });
}));

router.post('/:id/stop', asyncHandler(async (req, res) => {
  await sessionManager.stop(req.params.id);
  success(res, { id: req.params.id, stopped: true });
}));

router.delete('/:id', asyncHandler(async (req, res) => {
  await sessionManager.destroy(req.params.id);
  success(res, { id: req.params.id, destroyed: true });
}));

router.get('/:id/qr', asyncHandler(async (req, res) => {
  if (!sessionManager.has(req.params.id)) {
    await sessionManager.boot(req.params.id);
  }

  const session = await sessionManager.waitForBoot(req.params.id, 20000);
  success(res, {
    id: req.params.id,
    status: session.status,
    qr: session.qrDataUri,
  });
}));

router.get('/:id/chats', asyncHandler(async (req, res) => {
  sessionManager.requireReady(req.params.id);
  throw httpError(
    'Chat listing is temporarily disabled because whatsapp-web.js getChats is unstable on the current WhatsApp Web build.',
    501,
    'chat_list_disabled',
  );
}));

router.get('/:id/contacts', asyncHandler(async (req, res) => {
  const session = sessionManager.requireReady(req.params.id);
  const contacts = await session.client.getContacts();

  success(res, {
    id: req.params.id,
    contacts: contacts
      .map(serializeContact)
      .filter(Boolean),
  });
}));

router.get('/:id/groups', asyncHandler(async (req, res) => {
  const session = sessionManager.requireReady(req.params.id);

  try {
    const contacts = await session.client.getContacts();

    const groupIds = contacts
      .map((contact) => contact.id?._serialized)
      .filter((id) => typeof id === 'string' && id.endsWith('@g.us'))
      .slice(0, 50);

    const groupResults = await Promise.allSettled(
      groupIds.map((groupId) => session.client.getChatById(groupId)),
    );

    const groups = groupResults
      .map((result, index) => {
        try {
          if (result.status === 'fulfilled' && result.value) {
            return serializeGroup(result.value);
          }
        } catch {
          // fall through to contact fallback below
        }

        const fallbackId = groupIds[index];
        const fallbackContact = contacts.find(
          (contact) => contact.id?._serialized === fallbackId,
        );

        if (!fallbackId) {
          return null;
        }

        return {
          id: fallbackId,
          name: fallbackContact?.name
            ?? fallbackContact?.pushname
            ?? 'Unnamed Group',
          isAnnouncement: false,
          isCommunityLinked: false,
          parentGroupId: null,
          participants: 0,
        };
      })
      .filter(Boolean);

    success(res, {
      id: req.params.id,
      groups,
    });
  } catch (error) {
    const contacts = await session.client.getContacts();

    const groups = contacts
      .map((contact) => contact.id?._serialized)
      .filter((id) => typeof id === 'string' && id.endsWith('@g.us'))
      .slice(0, 50)
      .map((id) => {
        const fallbackContact = contacts.find(
          (contact) => contact.id?._serialized === id,
        );

        return {
          id,
          name: fallbackContact?.name
            ?? fallbackContact?.pushname
            ?? 'Unnamed Group',
          isAnnouncement: false,
          isCommunityLinked: false,
          parentGroupId: null,
          participants: 0,
        };
      });

    success(res, {
      id: req.params.id,
      groups,
      degraded: true,
    });
  }
}));

module.exports = router;
