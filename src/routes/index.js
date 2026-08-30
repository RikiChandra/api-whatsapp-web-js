const { Router } = require('express');
const { auth } = require('../middleware/auth');
const healthRoutes = require('./health');
const sessionRoutes = require('./sessions');
const messageRoutes = require('./messages');

const router = Router();

router.use(auth);
router.use(healthRoutes);
router.use('/sessions', sessionRoutes);
router.use('/sessions/:id/messages', messageRoutes);
router.use('/messages', messageRoutes);

module.exports = router;
