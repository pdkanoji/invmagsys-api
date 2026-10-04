process.env.DATABASE_URL = 'postgres://localhost:5432/inventory_db_test';

jest.mock('../src/config/database', () => ({
  query: jest.fn(),
}));

const pool = require('../src/config/database');
const { create } = require('../src/controllers/salesController');

const user = {
  id: '11111111-1111-4111-8111-111111111111',
  admin_id: null,
  role_name: 'super_admin',
};

const makeResponse = () => {
  const res = {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
  };
  return res;
};

describe('Sales product-level discount', () => {
  beforeEach(() => {
    pool.query.mockReset();
  });

  it('uses the product discount from the database for line and sale totals', async () => {
    pool.query.mockImplementation((sql, params) => {
      const query = sql.toLowerCase();
      if (query.includes('from inventory i') && query.includes('join products p')) {
        return Promise.resolve({ rows: [{ available_stock: 10, discount_percentage: 20 }] });
      }
      if (query.includes('insert into sales')) {
        return Promise.resolve({
          rows: [{
            id: '22222222-2222-4222-8222-222222222222',
            subtotal: params[5],
            discount_amount: params[6],
            tax_amount: params[7],
            total_amount: params[8],
          }],
        });
      }
      if (query.includes('insert into sale_items')) return Promise.resolve({ rows: [] });
      if (query.includes('select id, current_stock from inventory')) {
        return Promise.resolve({ rows: [{ id: 'inventory-id', current_stock: 10 }] });
      }
      return Promise.resolve({ rows: [] });
    });

    const req = {
      user,
      body: {
        customer_id: null,
        warehouse_id: '33333333-3333-4333-8333-333333333333',
        sale_date: '2026-10-04',
        discount_amount: 5,
        items: [{
          product_id: '44444444-4444-4444-8444-444444444444',
          quantity: 2,
          unit_price: 100,
          tax_percentage: 18,
          discount_percentage: 0,
        }],
      },
    };
    const res = makeResponse();

    await create(req, res);

    expect(res.statusCode).toBe(201);
    const saleInsert = pool.query.mock.calls.find(([sql]) => sql.toLowerCase().includes('insert into sales'));
    expect(saleInsert[1].slice(5, 9)).toEqual([200, 45, 28.8, 183.8]);

    const itemInsert = pool.query.mock.calls.find(([sql]) => sql.toLowerCase().includes('insert into sale_items'));
    expect(itemInsert[1].slice(4, 8)).toEqual([20, 18, 28.8, 188.8]);
    expect(itemInsert[1][4]).not.toBe(req.body.items[0].discount_percentage);
  });

  it('rejects a product discount outside the valid percentage range', async () => {
    pool.query.mockResolvedValue({ rows: [{ available_stock: 10, discount_percentage: 101 }] });

    const req = {
      user,
      body: {
        warehouse_id: '33333333-3333-4333-8333-333333333333',
        items: [{
          product_id: '44444444-4444-4444-8444-444444444444',
          quantity: 1,
          unit_price: 100,
        }],
      },
    };
    const res = makeResponse();

    await create(req, res);

    expect(res.statusCode).toBe(400);
    expect(res.body.message).toMatch(/discount configured/i);
    expect(pool.query).toHaveBeenCalledTimes(1);
  });
});
