import React, { useMemo, useState } from 'react';
import { Edit2, MapPin, Navigation, Search, Trash2 } from 'lucide-react';
import type { AlumniRecord, AppUser, MapUserOrigin } from '../types/alumni';
import { buildDirectionsUrl, formatDistance, haversineDistanceKm } from '../utils/geo';

interface DirectoryViewProps {
  alumniList: AlumniRecord[];
  currentUser: AppUser | null;
  userOrigin: MapUserOrigin | null;
  onLocateOnMap: (alumni: AlumniRecord) => void;
  onEditAlumni: (alumni: AlumniRecord) => void;
  onDeleteAlumni: (alumni: AlumniRecord) => void;
}

export const DirectoryView: React.FC<DirectoryViewProps> = ({
  alumniList,
  currentUser,
  userOrigin,
  onLocateOnMap,
  onEditAlumni,
  onDeleteAlumni,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedAngkatan, setSelectedAngkatan] = useState('all');
  const [selectedCity, setSelectedCity] = useState('all');

  const angkatanList = useMemo(
    () =>
      Array.from(new Set(alumniList.map((a) => a.angkatan))).sort(
        (a, b) => Number(b) - Number(a)
      ),
    [alumniList]
  );

  const cityList = useMemo(
    () => Array.from(new Set(alumniList.map((a) => a.city))).sort((a, b) => a.localeCompare(b)),
    [alumniList]
  );

  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return alumniList
      .filter((item) => {
        if (selectedAngkatan !== 'all' && item.angkatan !== selectedAngkatan) return false;
        if (selectedCity !== 'all' && item.city !== selectedCity) return false;
        if (!q) return true;
        return (
          item.name.toLowerCase().includes(q) ||
          item.city.toLowerCase().includes(q) ||
          item.profession.toLowerCase().includes(q) ||
          item.address.toLowerCase().includes(q)
        );
      })
      .sort((a, b) => {
        if (userOrigin) {
          const da = haversineDistanceKm(userOrigin.lat, userOrigin.lng, a.lat, a.lng);
          const db = haversineDistanceKm(userOrigin.lat, userOrigin.lng, b.lat, b.lng);
          return da - db;
        }
        return a.name.localeCompare(b.name);
      });
  }, [alumniList, searchQuery, selectedAngkatan, selectedCity, userOrigin]);

  const canModify = (item: AlumniRecord) => {
    if (!currentUser) return false;
    if (currentUser.role === 'admin') return true;
    return item.userId !== null && item.userId === currentUser.id;
  };

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6">
      <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="font-display text-xl font-bold text-slate-900 dark:text-slate-100">
              Direktori Alumni
            </h1>
            <p className="text-sm text-slate-600 dark:text-slate-400">
              Menampilkan{' '}
              <span className="font-mono font-semibold tabular-nums text-slate-900 dark:text-slate-100">
                {filtered.length}
              </span>{' '}
              dari{' '}
              <span className="font-mono tabular-nums">{alumniList.length}</span> alumni terdaftar.
            </p>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-2.5 sm:grid-cols-3">
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-slate-400 dark:text-slate-500" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Cari nama, kota, profesi, alamat..."
              className="w-full rounded-lg border border-slate-300 bg-white py-2 pr-3 pl-9 text-sm text-slate-900 placeholder:text-slate-400 focus:border-sky-600 focus:outline-none dark:border-slate-700 dark:bg-slate-800/80 dark:text-slate-100 dark:placeholder:text-slate-500 dark:focus:border-sky-400"
            />
          </div>

          <select
            value={selectedAngkatan}
            onChange={(e) => setSelectedAngkatan(e.target.value)}
            aria-label="Filter angkatan"
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 focus:border-sky-600 focus:outline-none dark:border-slate-700 dark:bg-slate-800/80 dark:text-slate-100 dark:focus:border-sky-400"
          >
            <option value="all">Semua Angkatan</option>
            {angkatanList.map((year) => (
              <option key={year} value={year}>
                Angkatan {year}
              </option>
            ))}
          </select>

          <select
            value={selectedCity}
            onChange={(e) => setSelectedCity(e.target.value)}
            aria-label="Filter kota"
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 focus:border-sky-600 focus:outline-none dark:border-slate-700 dark:bg-slate-800/80 dark:text-slate-100 dark:focus:border-sky-400"
          >
            <option value="all">Semua Kota</option>
            {cityList.map((city) => (
              <option key={city} value={city}>
                {city}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="mt-4 overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        {filtered.length === 0 ? (
          <div className="p-8 text-center text-sm text-slate-600 dark:text-slate-400">
            Tidak ada data alumni yang cocok dengan pencarian Anda.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600 dark:border-slate-800 dark:bg-slate-800/60 dark:text-slate-300">
                  <th className="px-4 py-3">Nama Alumni</th>
                  <th className="px-4 py-3">Angkatan</th>
                  <th className="px-4 py-3">Kota &amp; Alamat</th>
                  <th className="px-4 py-3">Profesi</th>
                  {userOrigin && <th className="px-4 py-3 text-right">Jarak</th>}
                  <th className="px-4 py-3 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {filtered.map((item) => {
                  const dist = userOrigin
                    ? haversineDistanceKm(userOrigin.lat, userOrigin.lng, item.lat, item.lng)
                    : null;
                  const allowed = canModify(item);
                  return (
                    <tr
                      key={item.id}
                      className="transition-colors hover:bg-slate-50/70 dark:hover:bg-slate-800/50"
                    >
                      <td className="px-4 py-3 align-top">
                        <div className="font-semibold text-slate-900 dark:text-slate-100">
                          {item.name}
                          {currentUser && item.userId === currentUser.id && (
                            <span className="ml-2 text-xs font-medium text-emerald-700 dark:text-emerald-400">
                              (Anda)
                            </span>
                          )}
                        </div>
                        <div className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                          {item.email || '-'}
                        </div>
                      </td>
                      <td className="px-4 py-3 align-top font-mono text-xs tabular-nums text-slate-700 dark:text-slate-300">
                        {item.angkatan}
                      </td>
                      <td className="px-4 py-3 align-top">
                        <div className="font-medium text-slate-800 dark:text-slate-200">
                          {item.city}
                        </div>
                        <div className="max-w-xs text-xs text-slate-500 dark:text-slate-400">
                          {item.address}
                        </div>
                      </td>
                      <td className="px-4 py-3 align-top text-slate-800 dark:text-slate-200">
                        {item.profession}
                      </td>
                      {userOrigin && (
                        <td className="px-4 py-3 align-top text-right font-mono text-xs font-semibold tabular-nums text-sky-700 dark:text-sky-400 whitespace-nowrap">
                          {dist !== null ? formatDistance(dist) : '-'}
                        </td>
                      )}
                      <td className="px-4 py-3 align-top text-right">
                        <div className="inline-flex items-center justify-end gap-1.5">
                          <button
                            type="button"
                            onClick={() => onLocateOnMap(item)}
                            className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700 whitespace-nowrap"
                          >
                            <MapPin className="h-3.5 w-3.5" />
                            <span>Peta</span>
                          </button>
                          <a
                            href={buildDirectionsUrl(
                              { lat: item.lat, lng: item.lng },
                              userOrigin
                            )}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 rounded-md bg-sky-600 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-sky-700 dark:bg-sky-500 dark:text-slate-950 dark:hover:bg-sky-400 whitespace-nowrap"
                          >
                            <Navigation className="h-3.5 w-3.5" />
                            <span>Rute</span>
                          </a>
                          {allowed && (
                            <>
                              <button
                                type="button"
                                onClick={() => onEditAlumni(item)}
                                title="Edit data"
                                className="rounded-md border border-slate-200 p-1.5 text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                              >
                                <Edit2 className="h-3.5 w-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => onDeleteAlumni(item)}
                                title="Hapus data"
                                className="rounded-md border border-slate-200 p-1.5 text-rose-600 hover:bg-rose-50 dark:border-slate-700 dark:text-rose-400 dark:hover:bg-rose-950/60"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
