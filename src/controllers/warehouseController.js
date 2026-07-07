const pool = require('../config/database');
const { successResponse, errorResponse, buildPaginationQuery, generateUniqueCode } = require('../utils/helpers');

const getAll = async (req, res) => {
  try {
    const { page, limit, offset } = buildPaginationQuery(req.query);
    const { rows } = await pool.query(
      'SELECT *, COUNT(*) OVER() AS total_count FROM warehouses WHERE deleted_at IS NULL AND created_by = $3 ORDER BY name LIMIT $1 OFFSET $2',
      [limit, offset, req.user.role_name?.includes('admin') ? req.user.id : req.user.admin_id]
    );
    const total = rows.length > 0 ? parseInt(rows[0].total_count) : 0;
    const data = rows.map(({ total_count, ...r }) => r);
    successResponse(res, data, 'Warehouses fetched', 200, { meta: { total, page, limit } });
  } catch (err) {
    console.error(err);
    errorResponse(res, 'Failed to fetch warehouses', 500);
  }
};

const getById = async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM warehouses WHERE id = $1 AND deleted_at IS NULL AND created_by = $2', [req.params.id, req.user.role_name?.includes('admin') ? req.user.id : req.user.admin_id]);
    if (!rows[0]) return errorResponse(res, 'Warehouse not found', 404);
    successResponse(res, rows[0]);
  } catch (err) {
    console.error(err);
    errorResponse(res, 'Failed to fetch warehouse', 500);
  }
};

const create = async (req, res) => {
  try {
    const code = generateUniqueCode('WH');
    const { name, address, city, state, country, pincode, manager_name, manager_phone, is_active } = req.body;
    const { rows } = await pool.query(
      'INSERT INTO warehouses (code, name, address, city, state, country, pincode, manager_name, manager_phone, is_active, created_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *',
      [code, name, address, city, state, country, pincode, manager_name, manager_phone, is_active !== false, req.user.role_name?.includes('admin') ? req.user.id : req.user.admin_id]
    );
    successResponse(res, rows[0], 'Warehouse created', 201);
  } catch (err) {
    console.error(err); 
    errorResponse(res, 'Failed to create warehouse', 500);
  }
};

const update = async (req, res) => {
  try {
    const { name, address, city, state, country, pincode, manager_name, manager_phone, is_active } = req.body;
    const { rows } = await pool.query(
      'UPDATE warehouses SET name=$1, address=$2, city=$3, state=$4, country=$5, pincode=$6, manager_name=$7, manager_phone=$8, is_active=$9 WHERE id=$10 AND deleted_at IS NULL RETURNING *',
      [name, address, city, state, country, pincode, manager_name, manager_phone, is_active, req.params.id]
    );
    if (!rows[0]) return errorResponse(res, 'Warehouse not found', 404);
    successResponse(res, rows[0], 'Warehouse updated');
  } catch (err) {
    errorResponse(res, 'Failed to update warehouse', 500);
  }
};

const remove = async (req, res) => {
  try {
    const { rows } = await pool.query('UPDATE warehouses SET deleted_at = NOW() WHERE id = $1 AND deleted_at IS NULL RETURNING id', [req.params.id]);
    if (!rows[0]) return errorResponse(res, 'Warehouse not found', 404);
    successResponse(res, null, 'Warehouse deleted');
  } catch (err) {
    errorResponse(res, 'Failed to delete warehouse', 500);
  }
};

const getInventory = async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT i.*, p.id AS prod_id, p.name AS prod_name, p.code AS prod_code, u.abbreviation AS unit_abbr
       FROM inventory i
       LEFT JOIN products p ON p.id = i.product_id
       LEFT JOIN units u ON u.id = p.unit_id
       WHERE i.warehouse_id = $1 AND i.created_by = $2
       ORDER BY i.created_at`,
      [req.params.id, req.user.roles.includes('admin') ? req.user.id : req.user.admin_id]
    );
    const data = rows.map(r => {
      const { prod_id, prod_name, prod_code, unit_abbr, ...rest } = r;
      return { ...rest, product: { id: prod_id, name: prod_name, code: prod_code, unit: { abbreviation: unit_abbr } } };
    });
    successResponse(res, data, 'Warehouse inventory fetched');
  } catch (err) {
    errorResponse(res, 'Failed to fetch warehouse inventory', 500);
  }
};

module.exports = { getAll, getById, create, update, remove, getInventory };
