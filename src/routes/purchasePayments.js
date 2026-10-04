const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/purchasePaymentController');
const { authenticate, authorize, requirePermission } = require('../middleware/auth');

router.use(authenticate);
router.get('/:id/payment-history', requirePermission('purchases', 'view'), ctrl.getPaymentHistory);
router.patch('/:id/payment', authorize('super_admin', 'admin', 'manager'), requirePermission('purchases', 'edit'), ctrl.recordPayment);

module.exports = router;
