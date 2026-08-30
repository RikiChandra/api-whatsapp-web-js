require('dotenv').config();

const fs = require('fs');
const path = require('path');

const sessionId = process.argv[2] || process.env.DEFAULT_SESSION || 'main';
const token = process.env.SERVICE_TOKEN;
const host = process.env.HOST || '127.0.0.1';
const port = process.env.PORT || '3000';
const sessionDir = path.resolve(process.env.SESSION_DIR || './sessions');
const authDir = path.join(sessionDir, `session-${sessionId}`);
const baseUrl = `http://${host}:${port}`;

if (!token) {
  console.error('SERVICE_TOKEN missing in .env');
  process.exit(1);
}

async function call(method, urlPath) {
  const response = await fetch(`${baseUrl}${urlPath}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
    },
  });

  const body = await response.json().catch(() => ({}));
  return { status: response.status, body };
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function removeDir(dir) {
  if (!fs.existsSync(dir)) {
    return false;
  }

  fs.rmSync(dir, { recursive: true, force: true, maxRetries: 8, retryDelay: 250 });
  return true;
}

(async () => {
  console.log(`resetting session ${sessionId}`);
  console.log(`authDir=${authDir}`);

  const stop = await call('POST', `/v1/sessions/${encodeURIComponent(sessionId)}/stop`).catch((error) => ({
    status: 0,
    body: { error: error.message },
  }));
  console.log(`stop=${stop.status}`);

  await sleep(2000);

  try {
    const removed = removeDir(authDir);
    console.log(removed ? 'removed session folder' : 'session folder already gone');
  } catch (error) {
    console.error(`remove_failed=${error.message}`);
    process.exit(2);
  }

  const start = await call('POST', `/v1/sessions/${encodeURIComponent(sessionId)}/start`);
  console.log(`start=${start.status} session_status=${start.body?.data?.status || 'unknown'}`);
  console.log(`qr=${start.body?.data?.qr ? 'yes' : 'no'}`);
})().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
