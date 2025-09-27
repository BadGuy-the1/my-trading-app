import { Pool } from 'pg';
import crypto from 'crypto';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

const ALGO = 'aes-256-ctr';
const ENC_KEY = process.env.ENCRYPTION_KEY || '00000000000000000000000000000000';

function encrypt(text) {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(ALGO, Buffer.from(ENC_KEY, 'hex'), iv);
  const enc = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
  return iv.toString('hex') + ':' + enc.toString('hex');
}
function decrypt(hash) {
  const [ivHex, contentHex] = hash.split(':');
  const iv = Buffer.from(ivHex, 'hex');
  const content = Buffer.from(contentHex, 'hex');
  const decipher = crypto.createDecipheriv(ALGO, Buffer.from(ENC_KEY, 'hex'), iv);
  const dec = Buffer.concat([decipher.update(content), decipher.final()]);
  return dec.toString('utf8');
}

async function addUser(email, passwordHash) {
  const q = 'INSERT INTO users (email, password_hash) VALUES ($1,$2) RETURNING id';
  const r = await pool.query(q, [email, passwordHash]);
  return r.rows[0];
}
async function getUserByEmail(email) {
  const r = await pool.query('SELECT * FROM users WHERE email=$1', [email]);
  return r.rows[0];
}
async function saveUserKeys(userId, key, secret, settings = {}) {
  const eKey = encrypt(key);
  const eSecret = encrypt(secret);
  await pool.query('UPDATE users SET alpaca_key=$1, alpaca_secret=$2, settings=$3 WHERE id=$4',
    [eKey, eSecret, settings, userId]);
}
async function getAllActiveUsers() {
  const r = await pool.query('SELECT * FROM users WHERE active IS DISTINCT FROM FALSE');
  return r.rows.map(row => {
    if (row.alpaca_key && row.alpaca_secret) {
      row.alpaca_key = decrypt(row.alpaca_key);
      row.alpaca_secret = decrypt(row.alpaca_secret);
    }
    return row;
  });
}

export { addUser, getUserByEmail, saveUserKeys, getAllActiveUsers };
