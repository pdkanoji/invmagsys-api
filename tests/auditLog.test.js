const express = require('express');
const request = require('supertest');

jest.mock('../src/config/database', () => ({
  query: jest.fn().mockResolvedValue({ rows: [], rowCount: 1 }),
}));

const pool = require('../src/config/database');
const auditLog = require('../src/middleware/auditLog');

const userId = '11111111-1111-4111-8111-111111111111';
const recordId = '22222222-2222-4222-8222-222222222222';

const app = express();
app.use(express.json());
app.use('/api', auditLog());
app.post('/api/products', (req, res) => {
  req.user = { id: userId };
  res.status(201).json({ success: true, data: { id: recordId } });
});
app.patch('/api/products/:id', (req, res) => {
  req.user = { id: userId };
  res.json({ success: true, data: { id: req.params.id } });
});
app.delete('/api/products/:id', (req, res) => {
  req.user = { id: userId };
  res.json({ success: true });
});
app.put('/api/products/:id/rejected', (req, res) => {
  req.user = { id: userId };
  res.status(400).json({ success: false });
});

describe('Audit log middleware', () => {
  beforeEach(() => {
    pool.query.mockClear();
  });

  it('records successful create, update, and delete events without secrets', async () => {
    await request(app)
      .post('/api/products')
      .send({ name: 'Desk', password: 'do-not-store', metadata: { access_token: 'also-secret', color: 'blue' } })
      .expect(201);
    await request(app).patch(`/api/products/${recordId}`).send({ name: 'Updated desk' }).expect(200);
    await request(app).delete(`/api/products/${recordId}`).expect(200);

    expect(pool.query).toHaveBeenCalledTimes(3);
    expect(pool.query.mock.calls.map((call) => call[1].slice(1, 4))).toEqual([
      ['create', 'products', recordId],
      ['update', 'products', recordId],
      ['delete', 'products', recordId],
    ]);
    expect(JSON.parse(pool.query.mock.calls[0][1][4])).toEqual({
      name: 'Desk',
      metadata: { color: 'blue' },
    });
  });

  it('does not record failed mutation responses', async () => {
    await request(app).put(`/api/products/${recordId}/rejected`).expect(400);

    expect(pool.query).not.toHaveBeenCalled();
  });
});
