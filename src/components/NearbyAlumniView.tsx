import React, { useMemo, useState } from 'react';
import {
  Briefcase,
  Compass,
  Loader2,
  LocateFixed,
  Mail,
  MapPin,
  Navigation,
  Search,
  UserCheck,
} from 'lucide-react';
import { searchGeocodeCandidates } from '../services/alumniApi';
import type { AlumniRecord, GeocodeCandidate, MapUserOrigin } from '../types/alumni';
import { buildDirectionsUrl, formatDistance, haversineDistanceKm } from '../utils/geo';

interface NearbyAlumniViewProps {
  alumniList: AlumniRecord[];
  activeOrigin: MapUserOrigin | null;
  myAlumniRecord: AlumniRecord | null;
  onSelectCustomLocation: (candidate: { lat: number; lng: number; label: string }) => void;
  onUseGpsOrigin: () => void;
  onUseProfileOrigin: () => void;
  isLocatingGps: boolean;
  gpsError: string | null;
  onLocateAlumniOnMap: (alumni: AlumniRecord) => void;
  onOpenOriginOnMap: (radiusKm: number) => void;
}

const QUICK_PLACES = [
  'Malioboro Yogyakarta',
  'Stasiun Gubeng Surabaya',
  'Dago Bandung',
  'SCBD Jakarta Selatan',
  'Simpang Lima Semarang',
];

export const NearbyAlumniView: React.FC<NearbyAlumniViewProps> = ({
  alumniList,
  activeOrigin,
  myAlumniRecord,
  onSelectCustomLocation,
  onUseGpsOrigin,
  onUseProfileOrigin,
  isLocatingGps,
  gpsError,
  onLocateAlumniOnMap,
  onOpenOriginOnMap,
}) => {
  const [query, setQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [candidates, setCandidates] = useState<GeocodeCandidate[]>([]);
  const [selectedCandidateIndex, setSelectedCandidateIndex] = useState<number>(0);

  const [radiusKm, setRadiusKm] = useState<number>(25);
  const [showAllDistances, setShowAllDistances] = useState<boolean>(false);
  const [selectedAngkatan, setSelectedAngkatan] = useState<string>('all');

  const angkatanOptions = useMemo(() => {
    return Array.from(new Set(alumniList.map((a) => a.angkatan))).sort(
      (a, b) => Number(b) - Number(a)
    );
  }, [alumniList]);

  const handleSearchPosition = async (inputQuery: string) => {
    const trimmed = inputQuery.trim();
    if (trimmed.length < 2) {
      setSearchError('Ketik minimal 2 karakter nama tempat, jalan, stasiun, atau kota.');
      return;
    }

    setIsSearching(true);
    setSearchError(null);
    try {
      const results = await searchGeocodeCandidates(trimmed);
      setCandidates(results);
      if (results.length === 0) {
        setSearchError(
          `Lokasi "${trimmed}" tidak ditemukan. Coba tambahkan nama kota, misalnya "${trimmed} Bandung".`
        );
        return;
      }
      setSelectedCandidateIndex(0);
      const best = results[0];
      onSelectCustomLocation({
        lat: best.lat,
        lng: best.lng,
        label: best.shortLabel || best.city || trimmed,
      });
    } catch (err) {
      setSearchError(
        err instanceof Error
          ? err.message
          : 'Gagal mencari lokasi posisi Anda. Silakan coba lagi.'
      );
    } finally {
      setIsSearching(false);
    }
  };

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    void handleSearchPosition(query);
  };

  const handlePickCandidate = (candidate: GeocodeCandidate, idx: number) => {
    setSelectedCandidateIndex(idx);
    onSelectCustomLocation({
      lat: candidate.lat,
      lng: candidate.lng,
      label: candidate.shortLabel || candidate.city || candidate.displayName,
    });
  };

  const rankedAlumni = useMemo(() => {
    if (!activeOrigin) return [];
    return alumniList
      .filter((item) =>
        selectedAngkatan === 'all' ? true : item.angkatan === selectedAngkatan
      )
      .map((item) => ({
        alumni: item,
        distanceKm: haversineDistanceKm(
          activeOrigin.lat,
          activeOrigin.lng,
          item.lat,
          item.lng
        ),
      }))
      .sort((a, b) => a.distanceKm - b.distanceKm);
  }, [alumniList, activeOrigin, selectedAngkatan]);

  const visibleAlumni = useMemo(() => {
    if (showAllDistances) return rankedAlumni;
    return rankedAlumni.filter((entry) => entry.distanceKm <= radiusKm);
  }, [rankedAlumni, showAllDistances, radiusKm]);

  const closestEntry = visibleAlumni[0] ?? null;

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6">
      <div className="rounded-xl border border-slate-200 bg-white p-5 sm:p-6 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <h1 className="font-display text-xl font-bold tracking-tight text-slate-900 sm:text-2xl dark:text-slate-100">
              Teman Alumni di Sekitar Anda
            </h1>
            <p className="mt-1 max-w-2xl text-sm text-slate-600 dark:text-slate-400">
              Sedang jalan-jalan, dinas luar kota, atau mampir ke tempat baru? Ketik lokasi Anda
              saat ini untuk langsung melihat siapa saja teman alumni yang berada paling dekat.
            </p>
          </div>

          <div className="flex shrink-0 flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={onUseGpsOrigin}
              disabled={isLocatingGps}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-800 hover:bg-slate-100 disabled:opacity-60 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700 whitespace-nowrap"
            >
              {isLocatingGps ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin text-sky-600 dark:text-sky-400" />
              ) : (
                <LocateFixed className="h-3.5 w-3.5 text-sky-600 dark:text-sky-400" />
              )}
              <span>Pakai GPS Saat Ini</span>
            </button>

            {myAlumniRecord && (
              <button
                type="button"
                onClick={onUseProfileOrigin}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-800 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700 whitespace-nowrap"
              >
                <UserCheck className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                <span>Pakai Pin Profil</span>
              </button>
            )}
          </div>
        </div>

        <form onSubmit={handleFormSubmit} className="mt-5 flex flex-col gap-2.5 sm:flex-row">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute top-1/2 left-3.5 h-4 w-4 -translate-y-1/2 text-slate-400 dark:text-slate-500" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Ketik posisi Anda, misal: Malioboro Yogyakarta, Stasiun Gubeng, Dago Bandung..."
              className="w-full rounded-lg border border-slate-300 bg-white py-2.5 pr-4 pl-10 text-sm text-slate-900 placeholder:text-slate-400 focus:border-sky-600 focus:ring-2 focus:ring-sky-600/20 focus:outline-none dark:border-slate-700 dark:bg-slate-800/80 dark:text-slate-100 dark:placeholder:text-slate-500 dark:focus:border-sky-400 dark:focus:ring-sky-400/20"
            />
          </div>
          <button
            type="submit"
            disabled={isSearching}
            className="inline-flex shrink-0 items-center justify-center gap-2 rounded-lg bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-slate-800 disabled:opacity-60 dark:bg-sky-500 dark:text-slate-950 dark:hover:bg-sky-400 whitespace-nowrap"
          >
            {isSearching ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>Mencari Posisi...</span>
              </>
            ) : (
              <>
                <Compass className="h-4 w-4" />
                <span>Cari Posisi</span>
              </>
            )}
          </button>
        </form>

        <div className="mt-3 flex flex-wrap items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
          <span className="mr-1">Contoh cepat:</span>
          {QUICK_PLACES.map((place) => (
            <button
              key={place}
              type="button"
              onClick={() => {
                setQuery(place);
                void handleSearchPosition(place);
              }}
              className="rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-medium text-slate-700 transition-colors hover:border-sky-300 hover:bg-sky-50 hover:text-sky-800 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:border-sky-700 dark:hover:bg-sky-950/60 dark:hover:text-sky-300"
            >
              {place}
            </button>
          ))}
        </div>

        {(searchError || gpsError) && (
          <div className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-xs font-medium text-rose-800 dark:border-rose-800/70 dark:bg-rose-950/60 dark:text-rose-300">
            {searchError || gpsError}
          </div>
        )}

        {candidates.length > 1 && (
          <div className="mt-4 border-t border-slate-100 pt-3 dark:border-slate-800">
            <div className="mb-2 text-xs font-semibold text-slate-700 dark:text-slate-300">
              Pilih titik lokasi yang paling sesuai ({candidates.length} hasil ditemukan):
            </div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {candidates.map((cand, idx) => {
                const isSelected = idx === selectedCandidateIndex && activeOrigin?.source === 'custom';
                return (
                  <button
                    key={`${cand.lat}-${cand.lng}-${idx}`}
                    type="button"
                    onClick={() => handlePickCandidate(cand, idx)}
                    className={`rounded-lg border p-2.5 text-left transition-colors ${
                      isSelected
                        ? 'border-sky-600 bg-sky-50/70 dark:border-sky-500 dark:bg-sky-950/50'
                        : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800/60 dark:hover:border-slate-600 dark:hover:bg-slate-800'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-xs font-semibold text-slate-900 dark:text-slate-100">
                        {cand.shortLabel}
                      </span>
                      <span className="shrink-0 font-mono text-[11px] tabular-nums text-slate-500 dark:text-slate-400">
                        {cand.lat.toFixed(3)}, {cand.lng.toFixed(3)}
                      </span>
                    </div>
                    <p className="mt-0.5 line-clamp-2 text-[11px] text-slate-600 dark:text-slate-400">
                      {cand.displayName}
                    </p>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {!activeOrigin ? (
        <div className="mt-5 rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center dark:border-slate-700 dark:bg-slate-900">
          <MapPin className="mx-auto h-8 w-8 text-slate-400 dark:text-slate-500" />
          <h2 className="mt-3 font-display text-base font-semibold text-slate-900 dark:text-slate-100">
            Belum ada posisi yang dipilih
          </h2>
          <p className="mx-auto mt-1 max-w-md text-sm text-slate-600 dark:text-slate-400">
            Ketik nama tempat, alamat, atau kota tempat Anda berada sekarang pada kolom di atas,
            atau tekan{' '}
            <span className="font-medium text-slate-800 dark:text-slate-200">
              Pakai GPS Saat Ini
            </span>
            .
          </p>
        </div>
      ) : (
        <div className="mt-5 space-y-5">
          <div className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5 dark:border-slate-800 dark:bg-slate-900">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                  <span>Titik posisi aktif</span>
                  <span aria-hidden="true">·</span>
                  <span className="font-mono tabular-nums">
                    {activeOrigin.lat.toFixed(4)}, {activeOrigin.lng.toFixed(4)}
                  </span>
                </div>
                <div className="mt-0.5 flex flex-wrap items-center gap-2">
                  <h2 className="truncate font-display text-base font-bold text-slate-900 sm:text-lg dark:text-slate-100">
                    {activeOrigin.label}
                  </h2>
                  <span className="text-xs text-slate-500 dark:text-slate-400">
                    ({visibleAlumni.length} alumni ditemukan
                    {showAllDistances ? ' di seluruh Indonesia' : ` dalam radius ${radiusKm} km`})
                  </span>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <select
                  value={selectedAngkatan}
                  onChange={(e) => setSelectedAngkatan(e.target.value)}
                  aria-label="Filter angkatan alumni"
                  className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-800 focus:border-sky-600 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:focus:border-sky-400"
                >
                  <option value="all">Semua Angkatan</option>
                  {angkatanOptions.map((year) => (
                    <option key={year} value={year}>
                      Angkatan {year}
                    </option>
                  ))}
                </select>

                <button
                  type="button"
                  onClick={() => onOpenOriginOnMap(showAllDistances ? 50 : radiusKm)}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-sky-600 bg-sky-600 px-3.5 py-2 text-xs font-semibold text-white hover:bg-sky-700 dark:border-sky-500 dark:bg-sky-500 dark:text-slate-950 dark:hover:bg-sky-400 whitespace-nowrap"
                >
                  <MapPin className="h-3.5 w-3.5" />
                  <span>Lihat Sebaran di Peta</span>
                </button>
              </div>
            </div>

            <div className="mt-4 flex flex-col gap-3 border-t border-slate-100 pt-4 sm:flex-row sm:items-center sm:justify-between dark:border-slate-800">
              <div className="flex flex-1 items-center gap-3">
                <span className="text-xs font-medium text-slate-700 dark:text-slate-300 whitespace-nowrap">
                  Batas Jarak:
                </span>
                <input
                  type="range"
                  min={1}
                  max={100}
                  step={1}
                  disabled={showAllDistances}
                  value={radiusKm}
                  onChange={(e) => setRadiusKm(Number(e.target.value))}
                  aria-label="Filter jarak alumni terdekat dalam kilometer"
                  className="h-2 w-full max-w-xs cursor-pointer accent-sky-600 disabled:opacity-40 dark:accent-sky-400"
                />
                <span className="w-16 font-mono text-xs font-semibold tabular-nums text-sky-700 dark:text-sky-400">
                  {showAllDistances ? 'Semua' : `${radiusKm} km`}
                </span>
              </div>

              <div className="flex flex-wrap items-center gap-1.5">
                {[5, 10, 25, 50, 100].map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => {
                      setShowAllDistances(false);
                      setRadiusKm(preset);
                    }}
                    className={`rounded-md px-2.5 py-1 font-mono text-xs tabular-nums transition-colors ${
                      !showAllDistances && radiusKm === preset
                        ? 'bg-slate-900 font-semibold text-white dark:bg-sky-500 dark:text-slate-950'
                        : 'bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700'
                    }`}
                  >
                    {preset}km
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => setShowAllDistances((v) => !v)}
                  className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                    showAllDistances
                      ? 'bg-slate-900 text-white dark:bg-sky-500 dark:text-slate-950'
                      : 'bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700'
                  }`}
                >
                  Semua Jarak
                </button>
              </div>
            </div>
          </div>

          {visibleAlumni.length === 0 ? (
            <div className="rounded-xl border border-slate-200 bg-white p-8 text-center dark:border-slate-800 dark:bg-slate-900">
              <p className="font-display text-base font-semibold text-slate-900 dark:text-slate-100">
                Belum ada alumni dalam radius {radiusKm} km dari lokasi ini
              </p>
              <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
                {rankedAlumni[0]
                  ? `Alumni terdekat berikutnya adalah ${rankedAlumni[0].alumni.name} di ${rankedAlumni[0].alumni.city} (${formatDistance(rankedAlumni[0].distanceKm)}).`
                  : 'Tidak ada data alumni yang cocok dengan filter angkatan.'}
              </p>
              <div className="mt-4 flex flex-wrap justify-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setShowAllDistances(false);
                    setRadiusKm(50);
                  }}
                  className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-800 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                >
                  Perluas ke 50 km
                </button>
                <button
                  type="button"
                  onClick={() => setShowAllDistances(true)}
                  className="rounded-lg bg-slate-900 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-800 dark:bg-sky-500 dark:text-slate-950 dark:hover:bg-sky-400"
                >
                  Tampilkan Semua Jarak
                </button>
              </div>
            </div>
          ) : (
            <>
              {closestEntry && (
                <div className="rounded-xl border border-sky-200 bg-sky-50/50 p-4 sm:p-5 dark:border-sky-800/70 dark:bg-sky-950/30">
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2 text-xs text-sky-800 dark:text-sky-300">
                        <span className="font-semibold">Paling Dekat dengan Anda</span>
                        <span aria-hidden="true">·</span>
                        <span className="font-mono font-semibold tabular-nums">
                          {formatDistance(closestEntry.distanceKm)}
                        </span>
                        <span aria-hidden="true">·</span>
                        <span>Angkatan {closestEntry.alumni.angkatan}</span>
                      </div>
                      <h3 className="mt-1 font-display text-lg font-bold text-slate-900 dark:text-slate-100">
                        {closestEntry.alumni.name}
                      </h3>
                      <p className="mt-0.5 text-sm text-slate-700 dark:text-slate-300">
                        {closestEntry.alumni.profession}
                        {' · '}
                        {closestEntry.alumni.address}
                      </p>
                    </div>

                    <div className="flex shrink-0 flex-wrap items-center gap-2">
                      <a
                        href={buildDirectionsUrl(
                          { lat: closestEntry.alumni.lat, lng: closestEntry.alumni.lng },
                          activeOrigin
                        )}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 rounded-lg bg-sky-600 px-4 py-2 text-xs font-semibold text-white hover:bg-sky-700 dark:bg-sky-500 dark:text-slate-950 dark:hover:bg-sky-400 whitespace-nowrap"
                      >
                        <Navigation className="h-3.5 w-3.5" />
                        <span>Buka Rute</span>
                      </a>
                      <button
                        type="button"
                        onClick={() => onLocateAlumniOnMap(closestEntry.alumni)}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-800 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700 whitespace-nowrap"
                      >
                        <MapPin className="h-3.5 w-3.5" />
                        <span>Lihat di Peta</span>
                      </button>
                    </div>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 gap-3.5 md:grid-cols-2">
                {visibleAlumni.map(({ alumni, distanceKm }, index) => (
                  <article
                    key={alumni.id}
                    className="flex flex-col justify-between rounded-xl border border-slate-200 bg-white p-4 transition-colors hover:border-slate-300 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-slate-700"
                  >
                    <div>
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                            <span className="font-mono tabular-nums">#{index + 1}</span>
                            <span aria-hidden="true">·</span>
                            <span>Angkatan {alumni.angkatan}</span>
                            <span aria-hidden="true">·</span>
                            <span>{alumni.city}</span>
                          </div>
                          <h3 className="mt-1 truncate font-display text-base font-bold text-slate-900 dark:text-slate-100">
                            {alumni.name}
                          </h3>
                        </div>

                        <div className="shrink-0 text-right">
                          <div className="font-mono text-sm font-bold tabular-nums text-sky-700 dark:text-sky-400">
                            {formatDistance(distanceKm)}
                          </div>
                          <div className="text-[11px] text-slate-400 dark:text-slate-500">
                            dari Anda
                          </div>
                        </div>
                      </div>

                      <div className="mt-2.5 space-y-1 text-xs text-slate-600 dark:text-slate-400">
                        <div className="flex items-center gap-1.5 text-slate-700 dark:text-slate-300">
                          <Briefcase className="h-3.5 w-3.5 shrink-0 text-slate-400 dark:text-slate-500" />
                          <span className="truncate">{alumni.profession}</span>
                        </div>
                        <div className="flex items-start gap-1.5">
                          <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400 dark:text-slate-500" />
                          <span>{alumni.address}</span>
                        </div>
                        {alumni.email && (
                          <div className="flex items-center gap-1.5 pt-0.5">
                            <Mail className="h-3.5 w-3.5 shrink-0 text-slate-400 dark:text-slate-500" />
                            <a
                              href={`mailto:${alumni.email}`}
                              className="text-slate-700 hover:text-sky-700 dark:text-slate-300 dark:hover:text-sky-400"
                            >
                              {alumni.email}
                            </a>
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3 dark:border-slate-800">
                      <a
                        href={buildDirectionsUrl(
                          { lat: alumni.lat, lng: alumni.lng },
                          activeOrigin
                        )}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-slate-900 px-3 py-2 text-xs font-semibold text-white hover:bg-slate-800 dark:bg-sky-500 dark:text-slate-950 dark:hover:bg-sky-400 whitespace-nowrap"
                      >
                        <Navigation className="h-3.5 w-3.5" />
                        <span>Buka Rute</span>
                      </a>
                      <button
                        type="button"
                        onClick={() => onLocateAlumniOnMap(alumni)}
                        className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-800 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700 whitespace-nowrap"
                      >
                        <MapPin className="h-3.5 w-3.5" />
                        <span>Lihat di Peta</span>
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
};
