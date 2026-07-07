const pool = require('../config/database');
const { successResponse, errorResponse } = require('../utils/helpers');

/**
 * @swagger
 * /api/permissions/my-permissions:
 *   get:
 *     summary: Get permissions for the authenticated user's role
 *     tags: [Permissions]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Permissions list
 */
const getMyPermissions = async (req, res) => {
  try {
    const roleName = req.user?.roles?.name;
    if (!roleName) return successResponse(res, [], 'No role assigned');

    const { rows } = await pool.query(
      `SELECT module, can_view, can_create, can_edit, can_delete
       FROM module_permissions
       WHERE role_name = $1`,
      [roleName]
    );

    const permissions = {};
    for (const row of rows) {
      permissions[row.module] = {
        view:   row.can_view,
        create: row.can_create,
        edit:   row.can_edit,
        delete: row.can_delete,
      };
    }

    successResponse(res, { role: roleName, permissions });
  } catch (err) {
    errorResponse(res, 'Failed to fetch permissions', 500);
  }
};

/**
 * @swagger
 * /api/permissions:
 *   get:
 *     summary: Get all module permissions (admin only)
 *     tags: [Permissions]
 *     security:
 *       - bearerAuth: []
 */
const getAll = async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT * FROM module_permissions ORDER BY role_name, module'
    );
    successResponse(res, rows);
  } catch (err) {
    errorResponse(res, 'Failed to fetch permissions', 500);
  }
};

/**
 * @swagger
 * /api/permissions/{roleName}/{module}:
 *   put:
 *     summary: Update permissions for a specific role and module
 *     tags: [Permissions]
 *     security:
 *       - bearerAuth: []
 */
const update = async (req, res) => {
  try {
    const { roleName, module } = req.params;
    const { can_view, can_create, can_edit, can_delete } = req.body;

    const { rows } = await pool.query(
      `INSERT INTO module_permissions (role_name, module, can_view, can_create, can_edit, can_delete)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (role_name, module)
       DO UPDATE SET can_view=$3, can_create=$4, can_edit=$5, can_delete=$6
       RETURNING *`,
      [roleName, module, !!can_view, !!can_create, !!can_edit, !!can_delete]
    );

    successResponse(res, rows[0], 'Permissions updated');
  } catch (err) {
    errorResponse(res, 'Failed to update permissions', 500);
  }
};

module.exports = { getMyPermissions, getAll, update };
