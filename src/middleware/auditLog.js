const pool = require('../config/database');
const logger = require('../config/logger');

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SENSITIVE_FIELD_PATTERN = /password|token|secret|authorization/i;

const getAction = (method) => {
  if (method === 'POST') return 'create';
  if (method === 'PUT' || method === 'PATCH') return 'update';
  if (method === 'DELETE') return 'delete';
  return null;
};

const getModule = (pathname) => {
  const moduleName = pathname.split('/')[2];
  if (!moduleName) return null;
  return moduleName.replace(/-/g, '_');
};

const sanitizeValues = (value) => {
  if (Array.isArray(value)) return value.map(sanitizeValues);
  if (!value || typeof value !== 'object') return value;

  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => !SENSITIVE_FIELD_PATTERN.test(key))
      .map(([key, nestedValue]) => [key, sanitizeValues(nestedValue)])
  );
};

const auditLog = () => (req, res, next) => {
  const originalJson = res.json.bind(res);
  let auditAttempted = false;

  res.json = function (body) {
    const action = getAction(req.method);
    const pathname = req.originalUrl.split('?')[0];
    const moduleName = getModule(pathname);

    if (
      auditAttempted
      || !action
      || !req.user
      || !moduleName
      || (moduleName === 'auth' && pathname === '/api/auth/logout')
      || res.statusCode >= 400
    ) {
      return originalJson(body);
    }

    auditAttempted = true;
    const responseId = body?.data?.id || body?.id;
    const parameterId = req.params?.id;
    const recordId = [responseId, parameterId].find((id) => typeof id === 'string' && UUID_PATTERN.test(id)) || null;
    const newValues = req.body && Object.keys(req.body).length > 0 ? JSON.stringify(sanitizeValues(req.body)) : null;

    return pool.query(
      `INSERT INTO audit_logs
         (user_id, action, module, record_id, new_values, ip_address, user_agent)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [req.user.id, action, moduleName, recordId, newValues, req.ip, req.get('User-Agent')]
    ).then(() => originalJson(body)).catch((error) => {
      logger.error('Failed to write audit log', {
        error,
        userId: req.user.id,
        action,
        module: moduleName,
        recordId,
      });
      return originalJson(body);
    });
  };

  next();
};

module.exports = auditLog;
