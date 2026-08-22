const request = require('supertest');
const jwt = require('jsonwebtoken');

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test_jwt_secret_key';
process.env.JWT_EXPIRES_IN = '1h';
process.env.DATABASE_URL = 'postgresql://postgres:password@localhost:5432/inventory_db_test';

const authToken = jwt.sign({ userId: 'user-uuid-1' }, process.env.JWT_SECRET, { expiresIn: '1h' });

jest.mock('../src/config/database', () => {
  const mockPool = {
    query: jest.fn((sql) => {
      const s = (sql || '').toLowerCase();
      if (s.includes('from users') || s.includes('update users')) {
        return Promise.resolve({
          rows: [{ id: 'user-uuid-1', email: 'admin@test.com', first_name: 'Admin', last_name: 'User', role_id: 'role-uuid-1', is_active: true, role_name: 'admin', total_count: '1' }],
          rowCount: 1,
        });
      }
      if (s.includes('from products')) {
        return Promise.resolve({
          rows: [{ id: 'prod-uuid-1', code: 'PRD-ABC123', name: 'Test Product', purchase_price: 100, selling_price: 150, tax_percentage: 18, reorder_level: 10, is_active: true, created_at: new Date().toISOString(), total_count: '1' }],
          rowCount: 1,
        });
      }
      if (s.includes('insert into') || s.includes('update ') || s.includes('delete from')) {
        return Promise.resolve({ rows: [], rowCount: 1 });
      }
      return Promise.resolve({ rows: [], rowCount: 0 });
    }),
    connect: jest.fn().mockResolvedValue({
      query: jest.fn().mockResolvedValue({ rows: [] }),
      release: jest.fn(),
    }),
  };
  return mockPool;
});

const app = require('../src/app');

describe('Products API Tests', () => {
  describe('GET /api/products', () => {
    it('should return 401 without auth token', async () => {
      const res = await request(app).get('/api/products');
      expect(res.statusCode).toBe(401);
    });

    it('should return 200 with valid token', async () => {
      const res = await request(app)
        .get('/api/products')
        .set('Authorization', `Bearer ${authToken}`);
      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
    });

    it('should support pagination params', async () => {
      const res = await request(app)
        .get('/api/products?page=1&limit=10')
        .set('Authorization', `Bearer ${authToken}`);
      expect(res.statusCode).toBe(200);
    });

    it('should support search param', async () => {
      const res = await request(app)
        .get('/api/products?search=test')
        .set('Authorization', `Bearer ${authToken}`);
      expect(res.statusCode).toBe(200);
    });
  });

  describe('GET /api/products/:id', () => {
    it('should return 401 without auth token', async () => {
      const res = await request(app).get('/api/products/prod-uuid-1');
      expect(res.statusCode).toBe(401);
    });

    it('should return product or 404 with valid auth', async () => {
      const res = await request(app)
        .get('/api/products/prod-uuid-1')
        .set('Authorization', `Bearer ${authToken}`);
      expect([200, 404]).toContain(res.statusCode);
    });
  });

  describe('POST /api/products', () => {
    it('should return 401 without auth', async () => {
      const res = await request(app)
        .post('/api/products')
        .send({ name: 'New Product', purchase_price: 50, selling_price: 80 });
      expect(res.statusCode).toBe(401);
    });

    it('should accept valid product data with auth', async () => {
      const res = await request(app)
        .post('/api/products')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ name: 'New Product', purchase_price: 50, selling_price: 80 });
      expect([200, 201, 400]).toContain(res.statusCode);
    });
  });

  describe('PUT /api/products/:id', () => {
    it('should return 401 without auth', async () => {
      const res = await request(app).put('/api/products/prod-uuid-1').send({ name: 'Updated' });
      expect(res.statusCode).toBe(401);
    });

    it('should accept update with valid auth', async () => {
      const res = await request(app)
        .put('/api/products/prod-uuid-1')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ name: 'Updated Product' });
      expect([200, 404]).toContain(res.statusCode);
    });
  });

  describe('DELETE /api/products/:id', () => {
    it('should return 401 without auth', async () => {
      const res = await request(app).delete('/api/products/prod-uuid-1');
      expect(res.statusCode).toBe(401);
    });
  });
});

describe('Categories API Tests', () => {
  it('GET /api/categories - should return 401 without auth', async () => {
    const res = await request(app).get('/api/categories');
    expect(res.statusCode).toBe(401);
  });

  it('GET /api/categories - should return 200 with auth', async () => {
    const res = await request(app)
      .get('/api/categories')
      .set('Authorization', `Bearer ${authToken}`);
    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('POST /api/categories - should return 401 without auth', async () => {
    const res = await request(app).post('/api/categories').send({ name: 'Electronics' });
    expect(res.statusCode).toBe(401);
  });
});

describe('Suppliers API Tests', () => {
  it('GET /api/suppliers - should return 401 without auth', async () => {
    const res = await request(app).get('/api/suppliers');
    expect(res.statusCode).toBe(401);
  });

  it('GET /api/suppliers - should return 200 with auth', async () => {
    const res = await request(app)
      .get('/api/suppliers')
      .set('Authorization', `Bearer ${authToken}`);
    expect(res.statusCode).toBe(200);
  });
});

describe('Customers API Tests', () => {
  it('GET /api/customers - should return 401 without auth', async () => {
    const res = await request(app).get('/api/customers');
    expect(res.statusCode).toBe(401);
  });

  it('GET /api/customers - should return 200 with auth', async () => {
    const res = await request(app)
      .get('/api/customers')
      .set('Authorization', `Bearer ${authToken}`);
    expect(res.statusCode).toBe(200);
  });
});

describe('Inventory API Tests', () => {
  it('GET /api/inventory - should return 401 without auth', async () => {
    const res = await request(app).get('/api/inventory');
    expect(res.statusCode).toBe(401);
  });

  it('GET /api/inventory - should return 200 with auth', async () => {
    const res = await request(app)
      .get('/api/inventory')
      .set('Authorization', `Bearer ${authToken}`);
    expect(res.statusCode).toBe(200);
  });
});

describe('Warehouses API Tests', () => {
  it('GET /api/warehouses - should return 401 without auth', async () => {
    const res = await request(app).get('/api/warehouses');
    expect(res.statusCode).toBe(401);
  });

  it('GET /api/warehouses - should return 200 with auth', async () => {
    const res = await request(app)
      .get('/api/warehouses')
      .set('Authorization', `Bearer ${authToken}`);
    expect(res.statusCode).toBe(200);
  });
});

describe('Dashboard API Tests', () => {
  it('GET /api/dashboard - should return 401 without auth', async () => {
    const res = await request(app).get('/api/dashboard');
    expect(res.statusCode).toBe(401);
  });

  it('GET /api/dashboard - should return dashboard data with auth', async () => {
    const res = await request(app)
      .get('/api/dashboard')
      .set('Authorization', `Bearer ${authToken}`);
    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
  });
});

describe('Helper Utilities', () => {
  const { buildPaginationQuery, buildSortQuery, generateUniqueCode } = require('../src/utils/helpers');
  const { getRequiredProductImportColumns, getProductImportSampleColumns, getDuplicateProductKey, normalizeProductImportRow } = require('../src/utils/productImport');

  it('should use product name as the duplicate key regardless of brand', () => {
    expect(getDuplicateProductKey('Desk Lamp')).toBe('desk lamp');
    expect(getDuplicateProductKey(' Desk Lamp ')).toBe('desk lamp');
    expect(getDuplicateProductKey('DESK LAMP')).toBe('desk lamp');
  });

  it('should expose the minimum required product import columns', () => {
    expect(getRequiredProductImportColumns()).toEqual(['name', 'purchase_price', 'selling_price']);
  });

  it('should include brand and unit in the sample import file', () => {
    expect(getProductImportSampleColumns()).toEqual(['name', 'brand', 'unit', 'purchase_price', 'selling_price']);
  });

  it('should normalize product import data for required and optional fields', () => {
    const normalized = normalizeProductImportRow({
      name: ' Desk Lamp ',
      purchase_price: '250.50',
      selling_price: '399.99',
      category: 'Electronics',
      brand: 'Ultra',
      unit: 'pcs',
      is_active: 'true',
      tax_percentage: '12.5',
      reorder_level: '5',
    });

    expect(normalized.name).toBe('Desk Lamp');
    expect(normalized.purchase_price).toBe(250.5);
    expect(normalized.selling_price).toBe(399.99);
    expect(normalized.category).toBe('Electronics');
    expect(normalized.unit).toBe('pcs');
    expect(normalized.is_active).toBe(true);
    expect(normalized.tax_percentage).toBe(12.5);
    expect(normalized.reorder_level).toBe(5);
  });

  it('buildPaginationQuery should default to page 1, limit 20', () => {
    const result = buildPaginationQuery({});
    expect(result.page).toBe(1);
    expect(result.limit).toBe(20);
    expect(result.offset).toBe(0);
  });

  it('buildPaginationQuery should calculate correct offset', () => {
    const result = buildPaginationQuery({ page: 3, limit: 10 });
    expect(result.offset).toBe(20);
  });

  it('buildSortQuery should default to created_at ascending false', () => {
    const result = buildSortQuery({});
    expect(result.sortBy).toBe('created_at');
    expect(result.ascending).toBe(false);
  });

  it('generateUniqueCode should produce code with prefix', () => {
    const code = generateUniqueCode('PRD');
    expect(code.startsWith('PRD-')).toBe(true);
    expect(code.length).toBeGreaterThan(5);
  });

  it('generateUniqueCode should produce unique codes', () => {
    const code1 = generateUniqueCode('TEST');
    const code2 = generateUniqueCode('TEST');
    expect(code1).not.toBe(code2);
  });
});
