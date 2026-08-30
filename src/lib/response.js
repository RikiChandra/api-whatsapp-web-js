function success(res, data = {}, status = 200) {
  return res.status(status).json({ ok: true, data });
}

module.exports = { success };
