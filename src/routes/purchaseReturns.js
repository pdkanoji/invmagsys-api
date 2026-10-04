const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/purchaseReturnController');
const { authenticate, authorize, requirePermission } = require('../middleware/auth');

router.use(authenticate);
router.get('/', requirePermission('purchase_returns', 'view'), ctrl.getAll);
router.get('/:id', requirePermission('purchase_returns', 'view'), ctrl.getById);
router.post('/', authorize('super_admin', 'admin', 'manager'), requirePermission('purchase_returns', 'create'), ctrl.create);
router.patch('/:id/status', authorize('super_admin', 'admin', 'manager'), requirePermission('purchase_returns', 'edit'), ctrl.updateStatus);
router.delete('/:id', authorize('super_admin', 'admin'), requirePermission('purchase_returns', 'delete'), ctrl.remove);

module.exports = router;
