/**
 * Creates an admin account or resets an existing admin's password.
 * Usage: npm run create-admin -- "Your Name" you@example.com "a-strong-password"
 */
const bcrypt = require('bcryptjs');
const db = require('../src/db');

const [name, email, password] = process.argv.slice(2);
if (!name || !email || !password) {
  console.log('Usage: npm run create-admin -- "Your Name" you@example.com "a-strong-password"');
  process.exit(1);
}
if (password.length < 10) {
  console.log('Please use a password of at least 10 characters.');
  process.exit(1);
}
const hash = bcrypt.hashSync(password, 10);
const existing = db.prepare('SELECT id FROM admins WHERE email = ?').get(email);
if (existing) {
  db.prepare('UPDATE admins SET name = ?, password_hash = ? WHERE id = ?').run(name, hash, existing.id);
  console.log(`Updated admin ${email}.`);
} else {
  db.prepare('INSERT INTO admins (name, email, password_hash) VALUES (?, ?, ?)').run(name, email, hash);
  console.log(`Created admin ${email}. Sign in at /admin`);
}
