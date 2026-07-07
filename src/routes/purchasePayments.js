const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/purchasePaymentController');
const { authenticate, authorize } = require('../middleware/auth');

router.use(authenticate);
router.get('/:id/payment-history', ctrl.getPaymentHistory);
router.patch('/:id/payment', authorize('super_admin', 'admin', 'manager'), ctrl.recordPayment);

module.exports = router;
