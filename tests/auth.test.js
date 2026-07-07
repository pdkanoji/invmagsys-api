const request = require('supertest');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test_jwt_secret_key';
process.env.JWT_EXPIRES_IN = '1h';
process.env.DATABASE_URL = 'postgresql://postgres:password@localhost:5432/inventory_db_test';

// Mock pg Pool
jest.mock('../src/config/database', () => {
  const mockPool = {
    query: jest.fn().mockResolvedValue({ rows: [], rowCount: 0 }),
    connect: jest.fn().mockResolvedValue({
      query: jest.fn().mockResolvedValue({ rows: [] }),
      release: jest.fn(),
    }),
  };
  return mockPool;
});

const app = require('../src/app');

describe('Auth API Tests', () => {
  describe('POST /api/auth/login', () => {
    it('should return 401 for invalid credentials', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: 'test@test.com', password: 'wrongpassword' });
      expect(res.statusCode).toBe(401);
      expect(res.body.success).toBe(false);
    });

    it('should return 400 for missing email', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ password: 'password123' });
      expect(res.statusCode).toBeGreaterThanOrEqual(400);
    });

    it('should return 400 for missing password', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: 'test@test.com' });
      expect(res.statusCode).toBeGreaterThanOrEqual(400);
    });
  });

  describe('POST /api/auth/forgot-password', () => {
    it('should return 200 with generic message regardless of email existence', async () => {
      const res = await request(app)
        .post('/api/auth/forgot-password')
        .send({ email: 'nonexistent@test.com' });
      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });

  describe('POST /api/auth/reset-password', () => {
    it('should return 400 for invalid reset token', async () => {
      const res = await request(app)
        .post('/api/auth/reset-password')
        .send({ token: 'invalidtoken', password: 'NewPassword123!' });
      expect(res.statusCode).toBe(400);
    });
  });

  describe('POST /api/auth/refresh-token', () => {
    it('should return 401 for missing refresh token', async () => {
      const res = await request(app)
        .post('/api/auth/refresh-token')
        .send({});
      expect(res.statusCode).toBe(401);
    });

    it('should return 401 for invalid refresh token', async () => {
      const res = await request(app)
        .post('/api/auth/refresh-token')
        .send({ refreshToken: 'invalid_token' });
      expect(res.statusCode).toBe(401);
    });
  });

  describe('GET /api/auth/profile', () => {
    it('should return 401 without auth token', async () => {
      const res = await request(app).get('/api/auth/profile');
      expect(res.statusCode).toBe(401);
    });

    it('should return 401 with invalid token', async () => {
      const res = await request(app)
        .get('/api/auth/profile')
        .set('Authorization', 'Bearer invalid_token');
      expect(res.statusCode).toBe(401);
    });
  });

  describe('GET /api/health', () => {
    it('should return 200 for health check', async () => {
      const res = await request(app).get('/api/health');
      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });
});

describe('JWT Token Tests', () => {
  it('should generate a valid access token', () => {
    const token = jwt.sign({ userId: 'test-user-id' }, process.env.JWT_SECRET, { expiresIn: '1h' });
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    expect(decoded.userId).toBe('test-user-id');
  });

  it('should fail verification with wrong secret', () => {
    const token = jwt.sign({ userId: 'test-user-id' }, 'wrong_secret');
    expect(() => jwt.verify(token, process.env.JWT_SECRET)).toThrow();
  });

  it('should reject expired tokens', async () => {
    const token = jwt.sign({ userId: 'test-user-id' }, process.env.JWT_SECRET, { expiresIn: '0s' });
    await new Promise(resolve => setTimeout(resolve, 10));
    expect(() => jwt.verify(token, process.env.JWT_SECRET)).toThrow('jwt expired');
  });
});

describe('Password Hashing Tests', () => {
  it('should hash a password', async () => {
    const hash = await bcrypt.hash('password123', 10);
    expect(hash).not.toBe('password123');
    expect(hash.length).toBeGreaterThan(20);
  });

  it('should verify correct password', async () => {
    const hash = await bcrypt.hash('password123', 10);
    const isValid = await bcrypt.compare('password123', hash);
    expect(isValid).toBe(true);
  });

  it('should reject incorrect password', async () => {
    const hash = await bcrypt.hash('password123', 10);
    const isValid = await bcrypt.compare('wrongpassword', hash);
    expect(isValid).toBe(false);
  });
});
