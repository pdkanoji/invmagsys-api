const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/rolesController');
const { authenticate, authorize, requirePermission } = require('../middleware/auth');

router.use(authenticate);
router.get('/', authorize('super_admin', 'admin'), requirePermission('roles', 'view'), ctrl.getAll);
router.get('/:id', authorize('super_admin', 'admin'), requirePermission('roles', 'view'), ctrl.getById);
router.post('/', authorize('super_admin'), requirePermission('roles', 'create'), ctrl.create);
router.put('/:id', authorize('super_admin'), requirePermission('roles', 'edit'), ctrl.update);
router.delete('/:id', authorize('super_admin'), requirePermission('roles', 'delete'), ctrl.remove);

module.exports = router;
