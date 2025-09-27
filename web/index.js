import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import bodyParser from 'body-parser';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { addUser, getUserByEmail, saveUserKeys } from '../db/db.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'please-set-a-secret';

app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));

// register
app.post('/api/register', async (req, res) => {
  const { email, password } = req.body;
  const hashed = await bcrypt.hash(password, 10);
  try {
    const user = await addUser(email, hashed);
    res.json({ ok: true, userId: user.id });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message || 'register failed' });
  }
});

// login
app.post('/api/login', async (req, res) => {
  const { email, password } = req.body;
  const user = await getUserByEmail(email);
  if (!user) return res.status(400).json({ ok: false, error: 'Invalid credentials' });
  const match = await bcrypt.compare(password, user.password_hash);
  if (!match) return res.status(400).json({ ok: false, error: 'Invalid credentials' });
  const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: '12h' });
  res.json({ ok: true, token });
});

// Save Alpaca keys
app.post('/api/keys/save', async (req, res) => {
  try {
    const auth = req.headers.authorization?.split(' ')[1];
    if (!auth) return res.status(401).json({ ok: false });
    const payload = jwt.verify(auth, JWT_SECRET);
    const { alpacaKey, alpacaSecret, settings } = req.body;
    await saveUserKeys(payload.userId, alpacaKey, alpacaSecret, settings || {});
    res.json({ ok: true });
  } catch (err) {
    res.status(401).json({ ok: false, error: err.message });
  }
});

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

app.listen(PORT, () => console.log(`Web service running on port ${PORT}`));
