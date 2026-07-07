const buildPaginationQuery = (query) => {
  const page = parseInt(query.page) || 1;
  const limit = parseInt(query.limit) || 20;
  const offset = (page - 1) * limit;
  return { page, limit, offset };
};

const buildSortQuery = (query, defaultField = 'created_at') => {
  const sortBy = query.sortBy || defaultField;
  const sortOrder = query.sortOrder === 'asc';
  return { sortBy, ascending: sortOrder };
};

const successResponse = (res, data, message = 'Success', statusCode = 200, meta = {}) => {
  res.status(statusCode).json({ success: true, message, data, ...meta });
};

const errorResponse = (res, message, statusCode = 400, errors = null) => {
  const response = { success: false, message };
  if (errors) response.errors = errors;
  res.status(statusCode).json(response);
};

const generateCode = (prefix, id) => {
  const padded = String(id).padStart(5, '0');
  return `${prefix}-${padded}`;
};

const generateUniqueCode = (prefix) => {
  const timestamp = Date.now().toString(36).toUpperCase();
  return `${prefix}-${timestamp}`;
};

module.exports = { buildPaginationQuery, buildSortQuery, successResponse, errorResponse, generateCode, generateUniqueCode };
