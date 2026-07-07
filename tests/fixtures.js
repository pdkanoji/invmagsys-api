module.exports = {
  mockUser: {
    id: 'user-uuid-1',
    email: 'admin@test.com',
    first_name: 'Admin',
    last_name: 'User',
    role_id: 'role-uuid-1',
    is_active: true,
    role_name: 'admin',
    total_count: '1',
  },
  mockProduct: {
    id: 'prod-uuid-1',
    code: 'PRD-ABC123',
    name: 'Test Product',
    purchase_price: 100,
    selling_price: 150,
    tax_percentage: 18,
    reorder_level: 10,
    is_active: true,
    created_at: new Date().toISOString(),
    total_count: '1',
  },
};
