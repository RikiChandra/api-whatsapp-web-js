function normalizeWaId(input) {
  if (!input || typeof input !== 'string') return input;
  if (input.includes('@')) return input;

  let digits = input.replace(/\D+/g, '');
  if (!digits) return input;

  // Indonesian local numbers: 08xxx -> 628xxx
  if (digits.startsWith('0')) {
    digits = `62${digits.slice(1)}`;
  } else if (!digits.startsWith('62') && digits.startsWith('8')) {
    digits = `62${digits}`;
  }

  return `${digits}@c.us`;
}

module.exports = { normalizeWaId };
