const path = require('path');

require('dotenv').config({ quiet: true });

const root = path.resolve(__dirname, '..');
const env = process.env;

const config = {
  root,
  env: env.NODE_ENV || 'development',
  isProd: env.NODE_ENV === 'production',
  port: Number(env.PORT) || 3000,
  baseUrl: (env.BASE_URL || `http://localhost:${Number(env.PORT) || 3000}`).replace(/\/$/, ''),
  sessionSecret: env.SESSION_SECRET || 'dev-only-secret-change-me',
  databasePath: env.DATABASE_PATH || path.join(root, 'data', 'komaira.db'),
  uploadDir: path.resolve(root, env.UPLOAD_DIR || 'uploads'),
  admin: {
    email: env.ADMIN_EMAIL || '',
    password: env.ADMIN_PASSWORD || '',
  },
  razorpay: {
    keyId: env.RAZORPAY_KEY_ID || '',
    keySecret: env.RAZORPAY_KEY_SECRET || '',
  },
  smtp: {
    host: env.SMTP_HOST || '',
    port: Number(env.SMTP_PORT) || 587,
    user: env.SMTP_USER || '',
    pass: env.SMTP_PASS || '',
    from: env.MAIL_FROM || 'Komaira Boutique <hello@komaira.com>',
  },
};

if (config.isProd && config.sessionSecret === 'dev-only-secret-change-me') {
  throw new Error('SESSION_SECRET must be set in production.');
}

module.exports = config;
