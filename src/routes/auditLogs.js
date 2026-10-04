const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/auditLogController');
const { authenticate, authorize, requirePermission } = require('../middleware/auth');
router.use(authenticate, authorize('super_admin', 'admin'));
router.get('/', requirePermission('audit_logs', 'view'), ctrl.getAll);
module.exports = router;
