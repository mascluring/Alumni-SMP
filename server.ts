import bcrypt from 'bcryptjs';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import express, { type NextFunction, type Request, type Response } from 'express';
import crypto from 'node:crypto';
import fsSync from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load local .env file if present without overwriting runtime environment variables
function loadLocalEnv() {
  const envPath = path.join(__dirname, '.env');
  if (!fsSync.existsSync(envPath)) return;
  try {
    const content = fsSync.readFileSync(envPath, 'utf-8');
    for (const rawLine of content.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line.startsWith('#')) continue;
      const eqIdx = line.indexOf('=');
      if (eqIdx <= 0) continue;
      const key = line.slice(0, eqIdx).trim();
      let val = line.slice(eqIdx + 1).trim();
      if (
        (val.startsWith('"') && val.endsWith('"')) ||
        (val.startsWith("'") && val.endsWith("'"))
      ) {
        val = val.slice(1, -1);
      }
      if (process.env[key] === undefined || process.env[key] === '') {
        process.env[key] = val;
      }
    }
  } catch {
    // Ignore .env read issues
  }
}

loadLocalEnv();

const PORT = Number(process.env.PORT) || 3000;
const DATA_DIR = path.join(__dirname, 'data');
const ALUMNI_FILE = path.join(DATA_DIR, 'alumni.json');
const USERS_FILE = path.join(DATA_DIR, 'users.json');
const SESSION_COOKIE = 'alumniconnect_session';
const SESSION_SECRET =
  process.env.SESSION_SECRET || 'alumniconnect-dev-session-secret-change-me';

const SUPABASE_URL = process.env.SUPABASE_URL?.trim() || '';
const SUPABASE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ||
  process.env.SUPABASE_ANON_KEY?.trim() ||
  '';

const supabase: SupabaseClient | null =
  SUPABASE_URL && SUPABASE_KEY
    ? createClient(SUPABASE_URL, SUPABASE_KEY, {
        auth: { persistSession: false, autoRefreshToken: false },
      })
    : null;

type UserRole = 'admin' | 'user';

interface DbAlumniRow {
  id: string;
  nama: string;
  alamat: string;
  latitude: number;
  longitude: number;
  created_at: string;
  angkatan: string | null;
  kota: string | null;
  profesi: string | null;
  email: string | null;
  user_id: string | null;
}

interface DbAppUserRow {
  id: string;
  role: string;
  username: string | null;
  email: string | null;
  password_hash: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

interface AlumniDto {
  id: string;
  name: string;
  angkatan: string;
  city: string;
  address: string;
  profession: string;
  email: string | null;
  userId: string | null;
  lat: number;
  lng: number;
  createdAt: string;
}

interface AppUserDto {
  id: string;
  role: UserRole;
  username: string | null;
  email: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  alumniId?: string | null;
  alumniName?: string | null;
}

interface AuthRequest extends Request {
  authUser?: AppUserDto;
}

function normalizeRole(role: unknown): UserRole {
  return String(role ?? '').toLowerCase() === 'admin' ? 'admin' : 'user';
}

function mapAlumniRow(raw: Record<string, unknown>): AlumniDto {
  const lat = Number(raw.latitude ?? raw.lat ?? 0);
  const lng = Number(raw.longitude ?? raw.lng ?? 0);
  const now = new Date().toISOString();
  return {
    id: String(raw.id ?? ''),
    name: String(raw.nama ?? raw.name ?? 'Alumni').trim(),
    angkatan: String(raw.angkatan ?? '').trim() || '2015',
    city: String(raw.kota ?? raw.city ?? 'Indonesia').trim(),
    address: String(raw.alamat ?? raw.address ?? raw.kota ?? raw.city ?? '').trim(),
    profession: String(raw.profesi ?? raw.profession ?? 'Alumni').trim(),
    email: raw.email ? String(raw.email).trim() : null,
    userId: raw.user_id ? String(raw.user_id) : raw.userId ? String(raw.userId) : null,
    lat: Number.isFinite(lat) ? lat : -6.2088,
    lng: Number.isFinite(lng) ? lng : 106.8456,
    createdAt: String(raw.created_at ?? raw.createdAt ?? now),
  };
}

function mapUserRow(
  row: DbAppUserRow,
  linkedAlumni?: { id: string; nama: string } | null
): AppUserDto {
  return {
    id: row.id,
    role: normalizeRole(row.role),
    username: row.username ?? null,
    email: row.email ?? null,
    isActive: Boolean(row.is_active),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    alumniId: linkedAlumni?.id ?? null,
    alumniName: linkedAlumni?.nama ?? null,
  };
}

// Support bcrypt ($2a/$2b/$2y), scrypt (salt:hex), and SHA-256 hex hashes
async function verifyPassword(plain: string, storedHash: string): Promise<boolean> {
  if (!plain || !storedHash) return false;
  if (
    storedHash.startsWith('$2a$') ||
    storedHash.startsWith('$2b$') ||
    storedHash.startsWith('$2y$')
  ) {
    return bcrypt.compare(plain, storedHash);
  }
  if (storedHash.includes(':')) {
    const parts = storedHash.split(':');
    const [salt, keyHex] = parts.length === 2 ? parts : parts.slice(-2);
    if (salt && keyHex && keyHex.length % 2 === 0 && /^[a-f0-9]+$/i.test(keyHex)) {
      const derived = crypto.scryptSync(plain, salt, keyHex.length / 2).toString('hex');
      const a = Buffer.from(derived, 'hex');
      const b = Buffer.from(keyHex, 'hex');
      if (a.length === b.length && crypto.timingSafeEqual(a, b)) {
        return true;
      }
    }
  }
  if (storedHash.startsWith('scrypt$')) {
    const [, salt, keyHex] = storedHash.split('$');
    if (salt && keyHex && keyHex.length % 2 === 0 && /^[a-f0-9]+$/i.test(keyHex)) {
      const derived = crypto.scryptSync(plain, salt, keyHex.length / 2).toString('hex');
      const a = Buffer.from(derived, 'hex');
      const b = Buffer.from(keyHex, 'hex');
      if (a.length === b.length && crypto.timingSafeEqual(a, b)) {
        return true;
      }
    }
  }
  if (/^[a-f0-9]{64}$/i.test(storedHash)) {
    const sha = crypto.createHash('sha256').update(plain).digest('hex');
    return sha.toLowerCase() === storedHash.toLowerCase();
  }
  return false;
}

async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, 10);
}

// Signed stateless HMAC session token
function signSessionToken(payload: { sub: string; role: UserRole; exp: number }): string {
  const encoded = Buffer.from(JSON.stringify(payload), 'utf-8').toString('base64url');
  const sig = crypto
    .createHmac('sha256', SESSION_SECRET)
    .update(encoded)
    .digest('base64url');
  return `${encoded}.${sig}`;
}

function verifySessionToken(
  token: string
): { sub: string; role: UserRole; exp: number } | null {
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [encoded, sig] = parts;
  const expectedSig = crypto
    .createHmac('sha256', SESSION_SECRET)
    .update(encoded)
    .digest('base64url');
  const a = Buffer.from(sig);
  const b = Buffer.from(expectedSig);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const parsed = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf-8')) as {
      sub: string;
      role: UserRole;
      exp: number;
    };
    if (!parsed.sub || !parsed.exp || Date.now() > parsed.exp) return null;
    return parsed;
  } catch {
    return null;
  }
}

function extractTokenFromRequest(req: Request): string | null {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.slice(7).trim();
    if (token) return token;
  }
  const cookieHeader = req.headers.cookie;
  if (cookieHeader) {
    for (const pair of cookieHeader.split(';')) {
      const idx = pair.indexOf('=');
      if (idx === -1) continue;
      const key = pair.slice(0, idx).trim();
      const val = pair.slice(idx + 1).trim();
      if (key === SESSION_COOKIE && val) {
        return decodeURIComponent(val);
      }
    }
  }
  return null;
}

function assertLocalFallbackAllowed() {
  if (!supabase && process.env.VERCEL) {
    throw new Error(
      'Database Supabase belum dikonfigurasi di Vercel. Tambahkan SUPABASE_URL dan SUPABASE_SERVICE_ROLE_KEY di Settings > Environment Variables lalu Redeploy.'
    );
  }
}

// Local JSON fallback helpers (used ONLY when SUPABASE_URL & SUPABASE_SERVICE_ROLE_KEY are not set)
async function readLocalAlumni(): Promise<DbAlumniRow[]> {
  assertLocalFallbackAllowed();
  await fs.mkdir(DATA_DIR, { recursive: true });
  try {
    const raw = await fs.readFile(ALUMNI_FILE, 'utf-8');
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed.map((item) => {
        const dto = mapAlumniRow(item as Record<string, unknown>);
        return {
          id: dto.id || crypto.randomUUID(),
          nama: dto.name,
          alamat: dto.address,
          latitude: dto.lat,
          longitude: dto.lng,
          created_at: dto.createdAt,
          angkatan: dto.angkatan,
          kota: dto.city,
          profesi: dto.profession,
          email: dto.email,
          user_id: dto.userId,
        };
      });
    }
  } catch {
    // Seed empty fallback
  }
  return [];
}

async function writeLocalAlumni(rows: DbAlumniRow[]): Promise<void> {
  assertLocalFallbackAllowed();
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(ALUMNI_FILE, JSON.stringify(rows, null, 2), 'utf-8');
}

async function readLocalUsers(): Promise<DbAppUserRow[]> {
  assertLocalFallbackAllowed();
  await fs.mkdir(DATA_DIR, { recursive: true });
  try {
    const raw = await fs.readFile(USERS_FILE, 'utf-8');
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.length > 0) {
      return parsed as DbAppUserRow[];
    }
  } catch {
    // Seed local fallback users only in local JSON mode
  }
  const now = new Date().toISOString();
  const adminHash = await hashPassword('admin123');
  const userHash = await hashPassword('user123');
  const seeded: DbAppUserRow[] = [
    {
      id: '00000000-0000-4000-8000-000000000001',
      role: 'admin',
      username: 'admin',
      email: 'admin@alumniconnect.local',
      password_hash: adminHash,
      is_active: true,
      created_at: now,
      updated_at: now,
    },
    {
      id: '00000000-0000-4000-8000-000000000002',
      role: 'user',
      username: 'alumni',
      email: 'alumni@alumniconnect.local',
      password_hash: userHash,
      is_active: true,
      created_at: now,
      updated_at: now,
    },
  ];
  await fs.writeFile(USERS_FILE, JSON.stringify(seeded, null, 2), 'utf-8');
  return seeded;
}

async function writeLocalUsers(rows: DbAppUserRow[]): Promise<void> {
  assertLocalFallbackAllowed();
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(USERS_FILE, JSON.stringify(rows, null, 2), 'utf-8');
}

// Unified Repository (Supabase primary, JSON fallback if env vars not configured yet)
async function getUserById(userId: string): Promise<DbAppUserRow | null> {
  if (supabase) {
    const { data, error } = await supabase
      .from('app_users')
      .select('*')
      .eq('id', userId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return (data as DbAppUserRow | null) ?? null;
  }
  const users = await readLocalUsers();
  return users.find((u) => u.id === userId) ?? null;
}

async function findUserByIdentifier(identifier: string): Promise<DbAppUserRow | null> {
  const clean = identifier.trim().toLowerCase();
  if (!clean) return null;
  if (supabase) {
    const byEmail = await supabase
      .from('app_users')
      .select('*')
      .ilike('email', clean)
      .limit(1);
    if (byEmail.error) throw new Error(byEmail.error.message);
    if (byEmail.data?.[0]) return byEmail.data[0] as DbAppUserRow;

    const byUsername = await supabase
      .from('app_users')
      .select('*')
      .ilike('username', clean)
      .limit(1);
    if (byUsername.error) throw new Error(byUsername.error.message);
    return (byUsername.data?.[0] as DbAppUserRow | undefined) ?? null;
  }
  const users = await readLocalUsers();
  return (
    users.find(
      (u) =>
        u.email?.toLowerCase() === clean || u.username?.toLowerCase() === clean
    ) ?? null
  );
}

async function listAlumniRows(): Promise<DbAlumniRow[]> {
  if (supabase) {
    const { data, error } = await supabase
      .from('alumni')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) throw new Error(error.message);
    return (data as DbAlumniRow[]) ?? [];
  }
  return readLocalAlumni();
}

async function getAlumniById(id: string): Promise<DbAlumniRow | null> {
  if (supabase) {
    const { data, error } = await supabase
      .from('alumni')
      .select('*')
      .eq('id', id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return (data as DbAlumniRow | null) ?? null;
  }
  const rows = await readLocalAlumni();
  return rows.find((r) => r.id === id) ?? null;
}

async function getAlumniByUserId(userId: string): Promise<DbAlumniRow | null> {
  if (supabase) {
    const { data, error } = await supabase
      .from('alumni')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return (data as DbAlumniRow | null) ?? null;
  }
  const rows = await readLocalAlumni();
  return rows.find((r) => r.user_id === userId) ?? null;
}

// Middleware
async function attachOptionalAuth(req: AuthRequest, _res: Response, next: NextFunction) {
  try {
    const token = extractTokenFromRequest(req);
    if (!token) {
      next();
      return;
    }
    const decoded = verifySessionToken(token);
    if (!decoded) {
      next();
      return;
    }
    const user = await getUserById(decoded.sub);
    if (user && user.is_active) {
      req.authUser = mapUserRow(user);
    }
  } catch (err) {
    console.error('Auth lookup error:', err);
  }
  next();
}

function requireAuth(req: AuthRequest, res: Response, next: NextFunction) {
  if (!req.authUser) {
    res.status(401).json({ error: 'Silakan masuk terlebih dahulu untuk melakukan tindakan ini.' });
    return;
  }
  next();
}

function requireAdmin(req: AuthRequest, res: Response, next: NextFunction) {
  if (!req.authUser) {
    res.status(401).json({ error: 'Silakan masuk sebagai admin terlebih dahulu.' });
    return;
  }
  if (req.authUser.role !== 'admin') {
    res.status(403).json({ error: 'Akses ditolak: menu ini khusus Admin.' });
    return;
  }
  next();
}

function setSessionCookie(req: Request, res: Response, token: string) {
  const isHttps = req.secure || req.headers['x-forwarded-proto'] === 'https';
  res.cookie(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: isHttps ? 'none' : 'lax',
    secure: isHttps,
    maxAge: 7 * 24 * 60 * 60 * 1000,
    path: '/',
  });
}

// Nominatim Geocode Helper
interface NominatimItem {
  lat: string;
  lon: string;
  display_name: string;
  name?: string;
  address?: {
    city?: string;
    town?: string;
    municipality?: string;
    county?: string;
    state_district?: string;
    state?: string;
  };
}

async function queryNominatim(query: string, restrictIndonesia: boolean) {
  const params = new URLSearchParams({
    q: query,
    format: 'jsonv2',
    addressdetails: '1',
    limit: '6',
    'accept-language': 'id',
  });
  if (restrictIndonesia) {
    params.set('countrycodes', 'id');
  }
  const url = `https://nominatim.openstreetmap.org/search?${params.toString()}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'AlumniConnectSMP/1.0 (contact@alumniconnect-smp.local)',
        Accept: 'application/json',
      },
    });
    if (!response.ok) throw new Error(`Nominatim HTTP ${response.status}`);
    const data = (await response.json()) as NominatimItem[];
    return data
      .filter((item) => Number.isFinite(Number(item.lat)) && Number.isFinite(Number(item.lon)))
      .map((item) => {
        const addr = item.address ?? {};
        const city =
          addr.city ||
          addr.town ||
          addr.municipality ||
          addr.county ||
          addr.state_district ||
          addr.state ||
          'Indonesia';
        return {
          lat: Number(item.lat),
          lng: Number(item.lon),
          displayName: item.display_name,
          shortLabel: item.name || item.display_name.split(',')[0]?.trim() || city,
          city,
          region: addr.state || '',
        };
      });
  } finally {
    clearTimeout(timeout);
  }
}

export function createApiApp(): express.Express {
  const app = express();
  app.set('trust proxy', 1);
  app.use(express.json());
  app.use(attachOptionalAuth);

  app.get('/api/health', (_req, res) => {
    res.json({
      ok: true,
      storage: supabase
        ? 'supabase'
        : process.env.VERCEL
          ? 'unconfigured_supabase_on_vercel'
          : 'local_json',
      timestamp: new Date().toISOString(),
    });
  });

  // --- Auth Routes ---
  app.get('/api/auth/me', (req: AuthRequest, res) => {
    res.json({ user: req.authUser ?? null });
  });

  app.post('/api/auth/login', async (req, res) => {
    try {
      const identifier = String(req.body?.identifier ?? '').trim();
      const password = String(req.body?.password ?? '');
      if (!identifier || !password) {
        res.status(400).json({ error: 'Username/email dan kata sandi wajib diisi.' });
        return;
      }

      const user = await findUserByIdentifier(identifier);
      if (!user) {
        res.status(401).json({ error: 'Akun tidak ditemukan.' });
        return;
      }
      if (!user.is_active) {
        res.status(403).json({ error: 'Akun Anda sedang dinonaktifkan oleh Admin.' });
        return;
      }

      const ok = await verifyPassword(password, user.password_hash);
      if (!ok) {
        res.status(401).json({ error: 'Kata sandi salah.' });
        return;
      }

      const dto = mapUserRow(user);
      const token = signSessionToken({
        sub: dto.id,
        role: dto.role,
        exp: Date.now() + 7 * 24 * 60 * 60 * 1000,
      });
      setSessionCookie(req, res, token);
      res.json({ user: dto, token });
    } catch (err) {
      console.error('POST /api/auth/login failed:', err);
      const message =
        err instanceof Error && err.message.includes('Supabase')
          ? err.message
          : 'Gagal memproses login.';
      res.status(500).json({ error: message });
    }
  });

  app.post('/api/auth/register', async (req, res) => {
    try {
      const username = String(req.body?.username ?? '').trim() || null;
      const email = String(req.body?.email ?? '').trim().toLowerCase() || null;
      const password = String(req.body?.password ?? '');

      if ((!username && !email) || password.length < 6) {
        res.status(400).json({
          error: 'Username atau email wajib diisi, dan kata sandi minimal 6 karakter.',
        });
        return;
      }

      const passwordHash = await hashPassword(password);
      const now = new Date().toISOString();
      let createdUser: DbAppUserRow;

      if (supabase) {
        const { data, error } = await supabase
          .from('app_users')
          .insert({
            id: crypto.randomUUID(),
            role: 'user',
            username,
            email,
            password_hash: passwordHash,
            is_active: true,
            created_at: now,
            updated_at: now,
          })
          .select('*')
          .single();
        if (error) {
          if (error.code === '23505') {
            res.status(409).json({ error: 'Username atau email sudah terdaftar.' });
            return;
          }
          throw new Error(error.message);
        }
        createdUser = data as DbAppUserRow;

        // Auto-link an unowned alumni row with matching email if one exists
        if (email) {
          await supabase
            .from('alumni')
            .update({ user_id: createdUser.id })
            .ilike('email', email)
            .is('user_id', null);
        }
      } else {
        const users = await readLocalUsers();
        const dup = users.find(
          (u) =>
            (username && u.username?.toLowerCase() === username.toLowerCase()) ||
            (email && u.email?.toLowerCase() === email.toLowerCase())
        );
        if (dup) {
          res.status(409).json({ error: 'Username atau email sudah terdaftar.' });
          return;
        }
        createdUser = {
          id: crypto.randomUUID(),
          role: 'user',
          username,
          email,
          password_hash: passwordHash,
          is_active: true,
          created_at: now,
          updated_at: now,
        };
        users.push(createdUser);
        await writeLocalUsers(users);
      }

      const dto = mapUserRow(createdUser);
      const token = signSessionToken({
        sub: dto.id,
        role: dto.role,
        exp: Date.now() + 7 * 24 * 60 * 60 * 1000,
      });
      setSessionCookie(req, res, token);
      res.status(201).json({ user: dto, token });
    } catch (err) {
      console.error('POST /api/auth/register failed:', err);
      res.status(500).json({
        error: err instanceof Error ? err.message : String(err),
      });
    }
  });

  app.post('/api/auth/logout', (_req, res) => {
    res.clearCookie(SESSION_COOKIE, { path: '/' });
    res.json({ ok: true });
  });

  // --- Alumni Routes ---
  app.get('/api/alumni', async (_req, res) => {
    try {
      const rows = await listAlumniRows();
      res.json({ alumni: rows.map((r) => mapAlumniRow(r as unknown as Record<string, unknown>)) });
    } catch (err) {
      console.error('GET /api/alumni failed:', err);
      const message =
        err instanceof Error && err.message.includes('Supabase')
          ? err.message
          : 'Gagal memuat data alumni dari database.';
      res.status(500).json({ error: message });
    }
  });

  app.post('/api/alumni', requireAuth, async (req: AuthRequest, res) => {
    try {
      const actor = req.authUser!;
      const body = req.body ?? {};
      const nama = String(body.name ?? body.nama ?? '').trim();
      const alamat = String(body.address ?? body.alamat ?? '').trim();
      const kota = String(body.city ?? body.kota ?? '').trim();
      const angkatan = String(body.angkatan ?? '').trim();
      const profesi = String(body.profession ?? body.profesi ?? '').trim();
      const email = String(body.email ?? '').trim().toLowerCase() || null;
      const latitude = Number(body.lat ?? body.latitude);
      const longitude = Number(body.lng ?? body.longitude);

      if (!nama || !alamat || !Number.isFinite(latitude) || !Number.isFinite(longitude)) {
        res.status(400).json({
          error: 'Nama, alamat, serta koordinat lokasi wajib diisi.',
        });
        return;
      }

      // Role 'user' can only own one alumni pin linked to their user_id
      if (actor.role === 'user') {
        const existingMine = await getAlumniByUserId(actor.id);
        if (existingMine) {
          res.status(409).json({
            error: 'Akun Anda sudah memiliki pin lokasi alumni. Gunakan tombol Edit pada Lokasi Saya.',
          });
          return;
        }
      }

      const assignedUserId = actor.role === 'user' ? actor.id : body.userId || null;
      const now = new Date().toISOString();

      if (supabase) {
        const { data, error } = await supabase
          .from('alumni')
          .insert({
            nama,
            alamat,
            latitude,
            longitude,
            created_at: now,
            angkatan: angkatan || null,
            kota: kota || null,
            profesi: profesi || null,
            email: email ?? (actor.role === 'user' ? actor.email : null),
            user_id: assignedUserId,
          })
          .select('*')
          .single();

        if (error) {
          if (error.code === '23505') {
            res.status(409).json({
              error: 'Email atau akun tersebut sudah terdaftar pada pin alumni lain.',
            });
            return;
          }
          throw new Error(error.message);
        }
        res.status(201).json({ alumni: mapAlumniRow(data as Record<string, unknown>) });
        return;
      }

      const rows = await readLocalAlumni();
      const created: DbAlumniRow = {
        id: crypto.randomUUID(),
        nama,
        alamat,
        latitude,
        longitude,
        created_at: now,
        angkatan: angkatan || null,
        kota: kota || null,
        profesi: profesi || null,
        email: email ?? (actor.role === 'user' ? actor.email : null),
        user_id: assignedUserId,
      };
      rows.unshift(created);
      await writeLocalAlumni(rows);
      res.status(201).json({ alumni: mapAlumniRow(created as unknown as Record<string, unknown>) });
    } catch (err) {
      console.error('POST /api/alumni failed:', err);
      res.status(500).json({ error: 'Gagal menyimpan data alumni.' });
    }
  });

  app.put('/api/alumni/:id', requireAuth, async (req: AuthRequest, res) => {
    try {
      const actor = req.authUser!;
      const id = String(req.params.id ?? '');
      const existing = await getAlumniById(id);
      if (!existing) {
        res.status(404).json({ error: 'Data alumni tidak ditemukan.' });
        return;
      }

      if (actor.role !== 'admin' && existing.user_id !== actor.id) {
        res.status(403).json({
          error: 'Anda hanya dapat mengubah lokasi alumni milik akun Anda sendiri.',
        });
        return;
      }

      const body = req.body ?? {};
      const patch = {
        nama:
          body.name !== undefined || body.nama !== undefined
            ? String(body.name ?? body.nama).trim() || existing.nama
            : existing.nama,
        alamat:
          body.address !== undefined || body.alamat !== undefined
            ? String(body.address ?? body.alamat).trim() || existing.alamat
            : existing.alamat,
        kota:
          body.city !== undefined || body.kota !== undefined
            ? String(body.city ?? body.kota).trim() || null
            : existing.kota,
        angkatan:
          body.angkatan !== undefined ? String(body.angkatan).trim() || null : existing.angkatan,
        profesi:
          body.profession !== undefined || body.profesi !== undefined
            ? String(body.profession ?? body.profesi).trim() || null
            : existing.profesi,
        email:
          body.email !== undefined
            ? String(body.email ?? '').trim().toLowerCase() || null
            : existing.email,
        latitude: Number.isFinite(Number(body.lat ?? body.latitude))
          ? Number(body.lat ?? body.latitude)
          : existing.latitude,
        longitude: Number.isFinite(Number(body.lng ?? body.longitude))
          ? Number(body.lng ?? body.longitude)
          : existing.longitude,
      };

      if (supabase) {
        const { data, error } = await supabase
          .from('alumni')
          .update(patch)
          .eq('id', id)
          .select('*')
          .single();
        if (error) {
          if (error.code === '23505') {
            res.status(409).json({ error: 'Email sudah digunakan oleh alumni lain.' });
            return;
          }
          throw new Error(error.message);
        }
        res.json({ alumni: mapAlumniRow(data as Record<string, unknown>) });
        return;
      }

      const rows = await readLocalAlumni();
      const idx = rows.findIndex((r) => r.id === id);
      rows[idx] = { ...existing, ...patch };
      await writeLocalAlumni(rows);
      res.json({ alumni: mapAlumniRow(rows[idx] as unknown as Record<string, unknown>) });
    } catch (err) {
      console.error('PUT /api/alumni/:id failed:', err);
      res.status(500).json({ error: 'Gagal memperbarui data alumni.' });
    }
  });

  app.delete('/api/alumni/:id', requireAuth, async (req: AuthRequest, res) => {
    try {
      const actor = req.authUser!;
      const id = String(req.params.id ?? '');
      const existing = await getAlumniById(id);
      if (!existing) {
        res.status(404).json({ error: 'Data alumni tidak ditemukan.' });
        return;
      }

      if (actor.role !== 'admin' && existing.user_id !== actor.id) {
        res.status(403).json({
          error: 'Hanya Admin atau pemilik akun yang dapat menghapus data ini.',
        });
        return;
      }

      let linkedUserDeleted = false;
      let isSelfDeleted = false;

      // Check linked user: if role is 'user' (not admin), cascade delete the user account
      let shouldDeleteLinkedUser = false;
      if (existing.user_id) {
        const linkedUser = await getUserById(existing.user_id);
        if (linkedUser && linkedUser.role === 'user') {
          shouldDeleteLinkedUser = true;
        }
      }

      if (supabase) {
        // 1. Delete alumni record first
        const { error: alumniErr } = await supabase.from('alumni').delete().eq('id', id);
        if (alumniErr) throw new Error(alumniErr.message);

        // 2. Delete linked user account from app_users if role was 'user'
        if (shouldDeleteLinkedUser && existing.user_id) {
          const { error: userErr } = await supabase
            .from('app_users')
            .delete()
            .eq('id', existing.user_id);
          if (userErr) {
            console.warn('Failed to delete linked user from app_users:', userErr.message);
          } else {
            linkedUserDeleted = true;
          }

          if (actor.id === existing.user_id) {
            isSelfDeleted = true;
            res.clearCookie(SESSION_COOKIE, { path: '/' });
          }
        }

        res.json({ ok: true, userDeleted: linkedUserDeleted, isSelf: isSelfDeleted });
        return;
      }

      // Local fallback
      const rows = await readLocalAlumni();
      await writeLocalAlumni(rows.filter((r) => r.id !== id));

      if (shouldDeleteLinkedUser && existing.user_id) {
        const users = await readLocalUsers();
        await writeLocalUsers(users.filter((u) => u.id !== existing.user_id));
        linkedUserDeleted = true;
        if (actor.id === existing.user_id) {
          isSelfDeleted = true;
          res.clearCookie(SESSION_COOKIE, { path: '/' });
        }
      }

      res.json({ ok: true, userDeleted: linkedUserDeleted, isSelf: isSelfDeleted });
    } catch (err) {
      console.error('DELETE /api/alumni/:id failed:', err);
      res.status(500).json({ error: 'Gagal menghapus data alumni.' });
    }
  });

  // --- Admin User Management Routes (app_users) ---
  app.get('/api/admin/users', requireAdmin, async (_req, res) => {
    try {
      const alumniRows = await listAlumniRows();
      const alumniByUserId = new Map<string, { id: string; nama: string }>();
      for (const a of alumniRows) {
        if (a.user_id) alumniByUserId.set(a.user_id, { id: a.id, nama: a.nama });
      }

      if (supabase) {
        const { data, error } = await supabase
          .from('app_users')
          .select('id, role, username, email, is_active, created_at, updated_at')
          .order('created_at', { ascending: false });
        if (error) throw new Error(error.message);
        const users = ((data ?? []) as DbAppUserRow[]).map((u) =>
          mapUserRow(u, alumniByUserId.get(u.id))
        );
        res.json({ users });
        return;
      }

      const users = (await readLocalUsers()).map((u) =>
        mapUserRow(u, alumniByUserId.get(u.id))
      );
      res.json({ users });
    } catch (err) {
      console.error('GET /api/admin/users failed:', err);
      res.status(500).json({ error: 'Gagal memuat daftar akun pengguna.' });
    }
  });

  app.post('/api/admin/users', requireAdmin, async (req, res) => {
    try {
      const username = String(req.body?.username ?? '').trim() || null;
      const email = String(req.body?.email ?? '').trim().toLowerCase() || null;
      const password = String(req.body?.password ?? '');
      const role = normalizeRole(req.body?.role);
      const isActive = req.body?.isActive !== undefined ? Boolean(req.body.isActive) : true;

      if ((!username && !email) || password.length < 6) {
        res.status(400).json({
          error: 'Username atau email wajib diisi, dan kata sandi minimal 6 karakter.',
        });
        return;
      }

      const passwordHash = await hashPassword(password);
      const now = new Date().toISOString();

      if (supabase) {
        const { data, error } = await supabase
          .from('app_users')
          .insert({
            id: crypto.randomUUID(),
            role,
            username,
            email,
            password_hash: passwordHash,
            is_active: isActive,
            created_at: now,
            updated_at: now,
          })
          .select('id, role, username, email, is_active, created_at, updated_at')
          .single();
        if (error) {
          if (error.code === '23505') {
            res.status(409).json({ error: 'Username atau email sudah terdaftar.' });
            return;
          }
          throw new Error(error.message);
        }
        res.status(201).json({ user: mapUserRow(data as DbAppUserRow) });
        return;
      }

      const users = await readLocalUsers();
      const dup = users.find(
        (u) =>
          (username && u.username?.toLowerCase() === username.toLowerCase()) ||
          (email && u.email?.toLowerCase() === email.toLowerCase())
      );
      if (dup) {
        res.status(409).json({ error: 'Username atau email sudah terdaftar.' });
        return;
      }
      const created: DbAppUserRow = {
        id: crypto.randomUUID(),
        role,
        username,
        email,
        password_hash: passwordHash,
        is_active: isActive,
        created_at: now,
        updated_at: now,
      };
      users.unshift(created);
      await writeLocalUsers(users);
      res.status(201).json({ user: mapUserRow(created) });
    } catch (err) {
      console.error('POST /api/admin/users failed:', err);
      res.status(500).json({ error: 'Gagal menambahkan akun pengguna.' });
    }
  });

  app.patch('/api/admin/users/:id', requireAdmin, async (req: AuthRequest, res) => {
    try {
      const actor = req.authUser!;
      const id = String(req.params.id ?? '');
      const existing = await getUserById(id);
      if (!existing) {
        res.status(404).json({ error: 'Akun tidak ditemukan.' });
        return;
      }

      const nextRole =
        req.body?.role !== undefined ? normalizeRole(req.body.role) : normalizeRole(existing.role);
      const nextActive =
        req.body?.isActive !== undefined ? Boolean(req.body.isActive) : existing.is_active;

      if (actor.id === id && (nextRole !== 'admin' || !nextActive)) {
        res.status(400).json({
          error: 'Anda tidak dapat menurunkan role atau menonaktifkan akun admin Anda sendiri.',
        });
        return;
      }

      const nextPassword = String(req.body?.password ?? '');
      const patch: Record<string, unknown> = {
        role: nextRole,
        is_active: nextActive,
        username:
          req.body?.username !== undefined
            ? String(req.body.username ?? '').trim() || null
            : existing.username,
        email:
          req.body?.email !== undefined
            ? String(req.body.email ?? '').trim().toLowerCase() || null
            : existing.email,
        updated_at: new Date().toISOString(),
      };

      if (nextPassword.length > 0) {
        if (nextPassword.length < 6) {
          res.status(400).json({ error: 'Kata sandi baru minimal 6 karakter.' });
          return;
        }
        patch.password_hash = await hashPassword(nextPassword);
      }

      if (supabase) {
        const { data, error } = await supabase
          .from('app_users')
          .update(patch)
          .eq('id', id)
          .select('id, role, username, email, is_active, created_at, updated_at')
          .single();
        if (error) {
          if (error.code === '23505') {
            res.status(409).json({ error: 'Username atau email sudah dipakai akun lain.' });
            return;
          }
          throw new Error(error.message);
        }
        res.json({ user: mapUserRow(data as DbAppUserRow) });
        return;
      }

      const users = await readLocalUsers();
      const idx = users.findIndex((u) => u.id === id);
      users[idx] = { ...existing, ...patch } as DbAppUserRow;
      await writeLocalUsers(users);
      res.json({ user: mapUserRow(users[idx]) });
    } catch (err) {
      console.error('PATCH /api/admin/users/:id failed:', err);
      res.status(500).json({ error: 'Gagal memperbarui akun pengguna.' });
    }
  });

  app.delete('/api/admin/users/:id', requireAdmin, async (req: AuthRequest, res) => {
    try {
      const actor = req.authUser!;
      const id = String(req.params.id ?? '');
      if (actor.id === id) {
        res.status(400).json({ error: 'Anda tidak dapat menghapus akun admin Anda sendiri.' });
        return;
      }

      if (supabase) {
        // 1. Delete associated alumni data first (cascade)
        const { error: alumniErr } = await supabase.from('alumni').delete().eq('user_id', id);
        if (alumniErr) {
          console.warn('Deleting linked alumni row failed or no row:', alumniErr.message);
        }

        // 2. Delete user account from app_users
        const { error } = await supabase.from('app_users').delete().eq('id', id);
        if (error) throw new Error(error.message);
        res.json({ ok: true });
        return;
      }

      // Local fallback
      const alumniRows = await readLocalAlumni();
      await writeLocalAlumni(alumniRows.filter((r) => r.user_id !== id));

      const users = await readLocalUsers();
      await writeLocalUsers(users.filter((u) => u.id !== id));
      res.json({ ok: true });
    } catch (err) {
      console.error('DELETE /api/admin/users/:id failed:', err);
      res.status(500).json({ error: 'Gagal menghapus akun pengguna.' });
    }
  });

  // --- Geocoding Route ---
  app.get('/api/geocode', async (req, res) => {
    const q = String(req.query.q ?? '').trim();
    if (!q || q.length < 2) {
      res.status(400).json({ error: 'Masukkan minimal 2 karakter nama tempat atau alamat.' });
      return;
    }
    try {
      let results = await queryNominatim(q, true);
      if (results.length === 0) {
        results = await queryNominatim(q, false);
      }
      res.json({ results });
    } catch (err) {
      console.error('GET /api/geocode failed:', err);
      res.status(502).json({
        error: 'Layanan pencarian lokasi OpenStreetMap sedang sibuk. Silakan coba lagi.',
      });
    }
  });

  return app;
}

async function startServer() {
  const app = createApiApp();
  const isProd = process.env.NODE_ENV === 'production';
  if (!isProd) {
    const vitePkg = 'vite';
    const { createServer: createViteServer } = await import(vitePkg);
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.join(__dirname, 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(
      `AlumniConnect SMP running on http://localhost:${PORT} (storage: ${
        supabase ? 'Supabase' : 'local JSON fallback'
      })`
    );
  });
}

if (!process.env.VERCEL) {
  startServer().catch((err) => {
    console.error('Fatal server startup error:', err);
    process.exit(1);
  });
}
