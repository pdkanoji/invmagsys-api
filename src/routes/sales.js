const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/salesController');
const { authenticate, authorize, requirePermission } = require('../middleware/auth');

router.use(authenticate);
router.get('/', requirePermission('sales', 'view'), ctrl.getAll);
router.get('/last-price', authorize('super_admin', 'admin', 'manager', 'sales_user'), requirePermission('sales', 'view'), ctrl.getLastPrice);
router.get('/:id/pdf', requirePermission('sales', 'view'), ctrl.generatePDF);
router.get('/:id/payment-history', authorize('super_admin', 'admin', 'manager', 'sales_user'), requirePermission('sales', 'view'), ctrl.getPaymentHistory);
router.get('/:id', requirePermission('sales', 'view'), ctrl.getById);
router.post('/', authorize('super_admin', 'admin', 'manager', 'sales_user'), requirePermission('sales', 'create'), ctrl.create);
router.patch('/:id/payment', authorize('super_admin', 'admin', 'manager', 'sales_user'), requirePermission('sales', 'edit'), ctrl.recordPayment);
router.patch('/:id/status', authorize('super_admin', 'admin', 'manager', 'sales_user'), requirePermission('sales', 'edit'), ctrl.updateStatus);
router.delete('/:id', authorize('super_admin', 'admin'), requirePermission('sales', 'delete'), ctrl.remove);

module.exports = router;
