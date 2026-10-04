const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/userController');
const { authenticate, authorize, requirePermission } = require('../middleware/auth');

router.use(authenticate);
router.get('/roles', requirePermission('users', 'view'), ctrl.getRoles);
router.get('/', authorize('super_admin', 'admin'), requirePermission('users', 'view'), ctrl.getAll);
router.get('/:id', authorize('super_admin', 'admin'), requirePermission('users', 'view'), ctrl.getById);
router.post('/admin', authorize('super_admin'), requirePermission('users', 'create'), ctrl.createAdmin);
router.post('/subordinate', authorize('admin'), requirePermission('users', 'create'), ctrl.createSubordinate);
router.post('/', authorize('super_admin', 'admin'), requirePermission('users', 'create'), ctrl.create);
router.put('/:id', authorize('super_admin', 'admin'), requirePermission('users', 'edit'), ctrl.update);
router.delete('/:id', authorize('super_admin', 'admin'), requirePermission('users', 'delete'), ctrl.remove);

module.exports = router;
