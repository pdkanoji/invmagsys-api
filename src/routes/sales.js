const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/salesController');
const { authenticate, authorize } = require('../middleware/auth');

router.use(authenticate);
router.get('/', ctrl.getAll);
router.get('/:id/pdf', ctrl.generatePDF);
router.get('/:id/payment-history', ctrl.getPaymentHistory);
router.get('/:id', ctrl.getById);
router.post('/', authorize('super_admin', 'admin', 'manager', 'sales_user'), ctrl.create);
router.patch('/:id/payment', authorize('super_admin', 'admin', 'manager', 'sales_user'), ctrl.recordPayment);
router.delete('/:id', authorize('super_admin', 'admin'), ctrl.remove);

module.exports = router;
