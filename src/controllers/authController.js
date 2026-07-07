const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const pool = require('../config/database');
const { successResponse, errorResponse } = require('../utils/helpers');
const logger = require('../config/logger');

const generateTokens = (userId) => {
  const accessToken = jwt.sign({ userId }, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES_IN || '24h' });
  const refreshToken = jwt.sign({ userId }, process.env.JWT_SECRET + '_refresh', { expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d' });
  return { accessToken, refreshToken };
};

const login = async (req, res) => {
  try {
    const { email, password } = req.body;
    const { rows } = await pool.query(
      `SELECT u.id, u.email, u.password_hash, u.first_name, u.last_name, u.role_id, u.is_active,
              r.id AS role_id_ref, r.name AS role_name
       FROM users u
       LEFT JOIN roles r ON r.id = u.role_id
       WHERE u.email = $1 AND u.deleted_at IS NULL`,
      [email.toLowerCase()]
    );
    const user = rows[0];

    if (!user) return errorResponse(res, 'Invalid email or password', 401);
    if (!user.is_active) return errorResponse(res, 'Account deactivated. Contact administrator.', 401);

    const isValid = await bcrypt.compare(password, user.password_hash);
    if (!isValid) return errorResponse(res, 'Invalid email or password', 401);

    await pool.query('UPDATE users SET last_login_at = NOW() WHERE id = $1', [user.id]);
    await pool.query(
      'INSERT INTO audit_logs (user_id, action, module, ip_address, user_agent) VALUES ($1, $2, $3, $4, $5)',
      [user.id, 'login', 'auth', req.ip, req.get('User-Agent')]
    );

    const { accessToken, refreshToken } = generateTokens(user.id);
    const { password_hash, ...userWithoutPassword } = user;
    const userResponse = {
      ...userWithoutPassword,
      roles: user.role_name ? { id: user.role_id_ref, name: user.role_name } : null,
    };

    successResponse(res, { user: userResponse, accessToken, refreshToken }, 'Login successful');
  } catch (err) {
    logger.error('Login error:', err);
    errorResponse(res, 'Login failed', 500);
  }
};

const logout = async (req, res) => {
  try {
    await pool.query(
      'INSERT INTO audit_logs (user_id, action, module, ip_address, user_agent) VALUES ($1, $2, $3, $4, $5)',
      [req.user.id, 'logout', 'auth', req.ip, req.get('User-Agent')]
    );
    successResponse(res, null, 'Logged out successfully');
  } catch (err) {
    errorResponse(res, 'Logout failed', 500);
  }
};

const refreshToken = async (req, res) => {
  try {
    const { refreshToken: token } = req.body;
    if (!token) return errorResponse(res, 'Refresh token required', 401);

    const decoded = jwt.verify(token, process.env.JWT_SECRET + '_refresh');
    const { rows } = await pool.query(
      'SELECT id, is_active FROM users WHERE id = $1 AND deleted_at IS NULL',
      [decoded.userId]
    );
    const user = rows[0];

    if (!user || !user.is_active) return errorResponse(res, 'Invalid refresh token', 401);

    const tokens = generateTokens(user.id);
    successResponse(res, tokens, 'Tokens refreshed');
  } catch (err) {
    errorResponse(res, 'Invalid or expired refresh token', 401);
  }
};

const forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;
    const { rows } = await pool.query(
      'SELECT id, email, first_name FROM users WHERE email = $1 AND deleted_at IS NULL',
      [email.toLowerCase()]
    );
    const user = rows[0];

    if (!user) return successResponse(res, null, 'If the email exists, a reset link has been sent.');

    const resetToken = require('crypto').randomBytes(32).toString('hex');
    const resetTokenExpires = new Date(Date.now() + 60 * 60 * 1000);

    await pool.query(
      'UPDATE users SET reset_token = $1, reset_token_expires = $2 WHERE id = $3',
      [await bcrypt.hash(resetToken, 10), resetTokenExpires, user.id]
    );

    logger.info(`Password reset token for ${email}: ${resetToken}`);
    successResponse(res, null, 'If the email exists, a reset link has been sent.');
  } catch (err) {
    logger.error('Forgot password error:', err);
    errorResponse(res, 'Request failed', 500);
  }
};

const resetPassword = async (req, res) => {
  try {
    const { token, password } = req.body;
    const { rows } = await pool.query(
      'SELECT id, reset_token FROM users WHERE reset_token IS NOT NULL AND reset_token_expires > NOW()'
    );

    let matchedUser = null;
    for (const user of rows) {
      const isValid = await bcrypt.compare(token, user.reset_token);
      if (isValid) { matchedUser = user; break; }
    }

    if (!matchedUser) return errorResponse(res, 'Invalid or expired reset token', 400);

    const hashedPassword = await bcrypt.hash(password, 12);
    await pool.query(
      'UPDATE users SET password_hash = $1, reset_token = NULL, reset_token_expires = NULL WHERE id = $2',
      [hashedPassword, matchedUser.id]
    );

    successResponse(res, null, 'Password reset successfully');
  } catch (err) {
    errorResponse(res, 'Password reset failed', 500);
  }
};

const getProfile = async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT u.id, u.email, u.first_name, u.last_name, u.phone, u.avatar_url, u.is_active, u.last_login_at, u.created_at,
              r.id AS role_id, r.name AS role_name
       FROM users u
       LEFT JOIN roles r ON r.id = u.role_id
       WHERE u.id = $1`,
      [req.user.id]
    );
    const user = rows[0];
    if (user && user.role_name) {
      user.roles = { id: user.role_id, name: user.role_name };
    }
    successResponse(res, user);
  } catch (err) {
    errorResponse(res, 'Failed to fetch profile', 500);
  }
};

const updateProfile = async (req, res) => {
  try {
    const { first_name, last_name, phone } = req.body;
    const updates = [first_name, last_name, phone, req.user.id];
    let avatarClause = '';
    if (req.file) {
      avatarClause = ', avatar_url = $5';
      updates.splice(3, 0, `/uploads/${req.file.filename}`);
      updates[4] = req.user.id;
    }

    const { rows } = await pool.query(
      `UPDATE users SET first_name = $1, last_name = $2, phone = $3${avatarClause} WHERE id = $${updates.length} RETURNING id, email, first_name, last_name, phone, avatar_url`,
      updates
    );

    if (!rows[0]) return errorResponse(res, 'Update failed', 400);
    successResponse(res, rows[0], 'Profile updated');
  } catch (err) {
    errorResponse(res, 'Update failed', 500);
  }
};

const changePassword = async (req, res) => {
  try {
    const { current_password, new_password } = req.body;
    const { rows } = await pool.query('SELECT password_hash FROM users WHERE id = $1', [req.user.id]);
    const user = rows[0];

    const isValid = await bcrypt.compare(current_password, user.password_hash);
    if (!isValid) return errorResponse(res, 'Current password is incorrect', 400);

    const hashedPassword = await bcrypt.hash(new_password, 12);
    await pool.query('UPDATE users SET password_hash = $1 WHERE id = $2', [hashedPassword, req.user.id]);

    successResponse(res, null, 'Password changed successfully');
  } catch (err) {
    errorResponse(res, 'Password change failed', 500);
  }
};

module.exports = { login, logout, refreshToken, forgotPassword, resetPassword, getProfile, updateProfile, changePassword };
