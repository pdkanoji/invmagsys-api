const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/purchaseReturnController');
const { authenticate, authorize } = require('../middleware/auth');

router.use(authenticate);
router.get('/', ctrl.getAll);
router.get('/:id', ctrl.getById);
router.post('/', authorize('super_admin', 'admin', 'manager'), ctrl.create);
router.patch('/:id/status', authorize('super_admin', 'admin', 'manager'), ctrl.updateStatus);
router.delete('/:id', authorize('super_admin', 'admin'), ctrl.remove);

module.exports = router;
