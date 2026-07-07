const pool = require('../config/database');
const { successResponse, errorResponse, buildPaginationQuery, buildSortQuery } = require('../utils/helpers');

/**
 * Build a scope WHERE clause based on the requesting user's role.
 * Returns { conditions: string[], params: any[] } that can be merged into existing queries.
 *
 * Hierarchy:
 *   super_admin → no filter
 *   admin       → created_by = adminId OR created_by IN (subordinates of adminId)
 *   others      → created_by = parentAdminId OR created_by IN (subordinates of parentAdminId)
 */
function buildScopeClause(user, tableAlias = 'r') {
  const role = user.roles?.name;
  if (role === 'super_admin') return { conditions: [], params: [] };

  const adminId = role === 'admin' ? user.id : user.admin_id;
  if (!adminId) return { conditions: ['1=0'], params: [] };

  return {
    conditions: [`(${tableAlias}.created_by = $SCOPE OR ${tableAlias}.created_by IN (SELECT id FROM users WHERE admin_id = $SCOPE))`],
    adminId,
  };
}

const getAll = async (req, res) => {
  try {
    const { page, limit, offset } = buildPaginationQuery(req.query);
    const { sortBy, ascending } = buildSortQuery(req.query, 'created_at');
    const { search } = req.query;

    const conditions = [];
    const params = [];

    if (search) {
      params.push(`%${search}%`);
      conditions.push(`(r.name ILIKE $${params.length} OR r.description ILIKE $${params.length})`);
    }

    const scope = buildScopeClause(req.user, 'r');
    if (scope.conditions?.length) {
      params.push(scope.adminId);
      const scopeCondition = scope.conditions[0].replace(/\$SCOPE/g, `$${params.length}`);
      conditions.push(scopeCondition);
    }

    const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    params.push(limit, offset);

    const { rows } = await pool.query(
      `SELECT r.id, r.name, r.description, r.created_at, r.updated_at,
              u.first_name AS creator_first, u.last_name AS creator_last,
              COUNT(*) OVER() AS total_count
       FROM roles r
       LEFT JOIN users u ON u.id = r.created_by
       ${whereClause}
       ORDER BY r.${sortBy} ${ascending ? 'ASC' : 'DESC'}
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );

    const total = rows.length > 0 ? parseInt(rows[0].total_count) : 0;
    const data = rows.map(({ total_count, creator_first, creator_last, ...r }) => ({
      ...r,
      created_by_user: creator_first ? { first_name: creator_first, last_name: creator_last } : null,
    }));

    successResponse(res, data, 'Roles fetched', 200, { meta: { total, page, limit, totalPages: Math.ceil(total / limit) } });
  } catch (err) {
    errorResponse(res, 'Failed to fetch roles', 500);
  }
};

const getById = async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT r.id, r.name, r.description, r.created_at, r.updated_at,
              u.first_name AS creator_first, u.last_name AS creator_last
       FROM roles r
       LEFT JOIN users u ON u.id = r.created_by
       WHERE r.id = $1`,
      [req.params.id]
    );
    if (!rows[0]) return errorResponse(res, 'Role not found', 404);

    // Scope check for non-super_admin
    const role = req.user.roles?.name;
    if (role !== 'super_admin' && rows[0].created_by) {
      const adminId = role === 'admin' ? req.user.id : req.user.admin_id;
      const { rows: scopeCheck } = await pool.query(
        `SELECT 1 FROM roles WHERE id = $1 AND (created_by = $2 OR created_by IN (SELECT id FROM users WHERE admin_id = $2))`,
        [req.params.id, adminId]
      );
      if (!scopeCheck[0]) return errorResponse(res, 'Role not found', 404);
    }

    const { creator_first, creator_last, ...r } = rows[0];
    successResponse(res, { ...r, created_by_user: creator_first ? { first_name: creator_first, last_name: creator_last } : null });
  } catch (err) {
    errorResponse(res, 'Failed to fetch role', 500);
  }
};

const create = async (req, res) => {
  try {
    const { name, description } = req.body;
    if (!name || name.trim().length < 3) {
      return errorResponse(res, 'Role name must be at least 3 characters', 400);
    }

    const { rows: existing } = await pool.query('SELECT id FROM roles WHERE LOWER(name) = LOWER($1)', [name.trim()]);
    if (existing[0]) return errorResponse(res, 'Role name already exists', 400);

    const { rows } = await pool.query(
      'INSERT INTO roles (name, description, created_by) VALUES ($1, $2, $3) RETURNING *',
      [name.trim(), description || null, req.user.id]
    );

    successResponse(res, rows[0], 'Role created', 201);
  } catch (err) {
    errorResponse(res, 'Failed to create role', 500);
  }
};

const update = async (req, res) => {
  try {
    const { name, description } = req.body;
    if (!name || name.trim().length < 3) {
      return errorResponse(res, 'Role name must be at least 3 characters', 400);
    }

    const { rows: existing } = await pool.query(
      'SELECT id FROM roles WHERE LOWER(name) = LOWER($1) AND id != $2',
      [name.trim(), req.params.id]
    );
    if (existing[0]) return errorResponse(res, 'Role name already exists', 400);

    const { rows } = await pool.query(
      'UPDATE roles SET name=$1, description=$2, updated_at=NOW() WHERE id=$3 RETURNING *',
      [name.trim(), description || null, req.params.id]
    );
    if (!rows[0]) return errorResponse(res, 'Role not found', 404);

    successResponse(res, rows[0], 'Role updated');
  } catch (err) {
    errorResponse(res, 'Failed to update role', 500);
  }
};

const remove = async (req, res) => {
  try {
    const { rows: usageRows } = await pool.query('SELECT COUNT(*) AS cnt FROM users WHERE role_id = $1 AND deleted_at IS NULL', [req.params.id]);
    if (parseInt(usageRows[0].cnt) > 0) {
      return errorResponse(res, 'Cannot delete a role that is assigned to users', 400);
    }

    const { rows } = await pool.query('DELETE FROM roles WHERE id = $1 RETURNING id', [req.params.id]);
    if (!rows[0]) return errorResponse(res, 'Role not found', 404);

    successResponse(res, null, 'Role deleted');
  } catch (err) {
    errorResponse(res, 'Failed to delete role', 500);
  }
};

module.exports = { getAll, getById, create, update, remove };
