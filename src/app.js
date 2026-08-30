const express = require('express');
const helmet = require('helmet');
const config = require('./config');
const routes = require('./routes');
const { notFound, errorHandler } = require('./middleware/errorHandler');

function createApp() {
  const app = express();

  app.disable('x-powered-by');
  app.use(helmet({ contentSecurityPolicy: false }));
  app.use(express.json({ limit: config.bodyLimit }));

  app.get('/', (_req, res) => {
    res.json({
      service: 'whatsapp-engine',
      version: '2.0.0',
      docs: {
        health: 'GET /v1/health',
        start: 'POST /v1/sessions/:id/start',
        qr: 'GET /v1/sessions/:id/qr',
        send: 'POST /v1/messages',
        sendGroup: 'POST /v1/messages with group_id=1203...@g.us',
      },
    });
  });

  app.get('/healthz', (_req, res) => {
    res.json({ ok: true });
  });

  app.use('/v1', routes);
  app.use(notFound);
  app.use(errorHandler);

  return app;
}

module.exports = { createApp };
