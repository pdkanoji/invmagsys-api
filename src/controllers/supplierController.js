const pool = require('../config/database');
const { successResponse, errorResponse, buildPaginationQuery, buildSortQuery, generateUniqueCode } = require('../utils/helpers');
const { buildScopeWhere } = require('../middleware/auth');

const getAll = async (req, res) => {
  try {
    const { page, limit, offset } = buildPaginationQuery(req.query);
    const { sortBy, ascending } = buildSortQuery(req.query);
    const { search, is_active } = req.query;

    const conditions = ['deleted_at IS NULL'];
    const params = [];

    if (search) {
      params.push(`%${search}%`);
      conditions.push(`(name ILIKE $${params.length} OR email ILIKE $${params.length} OR mobile ILIKE $${params.length} OR gst_number ILIKE $${params.length})`);
    }
    if (is_active !== undefined) {
      params.push(is_active === 'true');
      conditions.push(`is_active = $${params.length}`);
    }

    const scope = buildScopeWhere(req.user, 's', params, 'created_by');
    if (scope.fragment) {
      params.push(...scope.params.slice(params.length));
      conditions.push(scope.fragment);
    }

    params.push(limit, offset);

    const query = `SELECT *, COUNT(*) OVER() AS total_count FROM suppliers s WHERE ${conditions.join(' AND ')} 
                 ORDER BY ${sortBy} ${ascending ? 'ASC' : 'DESC'} LIMIT $${params.length - 1} OFFSET $${params.length}`;
    
    const { rows } = await pool.query(query,params);
    const total = rows.length > 0 ? parseInt(rows[0].total_count) : 0;
    const data = rows.map(({ total_count, ...r }) => r);
    successResponse(res, data, 'Suppliers fetched', 200, { meta: { total, page, limit, totalPages: Math.ceil(total / limit) } });
  } catch (err) {
    console.log(err);
    errorResponse(res, 'Failed to fetch suppliers', 500);
  }
};

const getById = async (req, res) => {
  try {
    const params = [req.params.id];
    const scope = buildScopeWhere(req.user, 's', params, 'created_by');
    const where = `s.id = $1 AND s.deleted_at IS NULL${scope.fragment ? ` AND ${scope.fragment}` : ''}`;
    const { rows } = await pool.query(`SELECT * FROM suppliers s WHERE ${where}`, params);
    if (!rows[0]) return errorResponse(res, 'Supplier not found', 404);
    successResponse(res, rows[0]);
  } catch (err) {
    errorResponse(res, 'Failed to fetch supplier', 500);
  }
};

const create = async (req, res) => {
  try {
    const code = generateUniqueCode('SUP');
    const { name, email, mobile, phone, address, city, state, country, pincode, gst_number, pan_number, bank_name, bank_account, bank_ifsc, credit_limit, payment_terms, notes } = req.body;
    const { rows } = await pool.query(
      `INSERT INTO suppliers (code, name, email, mobile, phone, address, city, state, country, pincode, gst_number, pan_number, bank_name, bank_account, bank_ifsc, credit_limit, payment_terms, notes, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19) RETURNING *`,
      [code, name, email, mobile, phone, address, city, state, country, pincode, gst_number, pan_number, bank_name, bank_account, bank_ifsc, credit_limit, payment_terms, notes,  req.user.role_name.includes('admin') ? req.user.id : req.user.admin_id]
    );
    successResponse(res, rows[0], 'Supplier created', 201);
  } catch (err) {
    console.error(err);
    errorResponse(res, 'Failed to create supplier', 500);
  }
};

const update = async (req, res) => {
  try {
    const { name, email, mobile, phone, address, city, state, country, pincode, gst_number, pan_number, bank_name, bank_account, bank_ifsc, credit_limit, payment_terms, notes, is_active } = req.body;
    const { rows } = await pool.query(
      `UPDATE suppliers SET name=$1, email=$2, mobile=$3, phone=$4, address=$5, city=$6, state=$7, country=$8, pincode=$9,
       gst_number=$10, pan_number=$11, bank_name=$12, bank_account=$13, bank_ifsc=$14, credit_limit=$15, payment_terms=$16, notes=$17, is_active=$18
       WHERE id=$19 AND deleted_at IS NULL RETURNING *`,
      [name, email, mobile, phone, address, city, state, country, pincode, gst_number, pan_number, bank_name, bank_account, bank_ifsc, credit_limit, payment_terms, notes, is_active, req.params.id]
    );
    if (!rows[0]) return errorResponse(res, 'Supplier not found', 404);
    successResponse(res, rows[0], 'Supplier updated');
  } catch (err) {
    errorResponse(res, 'Failed to update supplier', 500);
  }
};

const remove = async (req, res) => {
  try {
    const { rows } = await pool.query('UPDATE suppliers SET deleted_at = NOW() WHERE id = $1 AND deleted_at IS NULL RETURNING id', [req.params.id]);
    if (!rows[0]) return errorResponse(res, 'Supplier not found', 404);
    successResponse(res, null, 'Supplier deleted');
  } catch (err) {
    errorResponse(res, 'Failed to delete supplier', 500);
  }
};

module.exports = { getAll, getById, create, update, remove };
