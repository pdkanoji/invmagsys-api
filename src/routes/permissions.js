const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/permissionsController');
const { authenticate, authorize } = require('../middleware/auth');

router.use(authenticate);
router.get('/my-permissions', ctrl.getMyPermissions);
router.get('/', authorize('super_admin', 'admin'), ctrl.getAll);
router.put('/:roleName/:module', authorize('super_admin', 'admin'), ctrl.update);

module.exports = router;
