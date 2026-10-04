const ALL_PERMISSION_MODULES = [
  'dashboard',
  'products',
  'categories',
  'inventory',
  'purchases',
  'purchase_returns',
  'sales',
  'sale_returns',
  'suppliers',
  'customers',
  'warehouses',
  'reports',
  'users',
  'roles',
  'audit_logs',
  'notifications',
];

const EMPTY_PERMISSION = Object.freeze({ view: false, create: false, edit: false, delete: false });

function normalizePermissionMap(rawPermissions = {}) {
  const result = {};

  for (const moduleName of ALL_PERMISSION_MODULES) {
    const assigned = rawPermissions[moduleName] || {};
    result[moduleName] = {
      view: !!assigned.view,
      create: !!assigned.create,
      edit: !!assigned.edit,
      delete: !!assigned.delete,
    };
  }

  return result;
}

function permissionMapFromRows(rows = []) {
  const permissions = {};

  for (const row of rows) {
    permissions[row.module] = {
      view: !!row.can_view,
      create: !!row.can_create,
      edit: !!row.can_edit,
      delete: !!row.can_delete,
    };
  }

  return permissions;
}

async function getRolePermissions(pool, roleName) {
  if (!roleName) return {};

  const { rows } = await pool.query(
    `SELECT module, can_view, can_create, can_edit, can_delete
     FROM module_permissions
     WHERE role_name = $1`,
    [roleName]
  );

  return permissionMapFromRows(rows);
}

async function syncRolePermissions(pool, roleName, rawPermissions = {}) {
  const normalized = normalizePermissionMap(rawPermissions);

  for (const moduleName of ALL_PERMISSION_MODULES) {
    const permission = normalized[moduleName];
    if (!Object.values(permission).some(Boolean)) {
      await pool.query(
        'DELETE FROM module_permissions WHERE role_name = $1 AND module = $2',
        [roleName, moduleName]
      );
      continue;
    }

    await pool.query(
      `INSERT INTO module_permissions (role_name, module, can_view, can_create, can_edit, can_delete)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (role_name, module)
       DO UPDATE SET can_view = EXCLUDED.can_view,
                     can_create = EXCLUDED.can_create,
                     can_edit = EXCLUDED.can_edit,
                     can_delete = EXCLUDED.can_delete`,
      [roleName, moduleName, !!permission.view, !!permission.create, !!permission.edit, !!permission.delete]
    );
  }

  return normalized;
}

module.exports = {
  ALL_PERMISSION_MODULES,
  EMPTY_PERMISSION,
  normalizePermissionMap,
  permissionMapFromRows,
  getRolePermissions,
  syncRolePermissions,
};
