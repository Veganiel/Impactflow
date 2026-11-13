import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

async function freePort() {
  const server = createServer();
  await new Promise((resolve, reject) => server.listen(0, '127.0.0.1', resolve).once('error', reject));
  const port = server.address().port;
  await new Promise(resolve => server.close(resolve));
  return port;
}

test('registration, organization onboarding and project submission work end-to-end', async () => {
  const port = await freePort();
  const dataDir = await mkdtemp(path.join(tmpdir(), 'impactflow-test-'));
  const child = spawn(process.execPath, ['server/index.js'], {
    cwd: process.cwd(),
    env: { ...process.env, HOST: '127.0.0.1', PORT: String(port), DATA_DIR: dataDir, APP_ORIGIN: 'http://localhost:5173', NEAR_AI_API_KEY: '', NEAR_AI_MODEL: '' },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  let startupOutput = '';
  child.on('error', error => { startupOutput += `spawn error: ${error.message}\n`; });
  child.stdout.setEncoding('utf8').on('data', chunk => { startupOutput += chunk; });
  child.stderr.setEncoding('utf8').on('data', chunk => { startupOutput += chunk; });
  const base = `http://127.0.0.1:${port}`;
  let cookie = '';
  try {
    let ready = false;
    for (let i = 0; i < 60; i++) {
      try {
        const response = await fetch(`${base}/health`);
        if (response.ok) { ready = true; break; }
      } catch {}
      await delay(150);
    }
    assert.equal(ready, true, `API should start. Child pid: ${child.pid ?? 'not created'}, exit: ${child.exitCode ?? 'still running'}. Output: ${startupOutput || '(none)'}`);

    const headersCheck = await fetch(`${base}/health`);
    assert.equal(headersCheck.headers.get('x-content-type-options'), 'nosniff');
    assert.equal(headersCheck.headers.get('x-frame-options'), 'DENY');
    const crossOrigin = await fetch(`${base}/api/auth/register`, {
      method: 'POST', headers: { 'content-type': 'application/json', origin: 'https://attacker.invalid' },
      body: JSON.stringify({ email: 'blocked@example.org', password: 'correct horse battery staple' })
    });
    assert.equal(crossOrigin.status, 403, 'state-changing requests from untrusted browser origins must be rejected');

    const authRoute = await fetch(`${base}/api/near-intents/authenticate`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ signedData: {} })
    });
    assert.equal(authRoute.status, 400, 'NEAR Intents auth route should exist and validate signed data');

    const confidentialQuote = await fetch(`${base}/api/near-intents/quote-preview`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ originAsset: 'asset:source', destinationAsset: 'asset:destination', amount: '1', recipient: 'valid-recipient', refundTo: 'valid-refund', confidentiality: 'basic' })
    });
    assert.equal(confidentialQuote.status, 401, 'confidential quotes should require a wallet session');

    const registered = await fetch(`${base}/api/auth/register`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'demo@example.org', password: 'correct horse battery staple' })
    });
    assert.equal(registered.status, 201);
    cookie = registered.headers.get('set-cookie')?.split(';')[0] || '';
    assert.ok(cookie.startsWith('if_session='));
    assert.match(registered.headers.get('set-cookie') || '', /HttpOnly/);
    assert.match(registered.headers.get('set-cookie') || '', /SameSite=Lax/);
    const agentNotConfigured = await fetch(`${base}/api/agent/project-readiness`, {
      method: 'POST', headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({ title: 'A sample project title', category: 'nature', goal: 500, description: 'A clear project description that is long enough to pass validation.' })
    });
    assert.equal(agentNotConfigured.status, 503, 'agent must fail clearly when the server key/model are not configured');

    for (let i = 0; i < 10; i++) {
      const failedLogin = await fetch(`${base}/api/auth/login`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: 'guess@example.org', password: 'wrong password' })
      });
      assert.equal(failedLogin.status, 401);
    }
    const blockedLogin = await fetch(`${base}/api/auth/login`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'guess@example.org', password: 'wrong password' })
    });
    assert.equal(blockedLogin.status, 429, 'repeated failed sign-ins should be throttled');

    const orgResponse = await fetch(`${base}/api/organizations`, {
      method: 'POST', headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({ type: 'company', name: 'Impact Demo GmbH', country: 'Germany', cause: 'animals', website: 'https://example.org' })
    });
    assert.equal(orgResponse.status, 201);
    const orgBody = await orgResponse.json();
    assert.equal(orgBody.organization.status, 'unverified');

    const projectResponse = await fetch(`${base}/api/projects`, {
      method: 'POST', headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({ title: 'Build wildlife rescue capacity', description: 'A demonstration campaign to improve rescue capacity and transparent impact reporting.', category: 'animals', goal: 500 })
    });
    assert.equal(projectResponse.status, 201);
    const projectBody = await projectResponse.json();
    assert.equal(projectBody.project.status, 'pending_review');

    const publicProjects = await fetch(`${base}/api/projects`);
    assert.equal(publicProjects.status, 200);
    assert.deepEqual((await publicProjects.json()).projects, [], 'pending projects must not be public');
  } finally {
    child.kill('SIGTERM');
    await rm(dataDir, { recursive: true, force: true });
  }
});
