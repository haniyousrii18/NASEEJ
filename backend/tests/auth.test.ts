import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { app } from '../src/app.js';

describe('Authentication & Identity Mapping', () => {
  it('should authenticate platform administrator and return token', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'admin@naseej.health', password: 'Password123!' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.token).toBeDefined();
    expect(res.body.data.user.systemRole).toBe('platform_admin');
  });

  it('should authenticate medical center doctor and return memberships', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'doctor.noor@naseej.health', password: 'Password123!' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.user.memberships.length).toBeGreaterThan(0);
    expect(res.body.data.user.memberships[0].role).toBe('doctor');
  });

  it('should reject invalid password with 401', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'doctor.noor@naseej.health', password: 'WrongPassword!' });

    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('AUTH_FAILED');
  });

  it('should return authenticated user profile on /api/auth/me', async () => {
    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ email: 'reception.noor@naseej.health', password: 'Password123!' });

    const token = loginRes.body.data.token;

    const meRes = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${token}`);

    expect(meRes.status).toBe(200);
    expect(meRes.body.success).toBe(true);
    expect(meRes.body.data.user.email).toBe('reception.noor@naseej.health');
  });
});
