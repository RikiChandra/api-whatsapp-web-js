const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');
const entryFile = path.join(rootDir, 'server.js');
const watchDirs = [
  path.join(rootDir, 'src'),
  path.join(rootDir, 'scripts'),
];
const watchFiles = [
  entryFile,
  path.join(rootDir, '.env'),
  path.join(rootDir, 'package.json'),
];
const watchedExtensions = new Set(['.js', '.json', '.env']);

let child = null;
let restarting = false;
let shutdownRequested = false;
let restartTimer = null;
let manualRestart = false;
let lastRestartAt = 0;

function shouldWatch(filePath) {
  const normalized = filePath.replace(/\//g, path.sep);

  if (normalized.includes(`${path.sep}node_modules${path.sep}`)) return false;
  if (normalized.includes(`${path.sep}.git${path.sep}`)) return false;
  if (normalized.includes(`${path.sep}sessions${path.sep}`)) return false;

  if (path.basename(normalized) === '.env') return true;
  return watchedExtensions.has(path.extname(normalized));
}

function startChild(reason = 'initial start') {
  if (shutdownRequested) return;

  console.log(`[dev] starting server (${reason})`);
  child = spawn(process.execPath, [entryFile], {
    cwd: rootDir,
    stdio: 'inherit',
    env: process.env,
  });

  child.on('exit', (code, signal) => {
    const crashed = !manualRestart && !shutdownRequested;
    const detail = signal ? `signal ${signal}` : `code ${code}`;
    console.log(`[dev] server exited (${detail})`);
    child = null;

    if (manualRestart || shutdownRequested) {
      manualRestart = false;
      if (!shutdownRequested) {
        scheduleRestart('file change');
      }
      return;
    }

    if (crashed) {
      scheduleRestart('crash');
    }
  });
}

function scheduleRestart(reason) {
  if (shutdownRequested || restarting) return;

  const now = Date.now();
  const delay = now - lastRestartAt < 1500 ? 1500 : 400;

  restarting = true;
  clearTimeout(restartTimer);
  restartTimer = setTimeout(() => {
    restarting = false;
    lastRestartAt = Date.now();
    startChild(reason);
  }, delay);
}

function restartChild(reason) {
  if (shutdownRequested) return;
  if (!child) {
    scheduleRestart(reason);
    return;
  }

  console.log(`[dev] restarting server (${reason})`);
  manualRestart = true;
  child.kill('SIGTERM');

  setTimeout(() => {
    if (child) {
      child.kill('SIGKILL');
    }
  }, 5000).unref();
}

function watchDirectory(dirPath) {
  if (!fs.existsSync(dirPath)) return;

  fs.watch(dirPath, { recursive: true }, (_eventType, fileName) => {
    if (!fileName) return;
    const fullPath = path.join(dirPath, fileName.toString());
    if (!shouldWatch(fullPath)) return;
    restartChild(path.relative(rootDir, fullPath));
  });
}

function watchFile(filePath) {
  if (!fs.existsSync(filePath)) return;

  fs.watch(filePath, () => {
    if (!shouldWatch(filePath)) return;
    restartChild(path.relative(rootDir, filePath));
  });
}

function shutdown(signal) {
  shutdownRequested = true;
  clearTimeout(restartTimer);

  if (!child) {
    process.exit(0);
  }

  console.log(`[dev] shutting down (${signal})`);
  child.kill('SIGTERM');

  setTimeout(() => {
    if (child) {
      child.kill('SIGKILL');
    }
    process.exit(0);
  }, 5000).unref();
}

for (const dirPath of watchDirs) {
  watchDirectory(dirPath);
}

for (const filePath of watchFiles) {
  watchFile(filePath);
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

startChild();
