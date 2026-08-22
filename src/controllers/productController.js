const pool = require('../config/database');
const XLSX = require('xlsx');
const { successResponse, errorResponse, buildPaginationQuery, buildSortQuery, generateUniqueCode } = require('../utils/helpers');
const { buildScopeWhere } = require('../middleware/auth');
const { getRequiredProductImportColumns, getProductImportSampleColumns, getDuplicateProductKey, normalizeProductImportRow } = require('../utils/productImport');

const PRODUCT_IMPORT_BATCH_SIZE = 500;

const normalizeHeader = (value = '') => String(value).trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');

const getColumnValue = (row, keys) => {
  for (const key of keys) {
    if (row[key] !== undefined && row[key] !== null && String(row[key]).trim() !== '') return row[key];
  }
  return null;
};

const getImportSampleCsv = () => {
  const headers = getProductImportSampleColumns();
  const row = ['Desk Lamp', 'Ultra', 'pcs', '250.50', '399.99'];
  return [headers, row].map(columns => columns.join(',')).join('\n') + '\n';
};

const resolveImportLookups = async (conn, rows) => {
  const categories = new Map();
  const units = new Map();
  const categoryNames = [...new Set(rows.map(r => (r.category || '').trim()).filter(Boolean))];
  const unitNames = [...new Set(rows.map(r => (r.unit || '').trim()).filter(Boolean))];

  if (categoryNames.length) {
    const { rows: categoryRows } = await conn.query(
      'SELECT id, LOWER(name) AS name_key FROM categories WHERE deleted_at IS NULL AND LOWER(name) = ANY($1)',
      [categoryNames.map(name => name.toLowerCase())]
    );
    categoryRows.forEach(row => categories.set(row.name_key, row.id));
  }

  if (unitNames.length) {
    const { rows: unitRows } = await conn.query(
      `SELECT id, LOWER(name) AS name_key, LOWER(abbreviation) AS abbr_key
       FROM units WHERE (LOWER(name) = ANY($1) OR LOWER(abbreviation) = ANY($2))`,
      [unitNames.map(name => name.toLowerCase()), unitNames.map(name => name.toLowerCase())]
    );
    unitRows.forEach(row => {
      if (row.name_key) units.set(row.name_key, row.id);
      if (row.abbr_key) units.set(row.abbr_key, row.id);
    });
  }

  return { categories, units };
};

const insertProductBatch = async (conn, req, items) => {
  if (!items.length) return [];

  let paramIndex = 1;
  const placeholders = [];
  const values = [];
  const createdBy = req.user.role_name.includes('admin') ? req.user.id : req.user.admin_id;

  items.forEach((item) => {
    const rowPlaceholders = [];
    const rowValues = [
      item.code,
      item.name,
      item.brand,
      item.category_id,
      item.unit_id,
      item.description,
      item.barcode,
      item.purchase_price,
      item.selling_price,
      item.tax_percentage,
      item.discount_percentage,
      item.reorder_level,
      item.is_active,
      createdBy,
    ];

    rowValues.forEach(() => {
      rowPlaceholders.push(`$${paramIndex}`);
      paramIndex += 1;
    });

    placeholders.push(`(${rowPlaceholders.join(',')})`);
    values.push(...rowValues);
  });

  const query = `
    INSERT INTO products (code, name, brand, category_id, unit_id, description, barcode, purchase_price, selling_price, tax_percentage, discount_percentage, reorder_level, is_active, created_by)
    VALUES ${placeholders.join(',')}
    RETURNING *
  `;

  const { rows } = await conn.query(query, values);
  return rows;
};

const insertProductBatchWithFallback = async (conn, req, batch, failedRecords) => {
  if (!batch.length) return 0;

  try {
    const inserted = await insertProductBatch(conn, req, batch);
    return inserted.length;
  } catch (error) {
    let insertedCount = 0;
    for (const item of batch) {
      try {
        await insertProductBatch(conn, req, [item]);
        insertedCount += 1;
      } catch (itemError) {
        failedRecords.push({
          rowNumber: item.rowNumber,
          product: item.name,
          reason: itemError.message || 'Database validation error',
        });
      }
    }
    return insertedCount;
  }
};

const getAll = async (req, res) => {
  try {
    const { page, limit, offset } = buildPaginationQuery(req.query);
    const { sortBy, ascending } = buildSortQuery(req.query);
    const { search, is_active, category_id } = req.query;

    const conditions = ['p.deleted_at IS NULL'];
    const params = [];

    if (search) {
      params.push(`%${search}%`);
      conditions.push(`(p.name ILIKE $${params.length} OR p.code ILIKE $${params.length} OR p.brand ILIKE $${params.length})`);
    }
    if (is_active !== undefined) {
      params.push(is_active === 'true');
      conditions.push(`p.is_active = $${params.length}`);
    }
    if (category_id) {
      params.push(category_id);
      conditions.push(`p.category_id = $${params.length}`);
    }

    const scope = buildScopeWhere(req.user, 'p', params, 'created_by');
    if (scope.fragment) {
      params.push(...scope.params.slice(params.length));
      conditions.push(scope.fragment);
    }

    const where = conditions.join(' AND ');
    const order = `p.${sortBy} ${ascending ? 'ASC' : 'DESC'}`;

    params.push(limit, offset);
    const dataQuery = `
      SELECT p.*, c.id AS cat_id, c.name AS cat_name, u.id AS unit_id_ref, u.name AS unit_name, u.abbreviation AS unit_abbr,
             COUNT(*) OVER() AS total_count
      FROM products p
      LEFT JOIN categories c ON c.id = p.category_id
      LEFT JOIN units u ON u.id = p.unit_id
      WHERE ${where}
      ORDER BY ${order}
      LIMIT $${params.length - 1} OFFSET $${params.length}`;

    const { rows } = await pool.query(dataQuery, params);
    const total = rows.length > 0 ? parseInt(rows[0].total_count) : 0;
    const data = rows.map(r => {
      const { total_count, cat_id, cat_name, unit_id_ref, unit_name, unit_abbr, ...rest } = r;
      return { ...rest, category: cat_id ? { id: cat_id, name: cat_name } : null, unit: unit_id_ref ? { id: unit_id_ref, name: unit_name, abbreviation: unit_abbr } : null };
    });

    successResponse(res, data, 'Products fetched', 200, { meta: { total, page, limit, totalPages: Math.ceil(total / limit) } });
  } catch (err) {
    errorResponse(res, 'Failed to fetch products', 500);
  }
};

const getById = async (req, res) => {
  try {
    const params = [req.params.id];
    const scope = buildScopeWhere(req.user, 'p', params, 'created_by');
    const where = `p.id = $1 AND p.deleted_at IS NULL${scope.fragment ? ` AND ${scope.fragment}` : ''}`;
    
    const { rows } = await pool.query(
      `SELECT p.*, c.id AS cat_id, c.name AS cat_name, u.id AS unit_id_ref, u.name AS unit_name, u.abbreviation AS unit_abbr
       FROM products p
       LEFT JOIN categories c ON c.id = p.category_id
       LEFT JOIN units u ON u.id = p.unit_id
       WHERE ${where}`,
      [req.params.id, req.user.role_name.includes('admin') ? req.user.id : req.user.admin_id]
    );
    if (!rows[0]) return errorResponse(res, 'Product not found', 404);
    const { cat_id, cat_name, unit_id_ref, unit_name, unit_abbr, ...rest } = rows[0];
    successResponse(res, { ...rest, category: cat_id ? { id: cat_id, name: cat_name } : null, unit: unit_id_ref ? { id: unit_id_ref, name: unit_name, abbreviation: unit_abbr } : null });
  } catch (err) {
    errorResponse(res, 'Failed to fetch product', 500);
  }
};

const create = async (req, res) => {
  try {
    const code = generateUniqueCode('PRD');
    const { name, brand, description, category_id, unit_id, purchase_price, selling_price, tax_percentage, discount_percentage, reorder_level, is_active } = req.body;
    const image_url = req.file ? `/uploads/${req.file.filename}` : null;

    const { rows } = await pool.query(
      `INSERT INTO products (code, name, brand, description, category_id, unit_id, purchase_price, selling_price, tax_percentage, discount_percentage, reorder_level, is_active, image_url, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING *`,
      [code, name, brand, description, category_id, unit_id, purchase_price, selling_price, tax_percentage || 0, discount_percentage || 0, reorder_level || 0, is_active !== false, image_url,  req.user.role_name.includes('admin') ? req.user.id : req.user.admin_id]
    );
    successResponse(res, rows[0], 'Product created', 201);
  } catch (err) {
    errorResponse(res, 'Failed to create product', 500);
  }
};

const update = async (req, res) => {
  try {
    const { name, brand, description, category_id, unit_id, purchase_price, selling_price, tax_percentage, discount_percentage, reorder_level, is_active } = req.body;
    const image_url = req.file ? `/uploads/${req.file.filename}` : undefined;

    const sets = ['name=$1','brand=$2','description=$3','category_id=$4','unit_id=$5','purchase_price=$6','selling_price=$7','tax_percentage=$8','discount_percentage=$9','reorder_level=$10','is_active=$11'];
    const params = [name, brand, description, category_id, unit_id, purchase_price, selling_price, tax_percentage, discount_percentage, reorder_level, is_active];

    if (image_url !== undefined) {
      sets.push(`image_url=$${params.length + 1}`);
      params.push(image_url);
    }

    params.push(req.params.id);
    const idParamIndex = params.length;
    const scope = buildScopeWhere(req.user, 'products', params, 'created_by');
    if (scope.fragment) {
      params.push(...scope.params.slice(params.length));
    }

    const query = `UPDATE products SET ${sets.join(',')} WHERE id=$${idParamIndex} AND deleted_at IS NULL${scope.fragment ? ` AND ${scope.fragment}` : ''} RETURNING *`;
    const { rows } = await pool.query(query, params);

    if (!rows[0]) return errorResponse(res, 'Product not found or update failed', 404);
    successResponse(res, rows[0], 'Product updated');
  } catch (err) {
    errorResponse(res, 'Failed to update product', 500);
  }
};

const remove = async (req, res) => {
  try {
    const params = [req.params.id];
    const scope = buildScopeWhere(req.user, 'products', params, 'created_by');
    if (scope.fragment) {
      params.push(...scope.params.slice(params.length));
    }

    const query = `UPDATE products SET deleted_at = NOW() WHERE id = $1 AND deleted_at IS NULL${scope.fragment ? ` AND ${scope.fragment}` : ''} RETURNING id`;
    const { rows } = await pool.query(query, params);
    if (!rows[0]) return errorResponse(res, 'Product not found', 404);
    successResponse(res, null, 'Product deleted');
  } catch (err) {
    errorResponse(res, 'Failed to delete product', 500);
  }
};

const bulkImport = async (req, res) => {
  try {
    if (!req.file) return errorResponse(res, 'File required', 400);

    const workbook = XLSX.readFile(req.file.path);
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    if (!sheet) return errorResponse(res, 'Import file is empty or invalid', 400);

    const rawRows = XLSX.utils.sheet_to_json(sheet, { defval: null, raw: false, blankrows: false });
    if (!rawRows.length) return errorResponse(res, 'No records found in file', 400);

    const normalizedRows = rawRows.map((row, index) => {
      const normalizedEntry = {};
      Object.entries(row).forEach(([key, value]) => {
        normalizedEntry[normalizeHeader(key)] = value;
      });
      return { rowNumber: index + 2, row: normalizedEntry };
    });

    const importRows = [];
    const failedRecords = [];
    const allValidRows = [];

    for (const entry of normalizedRows) {
      const { rowNumber, row } = entry;
      try {
        const normalized = normalizeProductImportRow(row);
        const lookupRow = {
          rowNumber,
          name: normalized.name,
          brand: normalized.brand,
          category: normalized.category,
          unit: normalized.unit,
          ...normalized,
        };
        allValidRows.push(lookupRow);
      } catch (error) {
        failedRecords.push({
          rowNumber,
          product: getColumnValue(row, ['name', 'product_name', 'product', 'item_name']) || 'N/A',
          reason: error.message,
        });
      }
    }

    if (!allValidRows.length) {
      return successResponse(res, {
        processed: rawRows.length,
        imported: 0,
        failed: failedRecords.length,
        failed_records: failedRecords,
      }, 'Import completed with validation errors', 200);
    }

    const client = await pool.connect();
    const { categories, units } = await resolveImportLookups(client, allValidRows);
    let imported = 0;
    let processed = 0;
    const duplicateKeys = new Set();
    const seenInImport = new Set();

    const rowsWithIds = allValidRows.map((item) => ({
      ...item,
      code: generateUniqueCode('PRD'),
      category_id: item.category ? categories.get(String(item.category).trim().toLowerCase()) || null : null,
      unit_id: item.unit ? units.get(String(item.unit).trim().toLowerCase()) || null : null,
    }));

    const existingProducts = await client.query(
      `SELECT LOWER(name) AS name_key
       FROM products WHERE deleted_at IS NULL AND LOWER(name) = ANY($1)`,
      [rowsWithIds.map(item => getDuplicateProductKey(item.name))]
    );

    existingProducts.rows.forEach((item) => duplicateKeys.add(item.name_key));

    try {
      await client.query('BEGIN');

      for (let i = 0; i < rowsWithIds.length; i += PRODUCT_IMPORT_BATCH_SIZE) {
        const batch = rowsWithIds.slice(i, i + PRODUCT_IMPORT_BATCH_SIZE);
        const batchResults = [];

        for (const item of batch) {
          const duplicateKey = getDuplicateProductKey(item.name);
          if (duplicateKeys.has(duplicateKey) || seenInImport.has(duplicateKey)) {
            failedRecords.push({
              rowNumber: item.rowNumber,
              product: item.name,
              reason: 'Duplicate product already exists',
            });
            continue;
          }

          seenInImport.add(duplicateKey);
          batchResults.push({
            ...item,
            category_id: item.category_id,
            unit_id: item.unit_id,
            code: item.code,
          });
        }

        if (batchResults.length) {
          imported += await insertProductBatchWithFallback(client, req, batchResults, failedRecords);
        }

        processed += batch.length;
      }

      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }

    const uniqueFailed = failedRecords.filter((record, index, array) =>
      array.findIndex(item => item.rowNumber === record.rowNumber && item.product === record.product && item.reason === record.reason) === index
    );

    successResponse(res, {
      processed: rawRows.length,
      imported,
      failed: uniqueFailed.length,
      failed_records: uniqueFailed,
    }, `Import completed. ${imported} products imported successfully.`, 200);
  } catch (err) {
    errorResponse(res, err.message || 'Import failed', 500);
  }
};

const exportImportSample = async (req, res) => {
  try {
    const csv = getImportSampleCsv();
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="product-import-sample.csv"');
    res.send(csv);
  } catch (err) {
    errorResponse(res, 'Failed to generate import sample', 500);
  }
};

const exportProducts = async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT p.*, c.name AS category_name, u.abbreviation AS unit_abbr
       FROM products p
       LEFT JOIN categories c ON c.id = p.category_id
       LEFT JOIN units u ON u.id = p.unit_id
       WHERE p.deleted_at IS NULL`
    );

    const XLSX = require('xlsx');
    const exportData = rows.map(p => ({
      Code: p.code,
      Name: p.name,
      Category: p.category_name || '',
      Brand: p.brand || '',
      Unit: p.unit_abbr || '',
      'Purchase Price': p.purchase_price,
      'Selling Price': p.selling_price,
      'Tax %': p.tax_percentage,
      'Discount %': p.discount_percentage,
      'Reorder Level': p.reorder_level,
    }));

    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Products');
    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

    res.setHeader('Content-Disposition', 'attachment; filename="products.xlsx"');
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.send(buffer);
  } catch (err) {
    errorResponse(res, 'Export failed', 500);
  }
};

module.exports = { getAll, getById, create, update, remove, bulkImport, exportImportSample, exportProducts };
