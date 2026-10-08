const crypto = require('crypto');

function ensureToken(req) {
  if (!req.session.csrfToken) req.session.csrfToken = crypto.randomBytes(24).toString('hex');
  return req.session.csrfToken;
}

function tokenMatches(req) {
  const expected = req.session?.csrfToken;
  const sent = (req.body && req.body._csrf) || req.get('x-csrf-token');
  if (!expected || typeof sent !== 'string' || sent.length !== expected.length) return false;
  return crypto.timingSafeEqual(Buffer.from(sent), Buffer.from(expected));
}

/** Exposes the token to views and rejects state-changing requests without it. */
function csrf(req, res, next) {
  res.locals.csrfToken = ensureToken(req);
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  // Multipart bodies are parsed later by multer; those routes call verifyCsrf themselves.
  if (req.is('multipart/form-data')) return next();
  if (tokenMatches(req)) return next();
  return csrfFailure(req, res);
}

function verifyCsrf(req, res, next) {
  if (tokenMatches(req)) return next();
  return csrfFailure(req, res);
}

function csrfFailure(req, res) {
  if (req.xhr || req.get('accept')?.includes('application/json')) {
    return res.status(403).json({ error: 'Your session expired. Please refresh the page and try again.' });
  }
  res.status(403).render('shop/error', {
    title: 'Session expired',
    message: 'Your session expired. Please go back, refresh the page and try again.',
  });
}

module.exports = { csrf, verifyCsrf };
