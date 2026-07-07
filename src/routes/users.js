const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/userController');
const { authenticate, authorize } = require('../middleware/auth');

router.use(authenticate);
router.get('/roles', ctrl.getRoles);
router.get('/', authorize('super_admin', 'admin'), ctrl.getAll);
router.get('/:id', authorize('super_admin', 'admin'), ctrl.getById);
router.post('/admin', authorize('super_admin'), ctrl.createAdmin);
router.post('/subordinate', authorize('admin'), ctrl.createSubordinate);
router.post('/', authorize('super_admin', 'admin'), ctrl.create);
router.put('/:id', authorize('super_admin', 'admin'), ctrl.update);
router.delete('/:id', authorize('super_admin', 'admin'), ctrl.remove);

module.exports = router;
