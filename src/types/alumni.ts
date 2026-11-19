export type ActiveTab = 'map' | 'nearby' | 'directory' | 'stats' | 'users';

export type OriginPreference = 'profile' | 'gps' | 'custom';

export type UserRole = 'admin' | 'user';

export interface AppUser {
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

export interface AlumniRecord {
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

export interface AlumniPayload {
  name: string;
  angkatan: string;
  city: string;
  address: string;
  profession: string;
  email?: string | null;
  lat: number;
  lng: number;
}

export interface GeocodeCandidate {
  lat: number;
  lng: number;
  displayName: string;
  shortLabel: string;
  city: string;
  region: string;
}

export interface MapUserOrigin {
  lat: number;
  lng: number;
  label: string;
  source: OriginPreference;
}
