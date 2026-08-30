function stamp() {
  return new Date().toISOString();
}

function log(level, message, extra) {
  const payload = extra ? ` ${JSON.stringify(extra)}` : '';
  const line = `${stamp()} [${level}] ${message}${payload}`;

  if (level === 'error') {
    console.error(line);
    return;
  }

  if (level === 'warn') {
    console.warn(line);
    return;
  }

  console.log(line);
}

module.exports = {
  info: (message, extra) => log('info', message, extra),
  warn: (message, extra) => log('warn', message, extra),
  error: (message, extra) => log('error', message, extra),
};
