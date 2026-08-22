const REQUIRED_PRODUCT_IMPORT_COLUMNS = ['name', 'purchase_price', 'selling_price'];
const PRODUCT_IMPORT_SAMPLE_COLUMNS = ['name', 'brand', 'unit', 'purchase_price', 'selling_price'];

const normalizeHeader = (value = '') => String(value)
  .trim()
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, '_')
  .replace(/^_+|_+$/g, '');

const firstDefinedValue = (source, keys) => {
  for (const key of keys) {
    if (source[key] !== undefined && source[key] !== null) return source[key];
  }
  return null;
};

const toStringValue = (value) => {
  if (value === undefined || value === null) return '';
  return String(value).trim();
};

const parseNumber = (value, fieldName, { allowBlank = false, min = Number.NEGATIVE_INFINITY, max = Number.POSITIVE_INFINITY } = {}) => {
  const raw = toStringValue(value);
  if (!raw) {
    if (allowBlank) return null;
    throw new Error(`${fieldName} is required`);
  }

  const normalized = raw.replace(/,/g, '').trim();
  const numeric = Number(normalized);

  if (!Number.isFinite(numeric)) {
    throw new Error(`${fieldName} must be a valid number`);
  }
  if (numeric < min || numeric > max) {
    throw new Error(`${fieldName} must be between ${min} and ${max}`);
  }
  return numeric;
};

const parseBoolean = (value) => {
  if (value === undefined || value === null || toStringValue(value) === '') return true;
  if (typeof value === 'boolean') return value;

  const normalized = toStringValue(value).toLowerCase();
  if (['true', '1', 'yes', 'y'].includes(normalized)) return true;
  if (['false', '0', 'no', 'n'].includes(normalized)) return false;
  throw new Error('Boolean value must be true or false');
};

const normalizeProductImportRow = (row = {}) => {
  const source = {};
  Object.entries(row || {}).forEach(([key, value]) => {
    source[normalizeHeader(key)] = value;
  });

  const name = toStringValue(firstDefinedValue(source, ['name', 'product_name', 'productname'])) ||
    toStringValue(firstDefinedValue(source, ['product', 'item_name']));
  if (!name) throw new Error('Product name is required');

  const purchasePrice = parseNumber(firstDefinedValue(source, ['purchase_price', 'purchaseprice', 'cost_price', 'costprice']), 'Purchase price', { min: 0 });
  const sellingPrice = parseNumber(firstDefinedValue(source, ['selling_price', 'sellingprice', 'sale_price', 'unit_price']), 'Selling price', { min: 0 });

  const brand = toStringValue(firstDefinedValue(source, ['brand', 'product_brand'])) || null;
  const category = toStringValue(firstDefinedValue(source, ['category', 'category_name', 'department'])) || null;
  const unit = toStringValue(firstDefinedValue(source, ['unit', 'unit_name', 'unit_abbreviation'])) || null;
  const description = toStringValue(firstDefinedValue(source, ['description', 'details'])) || null;
  const barcode = toStringValue(firstDefinedValue(source, ['barcode', 'product_barcode'])) || null;
  const taxPercentage = parseNumber(firstDefinedValue(source, ['tax_percentage', 'taxpercent', 'tax']), 'Tax percentage', { allowBlank: true, min: 0, max: 100 }) ?? 0;
  const discountPercentage = parseNumber(firstDefinedValue(source, ['discount_percentage', 'discountpercent', 'discount']), 'Discount percentage', { allowBlank: true, min: 0, max: 100 }) ?? 0;
  const reorderLevel = parseNumber(firstDefinedValue(source, ['reorder_level', 'reorderlevel', 'minimum_stock_level']), 'Reorder level', { allowBlank: true, min: 0 }) ?? 0;
  const isActive = parseBoolean(firstDefinedValue(source, ['is_active', 'isactive', 'active']));

  return {
    name: name.trim(),
    brand: brand || null,
    category: category || null,
    unit: unit || null,
    description: description || null,
    barcode: barcode || null,
    purchase_price: purchasePrice,
    selling_price: sellingPrice,
    tax_percentage: taxPercentage,
    discount_percentage: discountPercentage,
    reorder_level: reorderLevel,
    is_active: isActive,
  };
};

const getRequiredProductImportColumns = () => [...REQUIRED_PRODUCT_IMPORT_COLUMNS];
const getProductImportSampleColumns = () => [...PRODUCT_IMPORT_SAMPLE_COLUMNS];
const getDuplicateProductKey = (name = '') => String(name).trim().toLowerCase();

module.exports = {
  REQUIRED_PRODUCT_IMPORT_COLUMNS,
  PRODUCT_IMPORT_SAMPLE_COLUMNS,
  getRequiredProductImportColumns,
  getProductImportSampleColumns,
  getDuplicateProductKey,
  normalizeProductImportRow,
};
