/** Session-backed one-time messages: req.flash('success' | 'error', text). */
module.exports = function flash(req, res, next) {
  res.locals.flash = req.session.flash || {};
  delete req.session.flash;
  req.flash = (type, message) => {
    req.session.flash = req.session.flash || {};
    req.session.flash[type] = message;
  };
  next();
};
