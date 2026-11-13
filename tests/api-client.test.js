import test from 'node:test';
import assert from 'node:assert/strict';
import { apiRequest } from '../api-client.js';

test('API client preserves JSON and wallet authorization headers together', async () => {
  let captured;
  const fetchMock = async (_url, options) => {
    captured = options;
    return { ok: true, json: async () => ({ ok: true }) };
  };
  const response = await apiRequest('/api/quote', {
    method: 'POST',
    headers: { Authorization: 'Bearer test-session' },
    body: JSON.stringify({ confidentiality: 'basic' }),
  }, fetchMock);
  assert.deepEqual(response, { ok: true });
  assert.equal(captured.headers['Content-Type'], 'application/json');
  assert.equal(captured.headers.Authorization, 'Bearer test-session');
  assert.equal(captured.credentials, 'same-origin');
});

test('API client surfaces the server error message', async () => {
  await assert.rejects(
    apiRequest('/api/quote', {}, async () => ({ ok: false, status: 401, json: async () => ({ message: 'Sign-in required' }) })),
    /Sign-in required/
  );
});
