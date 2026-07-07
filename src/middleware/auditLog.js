const pool = require('../config/database');

const auditLog = (module) => async (req, res, next) => {
  const originalJson = res.json.bind(res);
  res.json = async function (body) {
    if (req.user && res.statusCode < 400) {
      const action = req.method === 'POST' ? 'create'
        : req.method === 'PUT' || req.method === 'PATCH' ? 'update'
        : req.method === 'DELETE' ? 'delete' : 'read';

      if (action !== 'read') {
        pool.query(
          'INSERT INTO audit_logs (user_id, action, module, record_id, new_values, ip_address, user_agent) VALUES ($1,$2,$3,$4,$5,$6,$7)',
          [req.user.id, action, module, body?.data?.id || req.params?.id || null, req.body ? JSON.stringify(req.body) : null, req.ip, req.get('User-Agent')]
        ).catch(() => {});
      }
    }
    return originalJson(body);
  };
  next();
};

module.exports = auditLog;
