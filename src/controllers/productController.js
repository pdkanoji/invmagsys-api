const pool = require('../config/database');
const { successResponse, errorResponse, buildPaginationQuery, buildSortQuery, generateUniqueCode } = require('../utils/helpers');
const { buildScopeWhere } = require('../middleware/auth');

const getAll = async (req, res) => {
  try {
    const { page, limit, offset } = buildPaginationQuery(req.query);
    const { sortBy, ascending } = buildSortQuery(req.query);
    const { search, is_active, category_id } = req.query;

    const conditions = ['p.deleted_at IS NULL'];
    const params = [];

    if (search) {
      params.push(`%${search}%`);
      conditions.push(`(p.name ILIKE $${params.length} OR p.code ILIKE $${params.length} OR p.brand ILIKE $${params.length})`);
    }
    if (is_active !== undefined) {
      params.push(is_active === 'true');
      conditions.push(`p.is_active = $${params.length}`);
    }
    if (category_id) {
      params.push(category_id);
      conditions.push(`p.category_id = $${params.length}`);
    }

    const scope = buildScopeWhere(req.user, 'p', params, 'created_by');
    if (scope.fragment) {
      params.push(...scope.params.slice(params.length));
      conditions.push(scope.fragment);
    }

    const where = conditions.join(' AND ');
    const order = `p.${sortBy} ${ascending ? 'ASC' : 'DESC'}`;

    params.push(limit, offset);
    const dataQuery = `
      SELECT p.*, c.id AS cat_id, c.name AS cat_name, u.id AS unit_id_ref, u.name AS unit_name, u.abbreviation AS unit_abbr,
             COUNT(*) OVER() AS total_count
      FROM products p
      LEFT JOIN categories c ON c.id = p.category_id
      LEFT JOIN units u ON u.id = p.unit_id
      WHERE ${where}
      ORDER BY ${order}
      LIMIT $${params.length - 1} OFFSET $${params.length}`;

    const { rows } = await pool.query(dataQuery, params);
    const total = rows.length > 0 ? parseInt(rows[0].total_count) : 0;
    const data = rows.map(r => {
      const { total_count, cat_id, cat_name, unit_id_ref, unit_name, unit_abbr, ...rest } = r;
      return { ...rest, category: cat_id ? { id: cat_id, name: cat_name } : null, unit: unit_id_ref ? { id: unit_id_ref, name: unit_name, abbreviation: unit_abbr } : null };
    });

    successResponse(res, data, 'Products fetched', 200, { meta: { total, page, limit, totalPages: Math.ceil(total / limit) } });
  } catch (err) {
    errorResponse(res, 'Failed to fetch products', 500);
  }
};

const getById = async (req, res) => {
  try {
    const params = [req.params.id];
    const scope = buildScopeWhere(req.user, 'p', params, 'created_by');
    const where = `p.id = $1 AND p.deleted_at IS NULL${scope.fragment ? ` AND ${scope.fragment}` : ''}`;
    
    const { rows } = await pool.query(
      `SELECT p.*, c.id AS cat_id, c.name AS cat_name, u.id AS unit_id_ref, u.name AS unit_name, u.abbreviation AS unit_abbr
       FROM products p
       LEFT JOIN categories c ON c.id = p.category_id
       LEFT JOIN units u ON u.id = p.unit_id
       WHERE ${where}`,
      [req.params.id, req.user.role_name.includes('admin') ? req.user.id : req.user.admin_id]
    );
    if (!rows[0]) return errorResponse(res, 'Product not found', 404);
    const { cat_id, cat_name, unit_id_ref, unit_name, unit_abbr, ...rest } = rows[0];
    successResponse(res, { ...rest, category: cat_id ? { id: cat_id, name: cat_name } : null, unit: unit_id_ref ? { id: unit_id_ref, name: unit_name, abbreviation: unit_abbr } : null });
  } catch (err) {
    errorResponse(res, 'Failed to fetch product', 500);
  }
};

const create = async (req, res) => {
  try {
    const code = generateUniqueCode('PRD');
    const { name, brand, description, category_id, unit_id, purchase_price, selling_price, tax_percentage, discount_percentage, reorder_level, is_active } = req.body;
    const image_url = req.file ? `/uploads/${req.file.filename}` : null;

    const { rows } = await pool.query(
      `INSERT INTO products (code, name, brand, description, category_id, unit_id, purchase_price, selling_price, tax_percentage, discount_percentage, reorder_level, is_active, image_url, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING *`,
      [code, name, brand, description, category_id, unit_id, purchase_price, selling_price, tax_percentage || 0, discount_percentage || 0, reorder_level || 0, is_active !== false, image_url,  req.user.role_name.includes('admin') ? req.user.id : req.user.admin_id]
    );
    successResponse(res, rows[0], 'Product created', 201);
  } catch (err) {
    errorResponse(res, 'Failed to create product', 500);
  }
};

const update = async (req, res) => {
  try {
    const { name, brand, description, category_id, unit_id, purchase_price, selling_price, tax_percentage, discount_percentage, reorder_level, is_active } = req.body;
    const image_url = req.file ? `/uploads/${req.file.filename}` : undefined;

    const sets = ['name=$1','brand=$2','description=$3','category_id=$4','unit_id=$5','purchase_price=$6','selling_price=$7','tax_percentage=$8','discount_percentage=$9','reorder_level=$10','is_active=$11'];
    const params = [name, brand, description, category_id, unit_id, purchase_price, selling_price, tax_percentage, discount_percentage, reorder_level, is_active];

    if (image_url !== undefined) {
      sets.push(`image_url=$${params.length + 1}`);
      params.push(image_url);
    }

    params.push(req.params.id);
    const idParamIndex = params.length;
    const scope = buildScopeWhere(req.user, 'products', params, 'created_by');
    if (scope.fragment) {
      params.push(...scope.params.slice(params.length));
    }

    const query = `UPDATE products SET ${sets.join(',')} WHERE id=$${idParamIndex} AND deleted_at IS NULL${scope.fragment ? ` AND ${scope.fragment}` : ''} RETURNING *`;
    const { rows } = await pool.query(query, params);

    if (!rows[0]) return errorResponse(res, 'Product not found or update failed', 404);
    successResponse(res, rows[0], 'Product updated');
  } catch (err) {
    errorResponse(res, 'Failed to update product', 500);
  }
};

const remove = async (req, res) => {
  try {
    const params = [req.params.id];
    const scope = buildScopeWhere(req.user, 'products', params, 'created_by');
    if (scope.fragment) {
      params.push(...scope.params.slice(params.length));
    }

    const query = `UPDATE products SET deleted_at = NOW() WHERE id = $1 AND deleted_at IS NULL${scope.fragment ? ` AND ${scope.fragment}` : ''} RETURNING id`;
    const { rows } = await pool.query(query, params);
    if (!rows[0]) return errorResponse(res, 'Product not found', 404);
    successResponse(res, null, 'Product deleted');
  } catch (err) {
    errorResponse(res, 'Failed to delete product', 500);
  }
};

const bulkImport = async (req, res) => {
  try {
    if (!req.file) return errorResponse(res, 'File required', 400);
    const XLSX = require('xlsx');
    const workbook = XLSX.readFile(req.file.path);
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(sheet);

    const products = rows.map(row => [
      generateUniqueCode('PRD'),
      row['Product Name'] || row.name,
      row['Brand'] || row.brand || null,
      row['Description'] || row.description || null,
      parseFloat(row['Purchase Price'] || row.purchase_price) || 0,
      parseFloat(row['Selling Price'] || row.selling_price) || 0,
      parseFloat(row['Tax %'] || row.tax_percentage) || 0,
      parseFloat(row['Discount %'] || row.discount_percentage) || 0,
      parseInt(row['Reorder Level'] || row.reorder_level) || 0,
    ]);

    let imported = 0;
    for (const p of products) {
      await pool.query(
        'INSERT INTO products (code, name, brand, description, purchase_price, selling_price, tax_percentage, discount_percentage, reorder_level) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)',
        p
      );
      imported++;
    }

    successResponse(res, { imported }, `${imported} products imported`);
  } catch (err) {
    errorResponse(res, 'Import failed', 500);
  }
};

const exportProducts = async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT p.*, c.name AS category_name, u.abbreviation AS unit_abbr
       FROM products p
       LEFT JOIN categories c ON c.id = p.category_id
       LEFT JOIN units u ON u.id = p.unit_id
       WHERE p.deleted_at IS NULL`
    );

    const XLSX = require('xlsx');
    const exportData = rows.map(p => ({
      Code: p.code,
      Name: p.name,
      Category: p.category_name || '',
      Brand: p.brand || '',
      Unit: p.unit_abbr || '',
      'Purchase Price': p.purchase_price,
      'Selling Price': p.selling_price,
      'Tax %': p.tax_percentage,
      'Discount %': p.discount_percentage,
      'Reorder Level': p.reorder_level,
    }));

    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Products');
    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

    res.setHeader('Content-Disposition', 'attachment; filename="products.xlsx"');
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.send(buffer);
  } catch (err) {
    errorResponse(res, 'Export failed', 500);
  }
};

module.exports = { getAll, getById, create, update, remove, bulkImport, exportProducts };
