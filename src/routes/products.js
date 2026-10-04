const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/productController');
const { authenticate, authorize, requirePermission } = require('../middleware/auth');
const upload = require('../middleware/upload');

/**
 * @swagger
 * /products:
 *   get:
 *     summary: Get all products
 *     tags: [Products]
 *     parameters:
 *       - in: query
 *         name: page
 *         schema: { type: integer }
 *       - in: query
 *         name: limit
 *         schema: { type: integer }
 *       - in: query
 *         name: search
 *         schema: { type: string }
 *       - in: query
 *         name: category_id
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Products list
 */
router.use(authenticate);
router.get('/import-sample', authorize('super_admin', 'admin', 'manager'), requirePermission('products', 'view'), ctrl.exportImportSample);
router.get('/export', requirePermission('products', 'view'), ctrl.exportProducts);
router.get('/', requirePermission('products', 'view'), ctrl.getAll);
router.get('/:id', requirePermission('products', 'view'), ctrl.getById);
router.post('/', authorize('super_admin', 'admin', 'manager'), requirePermission('products', 'create'), upload.single('image'), ctrl.create);
router.put('/:id', authorize('super_admin', 'admin', 'manager'), requirePermission('products', 'edit'), upload.single('image'), ctrl.update);
router.delete('/:id', authorize('super_admin', 'admin'), requirePermission('products', 'delete'), ctrl.remove);
router.post('/bulk-import', authorize('super_admin', 'admin', 'manager'), requirePermission('products', 'create'), upload.single('file'), ctrl.bulkImport);
module.exports = router;
