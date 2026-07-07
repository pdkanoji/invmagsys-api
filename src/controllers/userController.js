const pool = require('../config/database');
const bcrypt = require('bcryptjs');
const { successResponse, errorResponse, buildPaginationQuery } = require('../utils/helpers');
const { buildScopeWhere } = require('../middleware/auth');

const getAll = async (req, res) => {
  try {
    const { page, limit, offset } = buildPaginationQuery(req.query);
    const { search } = req.query;

    const baseParams = [];
    const conditions = ['u.deleted_at IS NULL'];

    if (search) {
      baseParams.push(`%${search}%`);
      conditions.push(`(u.first_name ILIKE $${baseParams.length} OR u.last_name ILIKE $${baseParams.length} OR u.email ILIKE $${baseParams.length})`);
    }

    const { fragment, params } = buildScopeWhere(req.user, 'u', baseParams);
    if (fragment) conditions.push(fragment);

    params.push(limit, offset);

    const query = `SELECT u.id, u.email, u.first_name, u.last_name, u.phone, u.avatar_url, u.is_active,
              u.last_login_at, u.created_at, u.admin_id,
              r.id AS role_id, r.name AS role_name,
              adm.first_name AS admin_first, adm.last_name AS admin_last,
              COUNT(*) OVER() AS total_count
       FROM users u
       LEFT JOIN roles r ON r.id = u.role_id
       LEFT JOIN users adm ON adm.id = u.admin_id
       WHERE ${conditions.join(' AND ')}
       ORDER BY u.created_at DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`;

    const { rows } = await pool.query(query, params);

    const total = rows.length > 0 ? parseInt(rows[0].total_count) : 0;
    const data = rows.map(r => {
      const { total_count, role_id, role_name, admin_first, admin_last, ...rest } = r;
      return {
        ...rest,
        roles: role_id ? { id: role_id, name: role_name } : null,
        admin: admin_first ? { first_name: admin_first, last_name: admin_last } : null,
      };
    });

    successResponse(res, data, 'Users fetched', 200, { meta: { total, page, limit } });
  } catch (err) {
    console.log(err)
    errorResponse(res, 'Failed to fetch users', 500);
  }
};

const getById = async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT u.id, u.email, u.first_name, u.last_name, u.phone, u.avatar_url, u.is_active,
              u.last_login_at, u.created_at, u.admin_id,
              r.id AS role_id, r.name AS role_name
       FROM users u
       LEFT JOIN roles r ON r.id = u.role_id
       WHERE u.id = $1 AND u.deleted_at IS NULL`,
      [req.params.id]
    );
    if (!rows[0]) return errorResponse(res, 'User not found', 404);

    const requesterRole = req.user.roles?.name;
    if (requesterRole !== 'super_admin') {
      const adminId = requesterRole === 'admin' ? req.user.id : req.user.admin_id;
      if (rows[0].admin_id !== adminId && rows[0].id !== adminId) {
        return errorResponse(res, 'User not found', 404);
      }
    }

    const { role_id, role_name, ...rest } = rows[0];
    successResponse(res, { ...rest, roles: role_id ? { id: role_id, name: role_name } : null });
  } catch (err) {
    errorResponse(res, 'Failed to fetch user', 500);
  }
};

const create = async (req, res) => {
  try {
    const { email, password, first_name, last_name, phone, role_id, is_active } = req.body;

    if (!email || !password || !first_name || !last_name || !role_id) {
      return errorResponse(res, 'Name, email, password, and role are required', 400);
    }
    if (password.length < 8) return errorResponse(res, 'Password must be at least 8 characters', 400);

    const { rows: existing } = await pool.query('SELECT id FROM users WHERE email = $1 AND deleted_at IS NULL', [email.toLowerCase()]);
    if (existing[0]) return errorResponse(res, 'Email already exists', 400);

    const password_hash = await bcrypt.hash(password, 12);
    const { rows } = await pool.query(
      'INSERT INTO users (email, password_hash, first_name, last_name, phone, role_id, is_active,admin_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id, email, first_name, last_name, phone, is_active, created_at',
      [email.toLowerCase(), password_hash, first_name, last_name, phone || null, role_id, is_active !== false,req.user.id]
    );
    successResponse(res, rows[0], 'User created', 201);
  } catch (err) {
    console.log(err)
    errorResponse(res, 'Failed to create user', 500);
  }
};

const createAdmin = async (req, res) => {
  try {
    const { email, password, first_name, last_name, phone, role_id } = req.body;

    if (!email || !password || !first_name || !last_name || !role_id) {
      return errorResponse(res, 'Name, email, password, and role are required', 400);
    }
    if (password.length < 8) return errorResponse(res, 'Password must be at least 8 characters', 400);

    const { rows: existing } = await pool.query('SELECT id FROM users WHERE email = $1 AND deleted_at IS NULL', [email.toLowerCase()]);
    if (existing[0]) return errorResponse(res, 'Email already exists', 400);

    const password_hash = await bcrypt.hash(password, 12);
    const { rows } = await pool.query(
      'INSERT INTO users (email, password_hash, first_name, last_name, phone, role_id, created_by) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id, email, first_name, last_name, phone, is_active, created_at',
      [email.toLowerCase(), password_hash, first_name, last_name, phone || null, role_id, req.user.id]
    );
    successResponse(res, rows[0], 'Admin user created', 201);
  } catch (err) {
    errorResponse(res, 'Failed to create admin user', 500);
  }
};

const createSubordinate = async (req, res) => {
  try {
    const { email, password, first_name, last_name, phone, role_id } = req.body;

    if (!email || !password || !first_name || !last_name || !role_id) {
      return errorResponse(res, 'Name, email, password, and role are required', 400);
    }
    if (password.length < 8) return errorResponse(res, 'Password must be at least 8 characters', 400);

    const { rows: existing } = await pool.query('SELECT id FROM users WHERE email = $1 AND deleted_at IS NULL', [email.toLowerCase()]);
    if (existing[0]) return errorResponse(res, 'Email already exists', 400);

    const password_hash = await bcrypt.hash(password, 12);
    const { rows } = await pool.query(
      'INSERT INTO users (email, password_hash, first_name, last_name, phone, role_id, admin_id, created_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id, email, first_name, last_name, phone, is_active, created_at, admin_id',
      [email.toLowerCase(), password_hash, first_name, last_name, phone || null, role_id, req.user.id, req.user.id]
    );
    successResponse(res, rows[0], 'Subordinate user created', 201);
  } catch (err) {
    errorResponse(res, 'Failed to create subordinate user', 500);
  }
};

const update = async (req, res) => {
  try {
    const { first_name, last_name, phone, role_id, is_active } = req.body;

    const requesterRole = req.user.roles?.name;
    if (requesterRole !== 'super_admin') {
      const adminId = requesterRole === 'admin' ? req.user.id : req.user.admin_id;
      const { rows: target } = await pool.query('SELECT admin_id FROM users WHERE id = $1 AND deleted_at IS NULL', [req.params.id]);
      if (!target[0] || target[0].admin_id !== adminId) {
        return errorResponse(res, 'Forbidden - cannot modify this user', 403);
      }
    }

    const { rows } = await pool.query(
      `UPDATE users SET first_name=$1, last_name=$2, phone=$3, role_id=$4, is_active=$5, updated_at=NOW()
       WHERE id=$6 AND deleted_at IS NULL
       RETURNING id, email, first_name, last_name, phone, is_active, role_id`,
      [first_name, last_name, phone || null, role_id, is_active, req.params.id]
    );
    if (!rows[0]) return errorResponse(res, 'User not found', 404);

    const { rows: roleRows } = await pool.query('SELECT id, name FROM roles WHERE id = $1', [rows[0].role_id]);
    successResponse(res, { ...rows[0], roles: roleRows[0] || null }, 'User updated');
  } catch (err) {
    errorResponse(res, 'Failed to update user', 500);
  }
};

const remove = async (req, res) => {
  try {
    if (req.params.id === req.user.id) return errorResponse(res, 'Cannot delete your own account', 400);

    const requesterRole = req.user.roles?.name;
    if (requesterRole !== 'super_admin') {
      const adminId = requesterRole === 'admin' ? req.user.id : req.user.admin_id;
      const { rows: target } = await pool.query('SELECT admin_id FROM users WHERE id = $1 AND deleted_at IS NULL', [req.params.id]);
      if (!target[0] || target[0].admin_id !== adminId) {
        return errorResponse(res, 'Forbidden - cannot delete this user', 403);
      }
    }

    const { rows } = await pool.query('UPDATE users SET deleted_at = NOW() WHERE id = $1 AND deleted_at IS NULL RETURNING id', [req.params.id]);
    if (!rows[0]) return errorResponse(res, 'User not found', 404);
    successResponse(res, null, 'User deleted');
  } catch (err) {
    errorResponse(res, 'Failed to delete user', 500);
  }
};

const getRoles = async (req, res) => {
  try {
    let query = `SELECT id, name, description FROM roles`;
    let params = [];

    // Hide Super Admin and Admin roles for Admin users
    if (req.user.roles?.name.toLowerCase() === 'admin') {
      query += ` WHERE LOWER(name) NOT IN ('super_admin', 'admin')`;
    }
    query += ` ORDER BY name`;
    
    const { rows } = await pool.query(query, params);
    successResponse(res, rows, 'Roles fetched');
  } catch (err) {
    
    errorResponse(res, 'Failed to fetch roles', 500);
  }
};

module.exports = { getAll, getById, create, createAdmin, createSubordinate, update, remove, getRoles };
