const pool = require('../config/database');
const { successResponse, errorResponse, buildPaginationQuery, buildSortQuery, generateUniqueCode } = require('../utils/helpers');
const { buildScopeWhere } = require('../middleware/auth');

const getAll = async (req, res) => {
  try {
    const { page, limit, offset } = buildPaginationQuery(req.query);
    const { sortBy, ascending } = buildSortQuery(req.query);
    const { search, is_active } = req.query;

    const conditions = ['c.deleted_at IS NULL'];
    const params = [];

    if (search) {
      params.push(`%${search}%`);
      conditions.push(`c.name ILIKE $${params.length}`);
    }
    if (is_active !== undefined) {
      params.push(is_active === 'true');
      conditions.push(`c.is_active = $${params.length}`);
    }

    const scope = buildScopeWhere(req.user, 'c', params, 'created_by');
    if (scope.fragment) {
      params.push(...scope.params.slice(params.length));
      conditions.push(scope.fragment);
    }

    const where = conditions.join(' AND ');
    params.push(limit, offset);

    const { rows } = await pool.query(
      `SELECT c.*, p.id AS parent_id_ref, p.name AS parent_name, COUNT(*) OVER() AS total_count
       FROM categories c
       LEFT JOIN categories p ON p.id = c.parent_id
       WHERE ${where}
       ORDER BY c.${sortBy} ${ascending ? 'ASC' : 'DESC'}
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );

    const total = rows.length > 0 ? parseInt(rows[0].total_count) : 0;
    const data = rows.map(r => {
      const { total_count, parent_id_ref, parent_name, ...rest } = r;
      return { ...rest, parent: parent_id_ref ? { id: parent_id_ref, name: parent_name } : null };
    });

    successResponse(res, data, 'Categories fetched', 200, { meta: { total, page, limit, totalPages: Math.ceil(total / limit) } });
  } catch (err) {
    errorResponse(res, 'Failed to fetch categories', 500);
  }
};

const getById = async (req, res) => {
  try {
    const params = [req.params.id];
    const scope = buildScopeWhere(req.user, 'c', params, 'created_by');
    const where = `c.id = $1 AND c.deleted_at IS NULL${scope.fragment ? ` AND ${scope.fragment}` : ''}`;
    const { rows } = await pool.query(
      `SELECT c.*, p.id AS parent_id_ref, p.name AS parent_name
       FROM categories c
       LEFT JOIN categories p ON p.id = c.parent_id
       WHERE ${where}`,
      params
    );
    if (!rows[0]) return errorResponse(res, 'Category not found', 404);
    const { parent_id_ref, parent_name, ...rest } = rows[0];
    successResponse(res, { ...rest, parent: parent_id_ref ? { id: parent_id_ref, name: parent_name } : null });
  } catch (err) {
    errorResponse(res, 'Failed to fetch category', 500);
  }
};

const create = async (req, res) => {
  try {
    const { name, description, parent_id, image_url } = req.body;
    const code = generateUniqueCode('CAT');
    const { rows } = await pool.query(
      'INSERT INTO categories (name, code, description, parent_id, image_url, created_by) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *',
      [name, code, description, parent_id || null, image_url || null, req.user.role_name.includes('admin') ? req.user.id : req.user.admin_id]
    );
    successResponse(res, rows[0], 'Category created', 201);
  } catch (err) {
    errorResponse(res, 'Failed to create category', 500);
  }
};

const update = async (req, res) => {
  try {
    const { name, description, parent_id, image_url, is_active } = req.body;
    const { rows } = await pool.query(
      'UPDATE categories SET name=$1, description=$2, parent_id=$3, image_url=$4, is_active=$5 WHERE id=$6 AND deleted_at IS NULL RETURNING *',
      [name, description, parent_id || null, image_url || null, is_active, req.params.id]
    );
    if (!rows[0]) return errorResponse(res, 'Category not found or update failed', 404);
    successResponse(res, rows[0], 'Category updated');
  } catch (err) {
    errorResponse(res, 'Failed to update category', 500);
  }
};

const remove = async (req, res) => {
  try {
    const { rows } = await pool.query(
      'UPDATE categories SET deleted_at = NOW() WHERE id = $1 AND deleted_at IS NULL RETURNING id',
      [req.params.id]
    );
    if (!rows[0]) return errorResponse(res, 'Category not found', 404);
    successResponse(res, null, 'Category deleted');
  } catch (err) {
    errorResponse(res, 'Failed to delete category', 500);
  }
};

module.exports = { getAll, getById, create, update, remove };
