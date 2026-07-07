const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/auditLogController');
const { authenticate, authorize } = require('../middleware/auth');
router.use(authenticate, authorize('super_admin', 'admin'));
router.get('/', ctrl.getAll);
module.exports = router;
