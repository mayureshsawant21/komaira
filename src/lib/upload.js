const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const multer = require('multer');
const config = require('../config');

fs.mkdirSync(config.uploadDir, { recursive: true });

const EXT_BY_MIME = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/gif': '.gif',
  'image/avif': '.avif',
};

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, config.uploadDir),
  filename: (req, file, cb) => cb(null, `${Date.now()}-${crypto.randomBytes(6).toString('hex')}${EXT_BY_MIME[file.mimetype] || ''}`),
});

const upload = multer({
  storage,
  limits: { fileSize: 8 * 1024 * 1024, files: 12 },
  fileFilter: (req, file, cb) => cb(null, Boolean(EXT_BY_MIME[file.mimetype])),
});

/** Checks the file really is an image by looking at its first bytes (the browser-sent type can lie). */
function looksLikeImage(filePath) {
  const fd = fs.openSync(filePath, 'r');
  const buf = Buffer.alloc(16);
  fs.readSync(fd, buf, 0, 16, 0);
  fs.closeSync(fd);
  const hex = buf.toString('hex');
  return hex.startsWith('ffd8ff') // jpeg
    || hex.startsWith('89504e47') // png
    || hex.startsWith('47494638') // gif
    || (buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP')
    || buf.toString('ascii', 4, 12).startsWith('ftypavi'); // avif
}

/** Middleware: drops (and deletes) any uploaded file that is not a real image. */
function keepOnlyImages(req, res, next) {
  const files = req.files || [];
  req.files = files.filter((f) => {
    let ok = false;
    try { ok = looksLikeImage(f.path); } catch { ok = false; }
    if (!ok) fs.rm(f.path, { force: true }, () => {});
    return ok;
  });
  next();
}

/** Public URL for a stored upload. */
function publicPath(file) {
  return '/uploads/' + path.basename(file.filename || file.path);
}

function filesFor(req, field) {
  return (req.files || []).filter((f) => f.fieldname === field);
}

/** Deletes an uploaded file given its public path ("/uploads/abc.jpg"). Ignores anything else. */
function removeUpload(publicUrl) {
  if (!publicUrl || !publicUrl.startsWith('/uploads/')) return;
  const target = path.join(config.uploadDir, path.basename(publicUrl));
  fs.rm(target, { force: true }, () => {});
}

module.exports = { upload, keepOnlyImages, publicPath, filesFor, removeUpload };
