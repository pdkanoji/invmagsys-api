const jwt = require('jsonwebtoken');
const pool = require('../config/database');

const authenticate = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, message: 'Access token required' });
  }

  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const { rows } = await pool.query(
      `SELECT u.id, u.email, u.first_name, u.last_name, u.role_id, u.is_active, u.admin_id,
              r.name AS role_name
       FROM users u
       LEFT JOIN roles r ON r.id = u.role_id
       WHERE u.id = $1 AND u.deleted_at IS NULL`,
      [decoded.userId]
    );
    const user = rows[0];

    if (!user) return res.status(401).json({ success: false, message: 'Invalid token - user not found' });
    if (!user.is_active) return res.status(401).json({ success: false, message: 'Account is deactivated' });

    req.user = { ...user, roles: user.role_name ? { name: user.role_name } : null };
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ success: false, message: 'Token expired' });
    }
    return res.status(401).json({ success: false, message: 'Invalid token' });
  }
};

const authorize = (...roles) => {
  return (req, res, next) => {
    if (!req.user || !req.user.roles) {
      return res.status(403).json({ success: false, message: 'Forbidden - no role assigned' });
    }
    const userRole = req.user.roles.name;
    if (!roles.includes(userRole)) {
      return res.status(403).json({ success: false, message: 'Forbidden - insufficient permissions' });
    }
    next();
  };
};

/**
 * Build a parameterized scope WHERE fragment for role-based data isolation.
 *
 * super_admin → no restriction (fragment = null)
 * admin       → rows created by self or self's subordinates
 * other       → rows created by parent admin or sibling subordinates
 *
 * @param {object} user       req.user object
 * @param {string} alias      table alias for the scoped column
 * @param {Array}  existing   already-accumulated query params array
 * @param {string} column     column to scope by: 'admin_id' or 'created_by'
 * @returns {{ fragment: string|null, params: Array }}
 */
function buildScopeWhere(user, alias, existing = [], column = 'admin_id') {
  const role = user.roles?.name;
  if (role === 'super_admin') return { fragment: null, params: [...existing] };

  const adminId = role === 'admin' ? user.id : user.admin_id;
  if (!adminId) return { fragment: '1=0', params: [...existing] };

  const idx = existing.length + 1;
  if (column === 'created_by') {
    const fragment = `(${alias}.created_by = $${idx} OR ${alias}.created_by IN (SELECT id FROM users WHERE admin_id = $${idx}))`;
    return { fragment, params: [...existing, adminId] };
  }

  const fragment = `(${alias}.admin_id = $${idx} OR ${alias}.admin_id IN (SELECT id FROM users WHERE admin_id = $${idx}))`;
  return { fragment, params: [...existing, adminId] };
}

module.exports = { authenticate, authorize, buildScopeWhere };
