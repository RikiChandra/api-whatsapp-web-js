const { Router } = require('express');
const sessionManager = require('../services/sessionManager');
const { success } = require('../lib/response');

const router = Router();

router.get('/health', (_req, res) => {
  success(res, {
    sessions: sessionManager.list(),
    uptime: process.uptime(),
  });
});

module.exports = router;
