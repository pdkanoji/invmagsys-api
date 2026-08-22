const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/productController');
const { authenticate, authorize } = require('../middleware/auth');
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
router.get('/import-sample', authorize('super_admin', 'admin', 'manager'), ctrl.exportImportSample);
router.get('/export', ctrl.exportProducts);
router.get('/', ctrl.getAll);
router.get('/:id', ctrl.getById);
router.post('/', authorize('super_admin', 'admin', 'manager'), upload.single('image'), ctrl.create);
router.put('/:id', authorize('super_admin', 'admin', 'manager'), upload.single('image'), ctrl.update);
router.delete('/:id', authorize('super_admin', 'admin'), ctrl.remove);
router.post('/bulk-import', authorize('super_admin', 'admin', 'manager'), upload.single('file'), ctrl.bulkImport);
module.exports = router;
