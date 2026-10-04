const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/saleReturnController');
const { authenticate, authorize, requirePermission } = require('../middleware/auth');

router.use(authenticate);
router.get('/', requirePermission('sale_returns', 'view'), ctrl.getAll);
router.get('/:id', requirePermission('sale_returns', 'view'), ctrl.getById);
router.post('/', authorize('super_admin', 'admin', 'manager', 'sales_user'), requirePermission('sale_returns', 'create'), ctrl.create);
router.patch('/:id/status', authorize('super_admin', 'admin', 'manager'), requirePermission('sale_returns', 'edit'), ctrl.updateStatus);
router.delete('/:id', authorize('super_admin', 'admin'), requirePermission('sale_returns', 'delete'), ctrl.remove);

module.exports = router;
