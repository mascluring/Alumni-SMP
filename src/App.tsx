import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Briefcase,
  Compass,
  Edit2,
  Loader2,
  LocateFixed,
  LogIn,
  LogOut,
  Mail,
  MapPin,
  Moon,
  Navigation,
  Plus,
  Search,
  Sun,
  UserCheck,
  X,
} from 'lucide-react';
import { AdminUsersView } from './components/AdminUsersView';
import { AlumniFormModal } from './components/AlumniFormModal';
import { AlumniMap } from './components/AlumniMap';
import { AuthModal } from './components/AuthModal';
import { DirectoryView } from './components/DirectoryView';
import { NearbyAlumniView } from './components/NearbyAlumniView';
import { StatsView } from './components/StatsView';
import {
  createAlumni,
  deleteAlumni,
  fetchAlumni,
  fetchCurrentUser,
  logoutAccount,
  setAuthToken,
  updateAlumni,
} from './services/alumniApi';
import type {
  ActiveTab,
  AlumniPayload,
  AlumniRecord,
  AppUser,
  MapUserOrigin,
  OriginPreference,
} from './types/alumni';
import { buildDirectionsUrl, formatDistance, haversineDistanceKm } from './utils/geo';

export function App() {
  const [activeTab, setActiveTab] = useState<ActiveTab>('map');
  const [alumniList, setAlumniList] = useState<AlumniRecord[]>([]);
  const [currentUser, setCurrentUser] = useState<AppUser | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [selectedAlumni, setSelectedAlumni] = useState<AlumniRecord | null>(null);
  const [focusTrigger, setFocusTrigger] = useState<number>(0);

  // Filters on Peta Sebaran
  const [mapSearch, setMapSearch] = useState('');
  const [mapAngkatan, setMapAngkatan] = useState('all');

  // Origin states: profile pin, device GPS, or typed travel location
  const [originPreference, setOriginPreference] = useState<OriginPreference>('gps');
  const [gpsCoords, setGpsCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [isLocatingGps, setIsLocatingGps] = useState(false);
  const [gpsError, setGpsError] = useState<string | null>(null);
  const [customOrigin, setCustomOrigin] = useState<{
    lat: number;
    lng: number;
    label: string;
  } | null>(null);

  // Proximity radius state on Peta Sebaran
  const [showProximityRadius, setShowProximityRadius] = useState(false);
  const [proximityRadiusKm, setProximityRadiusKm] = useState(25);

  // Modals
  const [isAuthOpen, setIsAuthOpen] = useState(false);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingAlumni, setEditingAlumni] = useState<AlumniRecord | null>(null);
  const [pendingDelete, setPendingDelete] = useState<AlumniRecord | null>(null);

  // Theme state (default: dark mode for night comfort)
  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
    try {
      const saved = localStorage.getItem('alumniconnect_theme');
      return saved === 'light' ? 'light' : 'dark';
    } catch {
      return 'dark';
    }
  });

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
    try {
      localStorage.setItem('alumniconnect_theme', theme);
    } catch {
      // Ignore storage errors
    }
  }, [theme]);

  const toggleTheme = useCallback(() => {
    setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'));
  }, []);

  const loadInitialData = useCallback(async () => {
    setIsLoading(true);
    setLoadError(null);
    try {
      const [user, items] = await Promise.all([fetchCurrentUser(), fetchAlumni()]);
      setCurrentUser(user);
      setAlumniList(items);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Gagal memuat data alumni.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadInitialData();
  }, [loadInitialData]);

  const myAlumniRecord = useMemo(() => {
    if (!currentUser) return null;
    return alumniList.find((item) => item.userId === currentUser.id) ?? null;
  }, [alumniList, currentUser]);

  const userOrigin: MapUserOrigin | null = useMemo(() => {
    if (originPreference === 'custom' && customOrigin) {
      return {
        lat: customOrigin.lat,
        lng: customOrigin.lng,
        label: customOrigin.label,
        source: 'custom',
      };
    }
    if (originPreference === 'profile' && myAlumniRecord) {
      return {
        lat: myAlumniRecord.lat,
        lng: myAlumniRecord.lng,
        label: `Pin Profil (${myAlumniRecord.city})`,
        source: 'profile',
      };
    }
    if (gpsCoords) {
      return {
        lat: gpsCoords.lat,
        lng: gpsCoords.lng,
        label: 'Lokasi GPS Saya',
        source: 'gps',
      };
    }
    if (customOrigin) {
      return {
        lat: customOrigin.lat,
        lng: customOrigin.lng,
        label: customOrigin.label,
        source: 'custom',
      };
    }
    if (myAlumniRecord) {
      return {
        lat: myAlumniRecord.lat,
        lng: myAlumniRecord.lng,
        label: `Pin Profil (${myAlumniRecord.city})`,
        source: 'profile',
      };
    }
    return null;
  }, [originPreference, customOrigin, myAlumniRecord, gpsCoords]);

  const handleRequestGpsOrigin = useCallback(() => {
    if (!navigator.geolocation) {
      setGpsError('Browser Anda tidak mendukung akses lokasi GPS.');
      return;
    }
    setIsLocatingGps(true);
    setGpsError(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setGpsCoords({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
        });
        setOriginPreference('gps');
        setIsLocatingGps(false);
      },
      () => {
        setGpsError(
          'Izin GPS tidak diberikan atau perangkat tidak menemukan sinyal lokasi. Anda tetap dapat mengetik lokasi secara manual.'
        );
        setIsLocatingGps(false);
      },
      { enableHighAccuracy: true, timeout: 8000 }
    );
  }, []);

  const handleSelectCustomLocation = useCallback(
    (loc: { lat: number; lng: number; label: string }) => {
      setCustomOrigin(loc);
      setOriginPreference('custom');
      setGpsError(null);
    },
    []
  );

  const angkatanOptions = useMemo(
    () =>
      Array.from(new Set(alumniList.map((a) => a.angkatan))).sort(
        (a, b) => Number(b) - Number(a)
      ),
    [alumniList]
  );

  const filteredMapAlumni = useMemo(() => {
    const q = mapSearch.trim().toLowerCase();
    const list = alumniList.filter((item) => {
      if (mapAngkatan !== 'all' && item.angkatan !== mapAngkatan) return false;
      if (!q) return true;
      return (
        item.name.toLowerCase().includes(q) ||
        item.city.toLowerCase().includes(q) ||
        item.profession.toLowerCase().includes(q) ||
        item.address.toLowerCase().includes(q)
      );
    });

    if (!userOrigin) return list;
    return [...list].sort((a, b) => {
      const da = haversineDistanceKm(userOrigin.lat, userOrigin.lng, a.lat, a.lng);
      const db = haversineDistanceKm(userOrigin.lat, userOrigin.lng, b.lat, b.lng);
      return da - db;
    });
  }, [alumniList, mapSearch, mapAngkatan, userOrigin]);

  const handleLocateOnMap = useCallback((alumni: AlumniRecord) => {
    setSelectedAlumni(alumni);
    setActiveTab('map');
    setFocusTrigger((c) => c + 1);
  }, []);

  const handleOpenOriginOnMap = useCallback((radiusKm: number) => {
    setSelectedAlumni(null);
    setProximityRadiusKm(radiusKm);
    setShowProximityRadius(true);
    setActiveTab('map');
    setFocusTrigger((c) => c + 1);
  }, []);

  const canModifyAlumni = useCallback(
    (item: AlumniRecord | null) => {
      if (!item || !currentUser) return false;
      if (currentUser.role === 'admin') return true;
      return item.userId !== null && item.userId === currentUser.id;
    },
    [currentUser]
  );

  const handleOpenPrimaryLocationAction = () => {
    if (!currentUser) {
      setIsAuthOpen(true);
      return;
    }
    if (currentUser.role === 'admin') {
      setEditingAlumni(null);
      setIsFormOpen(true);
      return;
    }
    // User role: create or edit ONLY their own alumni record
    setEditingAlumni(myAlumniRecord);
    setIsFormOpen(true);
  };

  const handleSaveAlumni = async (payload: AlumniPayload, existingId?: string) => {
    if (existingId) {
      const updated = await updateAlumni(existingId, payload);
      setAlumniList((prev) => prev.map((item) => (item.id === updated.id ? updated : item)));
      if (selectedAlumni?.id === updated.id) {
        setSelectedAlumni(updated);
      }
      return;
    }

    const created = await createAlumni(payload);
    setAlumniList((prev) => [created, ...prev]);
    setSelectedAlumni(created);
    setActiveTab('map');
    setFocusTrigger((c) => c + 1);
  };

  const handleConfirmDelete = async () => {
    if (!pendingDelete) return;
    const target = pendingDelete;
    setPendingDelete(null);
    try {
      const res = await deleteAlumni(target.id);
      setAlumniList((prev) => prev.filter((item) => item.id !== target.id));
      if (selectedAlumni?.id === target.id) {
        setSelectedAlumni(null);
      }
      if (
        res.isSelf ||
        (currentUser?.role === 'user' &&
          (target.userId === currentUser.id || target.id === myAlumniRecord?.id))
      ) {
        setAuthToken(null);
        setCurrentUser(null);
      }
    } catch (err) {
      console.error('Failed to delete alumni:', err);
    }
  };

  const handleLogout = async () => {
    await logoutAccount();
    setCurrentUser(null);
    if (activeTab === 'users') {
      setActiveTab('map');
    }
  };

  const navItems: { id: ActiveTab; label: string }[] = useMemo(() => {
    const base: { id: ActiveTab; label: string }[] = [
      { id: 'map', label: 'Peta Sebaran' },
      { id: 'nearby', label: 'Teman Terdekat' },
      { id: 'directory', label: 'Direktori Alumni' },
      { id: 'stats', label: 'Statistik Angkatan' },
    ];
    if (currentUser?.role === 'admin') {
      base.push({ id: 'users', label: 'Kelola Pengguna' });
    }
    return base;
  }, [currentUser]);

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 text-sm text-slate-600 dark:bg-slate-950 dark:text-slate-300">
        <Loader2 className="mr-2 h-4 w-4 animate-spin text-sky-600 dark:text-sky-400" />
        <span>Memuat aplikasi AlumniConnect SMP...</span>
      </div>
    );
  }

  if (!currentUser) {
    return (
      <div className="relative flex min-h-screen flex-col items-center justify-center bg-slate-100 px-4 py-8 text-slate-900 transition-colors dark:bg-slate-950 dark:text-slate-100">
        <button
          type="button"
          onClick={toggleTheme}
          title={theme === 'dark' ? 'Ganti ke tema terang' : 'Ganti ke tema gelap'}
          aria-label={theme === 'dark' ? 'Ganti ke tema terang' : 'Ganti ke tema gelap'}
          className="absolute top-4 right-4 inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 shadow-xs transition-colors hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
        >
          {theme === 'dark' ? (
            <>
              <Sun className="h-3.5 w-3.5 text-amber-400" />
              <span>Mode Terang</span>
            </>
          ) : (
            <>
              <Moon className="h-3.5 w-3.5 text-sky-600" />
              <span>Mode Gelap</span>
            </>
          )}
        </button>
        <div className="mb-6 w-full max-w-md text-center">
          <h1 className="font-display text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-50">
            AlumniConnect SMP
          </h1>
          <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
            Silakan masuk atau daftar akun terlebih dahulu untuk mengakses peta sebaran, direktori alumni, dan informasi teman terdekat.
          </p>
        </div>
        <div className="w-full max-w-md">
          <AuthModal
            isOpen={true}
            hideClose={true}
            onClose={() => {}}
            onSuccess={(user) => {
              setCurrentUser(user);
              void fetchAlumni().then(setAlumniList).catch(() => undefined);
            }}
          />
        </div>
        {loadError && (
          <div className="mt-4 rounded-lg border border-rose-200 bg-rose-50 px-4 py-2 text-xs text-rose-700 dark:border-rose-500/20 dark:bg-rose-500/10 dark:text-rose-300">
            {loadError}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-slate-50 text-slate-900 transition-colors dark:bg-slate-950 dark:text-slate-100">
      {/* Three-Zone Single-Row Header */}
      <header className="sticky top-0 z-[600] border-b border-slate-200 bg-white transition-colors dark:border-slate-800 dark:bg-slate-900">
        <div className="flex h-14 items-center justify-between gap-4 px-4 sm:px-6">
          {/* Zone 1: Brand Wordmark */}
          <button
            type="button"
            onClick={() => setActiveTab('map')}
            className="font-display text-base font-bold tracking-tight text-slate-900 whitespace-nowrap shrink-0 sm:text-lg dark:text-slate-100"
          >
            AlumniConnect SMP
          </button>

          {/* Zone 2: Navigation Tabs */}
          <nav
            aria-label="Navigasi utama"
            className="flex items-center gap-5 overflow-x-auto text-sm font-medium"
          >
            {navItems.map((tab) => {
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  className={`relative py-4 text-xs sm:text-sm transition-colors whitespace-nowrap shrink-0 ${
                    isActive
                      ? 'font-semibold text-sky-700 dark:text-sky-400'
                      : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100'
                  }`}
                >
                  {tab.label}
                  {isActive && (
                    <span className="absolute right-0 bottom-0 left-0 h-0.5 bg-sky-600 dark:bg-sky-400" />
                  )}
                </button>
              );
            })}
          </nav>

          {/* Zone 3: Auth & Role Action */}
          <div className="flex items-center gap-2 shrink-0">
            {!currentUser ? (
              <button
                type="button"
                onClick={() => setIsAuthOpen(true)}
                className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3.5 py-2 text-xs font-semibold text-white transition-colors hover:bg-slate-800 whitespace-nowrap shrink-0 dark:bg-sky-500 dark:text-slate-950 dark:hover:bg-sky-400"
              >
                <LogIn className="h-3.5 w-3.5" />
                <span>Masuk</span>
              </button>
            ) : (
              <>
                <span className="hidden md:inline text-xs text-slate-600 whitespace-nowrap dark:text-slate-400">
                  {currentUser.username || currentUser.email}
                  <span className="ml-1 font-semibold text-slate-900 dark:text-slate-100">
                    ({currentUser.role === 'admin' ? 'Admin' : 'User'})
                  </span>
                </span>
                <button
                  type="button"
                  onClick={handleOpenPrimaryLocationAction}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-2 text-xs font-semibold text-white transition-colors hover:bg-slate-800 whitespace-nowrap shrink-0 dark:bg-sky-500 dark:text-slate-950 dark:hover:bg-sky-400"
                >
                  <Plus className="h-3.5 w-3.5" />
                  <span>
                    {currentUser.role === 'admin'
                      ? 'Tambah Alumni'
                      : myAlumniRecord
                        ? 'Lokasi Saya'
                        : 'Isi Lokasi Saya'}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={toggleTheme}
                  title={theme === 'dark' ? 'Ganti ke tema terang' : 'Ganti ke tema gelap'}
                  aria-label={theme === 'dark' ? 'Ganti ke tema terang' : 'Ganti ke tema gelap'}
                  className="inline-flex items-center justify-center rounded-lg border border-slate-200 bg-white p-2 text-slate-700 transition-colors hover:bg-slate-50 shrink-0 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                >
                  {theme === 'dark' ? (
                    <Sun className="h-3.5 w-3.5 text-amber-400" />
                  ) : (
                    <Moon className="h-3.5 w-3.5 text-slate-700" />
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => void handleLogout()}
                  title="Keluar dari akun"
                  className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 whitespace-nowrap shrink-0 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                >
                  <LogOut className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">Keluar</span>
                </button>
              </>
            )}
          </div>
        </div>
      </header>

      {/* Main Workspace */}
      {isLoading ? (
        <div className="flex flex-1 items-center justify-center p-8 text-sm text-slate-600 dark:text-slate-300">
          <Loader2 className="mr-2 h-4 w-4 animate-spin text-sky-600 dark:text-sky-400" />
          <span>Memuat data sebaran alumni...</span>
        </div>
      ) : loadError ? (
        <div className="mx-auto mt-10 max-w-md rounded-xl border border-rose-200 bg-white p-6 text-center dark:border-rose-800/70 dark:bg-slate-900">
          <p className="text-sm font-medium text-rose-800 dark:text-rose-300">{loadError}</p>
          <button
            type="button"
            onClick={() => void loadInitialData()}
            className="mt-4 rounded-lg bg-slate-900 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-800 dark:bg-sky-500 dark:text-slate-950 dark:hover:bg-sky-400"
          >
            Muat Ulang
          </button>
        </div>
      ) : activeTab === 'map' ? (
        <main className="flex flex-1 flex-col lg:h-[calc(100vh-3.5rem)] lg:flex-none lg:flex-row lg:overflow-hidden">
          <aside className="order-last flex w-full flex-col border-t border-slate-200 bg-white transition-colors lg:order-first lg:h-full lg:w-[360px] lg:shrink-0 lg:overflow-hidden lg:border-t-0 lg:border-r dark:border-slate-800 dark:bg-slate-900">
            <div className="space-y-2.5 border-b border-slate-200 p-4 dark:border-slate-800">
              <div className="flex items-center justify-between">
                <h2 className="font-display text-sm font-bold text-slate-900 dark:text-slate-100">
                  Sebaran Alumni
                </h2>
                <span className="font-mono text-xs tabular-nums text-slate-500 dark:text-slate-400">
                  {filteredMapAlumni.length} titik
                </span>
              </div>

              <div className="relative">
                <Search className="pointer-events-none absolute top-1/2 left-3 h-3.5 w-3.5 -translate-y-1/2 text-slate-400 dark:text-slate-500" />
                <input
                  type="text"
                  value={mapSearch}
                  onChange={(e) => setMapSearch(e.target.value)}
                  placeholder="Cari nama, kota, atau profesi..."
                  className="w-full rounded-lg border border-slate-300 bg-white py-2 pr-3 pl-8 text-xs text-slate-900 placeholder:text-slate-400 focus:border-sky-600 focus:outline-none dark:border-slate-700 dark:bg-slate-800/80 dark:text-slate-100 dark:placeholder:text-slate-500 dark:focus:border-sky-500"
                />
              </div>

              <div className="flex gap-2">
                <select
                  value={mapAngkatan}
                  onChange={(e) => setMapAngkatan(e.target.value)}
                  aria-label="Filter angkatan peta"
                  className="flex-1 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-800 focus:border-sky-600 focus:outline-none dark:border-slate-700 dark:bg-slate-800/80 dark:text-slate-100 dark:focus:border-sky-500"
                >
                  <option value="all">Semua Angkatan</option>
                  {angkatanOptions.map((y) => (
                    <option key={y} value={y}>
                      Angkatan {y}
                    </option>
                  ))}
                </select>

                <button
                  type="button"
                  onClick={() => setActiveTab('nearby')}
                  className="inline-flex items-center gap-1 rounded-lg border border-sky-200 bg-sky-50 px-2.5 py-1.5 text-xs font-semibold text-sky-800 hover:bg-sky-100 whitespace-nowrap dark:border-sky-800/70 dark:bg-sky-950/60 dark:text-sky-300 dark:hover:bg-sky-900/60"
                >
                  <Compass className="h-3.5 w-3.5" />
                  <span>Cek Posisi</span>
                </button>
              </div>

              <div className="rounded-lg border border-slate-200 bg-slate-50 p-2.5 dark:border-slate-800 dark:bg-slate-800/50">
                <div className="flex items-center justify-between gap-2 text-[11px] text-slate-600 dark:text-slate-400">
                  <span className="font-semibold text-slate-700 dark:text-slate-300">
                    Titik Acuan Jarak
                  </span>
                  {userOrigin && (
                    <span className="truncate font-medium text-sky-700 dark:text-sky-400">
                      {userOrigin.label}
                    </span>
                  )}
                </div>

                <div className="mt-2 flex flex-wrap gap-1.5">
                  <button
                    type="button"
                    onClick={handleRequestGpsOrigin}
                    disabled={isLocatingGps}
                    className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium transition-colors ${
                      userOrigin?.source === 'gps'
                        ? 'bg-slate-900 text-white dark:bg-sky-500 dark:text-slate-950'
                        : 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800'
                    }`}
                  >
                    <LocateFixed className="h-3 w-3" />
                    <span>{isLocatingGps ? 'Mencari...' : 'GPS'}</span>
                  </button>

                  {myAlumniRecord && (
                    <button
                      type="button"
                      onClick={() => setOriginPreference('profile')}
                      className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium transition-colors ${
                        userOrigin?.source === 'profile'
                          ? 'bg-slate-900 text-white dark:bg-sky-500 dark:text-slate-950'
                          : 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800'
                      }`}
                    >
                      <UserCheck className="h-3 w-3" />
                      <span>Pin Profil</span>
                    </button>
                  )}

                  {customOrigin && (
                    <button
                      type="button"
                      onClick={() => setOriginPreference('custom')}
                      className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium transition-colors ${
                        userOrigin?.source === 'custom'
                          ? 'bg-sky-600 text-white dark:bg-sky-500 dark:text-slate-950'
                          : 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800'
                      }`}
                    >
                      <Compass className="h-3 w-3" />
                      <span className="max-w-[120px] truncate">{customOrigin.label}</span>
                    </button>
                  )}
                </div>

                {gpsError && (
                  <p className="mt-1.5 text-[11px] text-rose-700 dark:text-rose-400">{gpsError}</p>
                )}
              </div>
            </div>

            {selectedAlumni && (
              <div className="border-b border-sky-200 bg-sky-50/60 p-4 dark:border-sky-800/60 dark:bg-sky-950/30">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-[11px] font-medium text-sky-800 dark:text-sky-300">
                      Angkatan {selectedAlumni.angkatan} · {selectedAlumni.city}
                      {userOrigin
                        ? ` · ${formatDistance(
                            haversineDistanceKm(
                              userOrigin.lat,
                              userOrigin.lng,
                              selectedAlumni.lat,
                              selectedAlumni.lng
                            )
                          )}`
                        : ''}
                    </div>
                    <h3 className="mt-0.5 truncate font-display text-base font-bold text-slate-900 dark:text-slate-50">
                      {selectedAlumni.name}
                    </h3>
                  </div>
                  <button
                    type="button"
                    onClick={() => setSelectedAlumni(null)}
                    aria-label="Tutup detail alumni"
                    className="rounded-md p-1 text-slate-500 hover:bg-white hover:text-slate-800 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>

                <div className="mt-2 space-y-1 text-xs text-slate-700 dark:text-slate-300">
                  <div className="flex items-center gap-1.5">
                    <Briefcase className="h-3.5 w-3.5 shrink-0 text-slate-500 dark:text-slate-400" />
                    <span>{selectedAlumni.profession}</span>
                  </div>
                  <div className="flex items-start gap-1.5">
                    <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-500 dark:text-slate-400" />
                    <span>{selectedAlumni.address}</span>
                  </div>
                  {selectedAlumni.email && (
                    <div className="flex items-center gap-1.5">
                      <Mail className="h-3.5 w-3.5 shrink-0 text-slate-500 dark:text-slate-400" />
                      <span>{selectedAlumni.email}</span>
                    </div>
                  )}
                </div>

                <div className="mt-3 flex items-center gap-2">
                  <a
                    href={buildDirectionsUrl(
                      { lat: selectedAlumni.lat, lng: selectedAlumni.lng },
                      userOrigin
                    )}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-sky-600 px-3 py-2 text-xs font-semibold text-white hover:bg-sky-700 whitespace-nowrap dark:bg-sky-500 dark:text-slate-950 dark:hover:bg-sky-400"
                  >
                    <Navigation className="h-3.5 w-3.5" />
                    <span>Buka Rute</span>
                  </a>
                  {canModifyAlumni(selectedAlumni) && (
                    <button
                      type="button"
                      onClick={() => {
                        setEditingAlumni(selectedAlumni);
                        setIsFormOpen(true);
                      }}
                      className="inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                    >
                      <Edit2 className="h-3.5 w-3.5" />
                      <span>Edit</span>
                    </button>
                  )}
                </div>
              </div>
            )}

            <div className="flex-1 divide-y divide-slate-100 overflow-y-auto dark:divide-slate-800">
              {filteredMapAlumni.length === 0 ? (
                <div className="p-6 text-center text-xs text-slate-500 dark:text-slate-400">
                  Tidak ada alumni yang sesuai dengan filter saat ini.
                </div>
              ) : (
                filteredMapAlumni.map((item) => {
                  const isSelected = selectedAlumni?.id === item.id;
                  const distKm = userOrigin
                    ? haversineDistanceKm(userOrigin.lat, userOrigin.lng, item.lat, item.lng)
                    : null;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => {
                        setSelectedAlumni(item);
                        setFocusTrigger((c) => c + 1);
                      }}
                      className={`w-full px-4 py-3 text-left transition-colors ${
                        isSelected
                          ? 'bg-sky-50 dark:bg-sky-950/50'
                          : 'hover:bg-slate-50 dark:hover:bg-slate-800/60'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">
                            {item.name}
                          </div>
                          <div className="mt-0.5 truncate text-xs text-slate-600 dark:text-slate-400">
                            Angkatan {item.angkatan} · {item.city}
                          </div>
                          <div className="mt-0.5 truncate text-[11px] text-slate-500 dark:text-slate-400">
                            {item.profession}
                          </div>
                        </div>
                        {distKm !== null && (
                          <span className="font-mono text-xs font-semibold tabular-nums text-sky-700 shrink-0 dark:text-sky-400">
                            {formatDistance(distKm)}
                          </span>
                        )}
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </aside>

          <section className="order-first h-[460px] min-h-[420px] w-full shrink-0 lg:order-last lg:h-full lg:min-h-[420px] lg:flex-1 lg:self-stretch">
            <AlumniMap
              alumniList={filteredMapAlumni}
              selectedAlumni={selectedAlumni}
              onSelectAlumni={setSelectedAlumni}
              userOrigin={userOrigin}
              myAlumniId={myAlumniRecord?.id ?? null}
              focusTrigger={focusTrigger}
              showProximityRadius={showProximityRadius}
              onToggleProximityRadius={setShowProximityRadius}
              proximityRadiusKm={proximityRadiusKm}
              onChangeProximityRadiusKm={setProximityRadiusKm}
              onRequestGpsOrigin={handleRequestGpsOrigin}
              isDark={theme === 'dark'}
              onToggleTheme={toggleTheme}
            />
          </section>
        </main>
      ) : activeTab === 'nearby' ? (
        <main className="flex-1">
          <NearbyAlumniView
            alumniList={alumniList}
            activeOrigin={userOrigin}
            myAlumniRecord={myAlumniRecord}
            onSelectCustomLocation={handleSelectCustomLocation}
            onUseGpsOrigin={handleRequestGpsOrigin}
            onUseProfileOrigin={() => setOriginPreference('profile')}
            isLocatingGps={isLocatingGps}
            gpsError={gpsError}
            onLocateAlumniOnMap={handleLocateOnMap}
            onOpenOriginOnMap={handleOpenOriginOnMap}
          />
        </main>
      ) : activeTab === 'directory' ? (
        <main className="flex-1">
          <DirectoryView
            alumniList={alumniList}
            currentUser={currentUser}
            userOrigin={userOrigin}
            onLocateOnMap={handleLocateOnMap}
            onEditAlumni={(item) => {
              setEditingAlumni(item);
              setIsFormOpen(true);
            }}
            onDeleteAlumni={(item) => setPendingDelete(item)}
          />
        </main>
      ) : activeTab === 'users' && currentUser?.role === 'admin' ? (
        <main className="flex-1">
          <AdminUsersView
            currentUser={currentUser}
            onAlumniListChanged={() => void fetchAlumni().then(setAlumniList).catch(() => undefined)}
          />
        </main>
      ) : (
        <main className="flex-1">
          <StatsView alumniList={alumniList} />
        </main>
      )}

      {/* Auth Modal */}
      <AuthModal
        isOpen={isAuthOpen}
        onClose={() => setIsAuthOpen(false)}
        onSuccess={(user) => {
          setCurrentUser(user);
          void fetchAlumni().then(setAlumniList).catch(() => undefined);
        }}
      />

      {/* Add / Edit Alumni Modal */}
      <AlumniFormModal
        isOpen={isFormOpen}
        editingAlumni={editingAlumni}
        defaultEmail={currentUser?.role === 'user' ? currentUser.email : null}
        onClose={() => {
          setIsFormOpen(false);
          setEditingAlumni(null);
        }}
        onSave={handleSaveAlumni}
      />

      {/* Delete Confirmation Modal */}
      {pendingDelete && (
        <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-xs dark:bg-slate-950/80">
          <div className="w-full max-w-sm rounded-xl border border-slate-200 bg-white p-5 shadow-xl dark:border-slate-800 dark:bg-slate-900">
            <h3 className="font-display text-base font-bold text-slate-900 dark:text-slate-100">
              Hapus Data Alumni?
            </h3>
            <p className="mt-1.5 text-sm text-slate-600 dark:text-slate-300">
              Data lokasi{' '}
              <span className="font-semibold text-slate-900 dark:text-slate-100">
                {pendingDelete.name}
              </span>{' '}
              ({pendingDelete.city}) akan dihapus dari database.
            </p>
            {currentUser?.role === 'user' ? (
              <p className="mt-2 rounded-lg bg-rose-50 p-2 text-xs text-rose-700 dark:border dark:border-rose-900/60 dark:bg-rose-950/60 dark:text-rose-300">
                Perhatian: Menghapus data lokasi alumni ini juga akan otomatis menghapus akun login Anda.
              </p>
            ) : pendingDelete.userId ? (
              <p className="mt-2 rounded-lg bg-amber-50 p-2 text-xs text-amber-800 dark:border dark:border-amber-900/60 dark:bg-amber-950/60 dark:text-amber-300">
                Catatan: Akun login pengguna terkait (role user) juga akan otomatis ikut terhapus.
              </p>
            ) : null}
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setPendingDelete(null)}
                className="rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={() => void handleConfirmDelete()}
                className="rounded-lg bg-rose-600 px-3.5 py-2 text-xs font-semibold text-white hover:bg-rose-700 dark:bg-rose-600 dark:hover:bg-rose-500"
              >
                Hapus
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
