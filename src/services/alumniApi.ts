import type {
  AlumniPayload,
  AlumniRecord,
  AppUser,
  GeocodeCandidate,
  UserRole,
} from '../types/alumni';

let authTokenMemory: string | null = null;

export function setAuthToken(token: string | null) {
  authTokenMemory = token;
}

export function getAuthToken(): string | null {
  return authTokenMemory;
}

function authHeaders(extra?: Record<string, string>): Record<string, string> {
  const headers: Record<string, string> = { ...(extra ?? {}) };
  if (authTokenMemory) {
    headers.Authorization = `Bearer ${authTokenMemory}`;
  }
  return headers;
}

async function parseJsonOrThrow<T>(response: Response, fallbackMessage: string): Promise<T> {
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message =
      typeof payload?.error === 'string' && payload.error.trim()
        ? payload.error
        : fallbackMessage;
    throw new Error(message);
  }
  return payload as T;
}

// Auth endpoints
export async function fetchCurrentUser(): Promise<AppUser | null> {
  const response = await fetch('/api/auth/me', {
    headers: authHeaders(),
    credentials: 'include',
  });
  if (!response.ok) return null;
  const data = (await response.json().catch(() => ({}))) as { user?: AppUser | null };
  return data.user ?? null;
}

export async function loginAccount(
  identifier: string,
  password: string
): Promise<{ user: AppUser; token: string }> {
  const response = await fetch('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ identifier, password }),
  });
  const data = await parseJsonOrThrow<{ user: AppUser; token: string }>(
    response,
    'Gagal masuk. Periksa kembali username/email dan kata sandi.'
  );
  setAuthToken(data.token);
  return data;
}

export async function registerAccount(input: {
  username: string;
  email: string;
  password: string;
}): Promise<{ user: AppUser; token: string }> {
  const response = await fetch('/api/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(input),
  });
  const data = await parseJsonOrThrow<{ user: AppUser; token: string }>(
    response,
    'Gagal mendaftarkan akun baru.'
  );
  setAuthToken(data.token);
  return data;
}

export async function logoutAccount(): Promise<void> {
  await fetch('/api/auth/logout', {
    method: 'POST',
    headers: authHeaders(),
    credentials: 'include',
  }).catch(() => undefined);
  setAuthToken(null);
}

// Alumni endpoints
export async function fetchAlumni(): Promise<AlumniRecord[]> {
  const response = await fetch('/api/alumni', {
    headers: authHeaders(),
    credentials: 'include',
  });
  const data = await parseJsonOrThrow<{ alumni: AlumniRecord[] }>(
    response,
    'Gagal memuat daftar alumni.'
  );
  return data.alumni ?? [];
}

export async function createAlumni(payload: AlumniPayload): Promise<AlumniRecord> {
  const response = await fetch('/api/alumni', {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    credentials: 'include',
    body: JSON.stringify(payload),
  });
  const data = await parseJsonOrThrow<{ alumni: AlumniRecord }>(
    response,
    'Gagal menyimpan lokasi alumni.'
  );
  return data.alumni;
}

export async function updateAlumni(
  id: string,
  payload: Partial<AlumniPayload>
): Promise<AlumniRecord> {
  const response = await fetch(`/api/alumni/${encodeURIComponent(id)}`, {
    method: 'PUT',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    credentials: 'include',
    body: JSON.stringify(payload),
  });
  const data = await parseJsonOrThrow<{ alumni: AlumniRecord }>(
    response,
    'Gagal memperbarui data alumni.'
  );
  return data.alumni;
}

export async function deleteAlumni(
  id: string
): Promise<{ ok: boolean; userDeleted?: boolean; isSelf?: boolean }> {
  const response = await fetch(`/api/alumni/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: authHeaders(),
    credentials: 'include',
  });
  return parseJsonOrThrow<{ ok: boolean; userDeleted?: boolean; isSelf?: boolean }>(
    response,
    'Gagal menghapus data alumni.'
  );
}

// Admin user management endpoints
export async function fetchAdminUsers(): Promise<AppUser[]> {
  const response = await fetch('/api/admin/users', {
    headers: authHeaders(),
    credentials: 'include',
  });
  const data = await parseJsonOrThrow<{ users: AppUser[] }>(
    response,
    'Gagal memuat daftar pengguna.'
  );
  return data.users ?? [];
}

export async function createAdminUser(input: {
  username: string;
  email: string;
  password: string;
  role: UserRole;
  isActive: boolean;
}): Promise<AppUser> {
  const response = await fetch('/api/admin/users', {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    credentials: 'include',
    body: JSON.stringify(input),
  });
  const data = await parseJsonOrThrow<{ user: AppUser }>(
    response,
    'Gagal membuat pengguna baru.'
  );
  return data.user;
}

export async function updateAdminUser(
  id: string,
  input: Partial<{
    username: string | null;
    email: string | null;
    role: UserRole;
    isActive: boolean;
    password: string;
  }>
): Promise<AppUser> {
  const response = await fetch(`/api/admin/users/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    credentials: 'include',
    body: JSON.stringify(input),
  });
  const data = await parseJsonOrThrow<{ user: AppUser }>(
    response,
    'Gagal memperbarui data pengguna.'
  );
  return data.user;
}

export async function deleteAdminUser(id: string): Promise<void> {
  const response = await fetch(`/api/admin/users/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: authHeaders(),
    credentials: 'include',
  });
  await parseJsonOrThrow<{ ok: boolean }>(response, 'Gagal menghapus pengguna.');
}

// Geocoding endpoints
export async function searchGeocodeCandidates(query: string): Promise<GeocodeCandidate[]> {
  const trimmed = query.trim();
  if (trimmed.length < 2) {
    throw new Error('Masukkan minimal 2 karakter nama tempat, jalan, atau kota.');
  }
  const response = await fetch(`/api/geocode?q=${encodeURIComponent(trimmed)}`);
  const data = await parseJsonOrThrow<{ results: GeocodeCandidate[] }>(
    response,
    'Gagal mencari lokasi pada peta.'
  );
  return data.results ?? [];
}

export async function geocodeAddress(query: string): Promise<GeocodeCandidate | null> {
  const candidates = await searchGeocodeCandidates(query);
  return candidates[0] ?? null;
}
