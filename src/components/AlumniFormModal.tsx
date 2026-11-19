import React, { useEffect, useRef, useState } from 'react';
import { Loader2, LocateFixed, MapPin, Search, X } from 'lucide-react';
import { geocodeAddress, searchGeocodeCandidates } from '../services/alumniApi';
import type { AlumniPayload, AlumniRecord, GeocodeCandidate } from '../types/alumni';

interface AlumniFormModalProps {
  isOpen: boolean;
  editingAlumni: AlumniRecord | null;
  defaultEmail?: string | null;
  onClose: () => void;
  onSave: (payload: AlumniPayload, existingId?: string) => Promise<void>;
}

export const AlumniFormModal: React.FC<AlumniFormModalProps> = ({
  isOpen,
  editingAlumni,
  defaultEmail,
  onClose,
  onSave,
}) => {
  const [name, setName] = useState('');
  const [angkatan, setAngkatan] = useState('2014');
  const [city, setCity] = useState('');
  const [address, setAddress] = useState('');
  const [profession, setProfession] = useState('');
  const [email, setEmail] = useState('');
  const [lat, setLat] = useState('-6.2088');
  const [lng, setLng] = useState('106.8456');

  const [isGeocoding, setIsGeocoding] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [geocodeHint, setGeocodeHint] = useState<string | null>(null);

  // Address Autocomplete states
  const [addressSuggestions, setAddressSuggestions] = useState<GeocodeCandidate[]>([]);
  const [isSearchingSuggestions, setIsSearchingSuggestions] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const suggestionTimeoutRef = useRef<number | null>(null);
  const autocompleteContainerRef = useRef<HTMLDivElement | null>(null);

  // Close dropdown on click outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        autocompleteContainerRef.current &&
        !autocompleteContainerRef.current.contains(event.target as Node)
      ) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    setError(null);
    setGeocodeHint(null);
    if (editingAlumni) {
      setName(editingAlumni.name);
      setAngkatan(editingAlumni.angkatan);
      setCity(editingAlumni.city);
      setAddress(editingAlumni.address);
      setProfession(editingAlumni.profession);
      setEmail(editingAlumni.email ?? '');
      setLat(String(editingAlumni.lat));
      setLng(String(editingAlumni.lng));
    } else {
      setName('');
      setAngkatan('2014');
      setCity('');
      setAddress('');
      setProfession('');
      setEmail(defaultEmail ?? '');
      setLat('-6.2088');
      setLng('106.8456');
    }
    setAddressSuggestions([]);
    setShowSuggestions(false);
    setIsSearchingSuggestions(false);
  }, [isOpen, editingAlumni, defaultEmail]);

  if (!isOpen) return null;

  const handleAddressChange = (val: string) => {
    setAddress(val);
    if (suggestionTimeoutRef.current) {
      window.clearTimeout(suggestionTimeoutRef.current);
    }

    const query = val.trim();
    if (query.length < 3) {
      setAddressSuggestions([]);
      setShowSuggestions(false);
      setIsSearchingSuggestions(false);
      return;
    }

    setIsSearchingSuggestions(true);
    setShowSuggestions(true);
    suggestionTimeoutRef.current = window.setTimeout(async () => {
      try {
        const results = await searchGeocodeCandidates(query);
        setAddressSuggestions(results);
      } catch {
        setAddressSuggestions([]);
      } finally {
        setIsSearchingSuggestions(false);
      }
    }, 350);
  };

  const handleSelectSuggestion = (cand: GeocodeCandidate) => {
    setAddress(cand.displayName);
    if (cand.city) {
      setCity(cand.city);
    }
    setLat(cand.lat.toFixed(6));
    setLng(cand.lng.toFixed(6));
    setGeocodeHint(`Koordinat otomatis terisi: ${cand.shortLabel} (${cand.city})`);
    setAddressSuggestions([]);
    setShowSuggestions(false);
    setError(null);
  };

  const handleGeocode = async () => {
    const query = [address.trim(), city.trim()].filter(Boolean).join(', ');
    if (query.length < 2) {
      setError('Isi alamat atau nama kota terlebih dahulu untuk mencari koordinat.');
      return;
    }
    setIsGeocoding(true);
    setError(null);
    setGeocodeHint(null);
    try {
      const result = await geocodeAddress(query);
      if (!result) {
        setError('Alamat tidak ditemukan. Coba gunakan nama jalan atau kota yang lebih umum.');
        return;
      }
      setLat(result.lat.toFixed(6));
      setLng(result.lng.toFixed(6));
      if (!city.trim() && result.city) {
        setCity(result.city);
      }
      setGeocodeHint(`Koordinat ditemukan: ${result.displayName}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal mencari koordinat alamat.');
    } finally {
      setIsGeocoding(false);
    }
  };

  const handleUseGps = () => {
    if (!navigator.geolocation) {
      setError('Browser Anda tidak mendukung fitur GPS.');
      return;
    }
    setError(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLat(pos.coords.latitude.toFixed(6));
        setLng(pos.coords.longitude.toFixed(6));
        setGeocodeHint('Koordinat GPS perangkat berhasil diambil.');
      },
      () => {
        setError('Izin akses lokasi ditolak atau GPS sedang tidak tersedia.');
      },
      { enableHighAccuracy: true, timeout: 8000 }
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsedLat = Number(lat);
    const parsedLng = Number(lng);

    if (!name.trim() || !address.trim()) {
      setError('Nama lengkap dan alamat wajib diisi.');
      return;
    }
    if (!Number.isFinite(parsedLat) || !Number.isFinite(parsedLng)) {
      setError('Koordinat lintang dan bujur harus berupa angka yang valid.');
      return;
    }

    setIsSaving(true);
    setError(null);
    try {
      await onSave(
        {
          name: name.trim(),
          angkatan: angkatan.trim() || '2014',
          city: city.trim() || 'Indonesia',
          address: address.trim(),
          profession: profession.trim() || 'Alumni',
          email: email.trim() || null,
          lat: parsedLat,
          lng: parsedLng,
        },
        editingAlumni?.id
      );
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal menyimpan data alumni.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-xs">
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl border border-slate-200 bg-white p-5 shadow-xl dark:border-slate-800 dark:bg-slate-900 dark:shadow-black/50">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3 dark:border-slate-800">
          <h2 className="font-display text-lg font-bold text-slate-900 dark:text-slate-100">
            {editingAlumni ? 'Edit Lokasi Alumni' : 'Tambah Lokasi Alumni'}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Tutup formulir"
            className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="mt-4 space-y-3.5 text-sm">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="sm:col-span-2">
              <label className="mb-1 block text-xs font-semibold text-slate-700 dark:text-slate-300">
                Nama Lengkap *
              </label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Nama lengkap alumni"
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-sky-600 focus:outline-none dark:border-slate-700 dark:bg-slate-800/80 dark:text-slate-100 dark:placeholder:text-slate-500 dark:focus:border-sky-400"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-700 dark:text-slate-300">
                Angkatan
              </label>
              <input
                type="text"
                value={angkatan}
                onChange={(e) => setAngkatan(e.target.value)}
                placeholder="2014"
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono text-sm tabular-nums text-slate-900 placeholder:text-slate-400 focus:border-sky-600 focus:outline-none dark:border-slate-700 dark:bg-slate-800/80 dark:text-slate-100 dark:placeholder:text-slate-500 dark:focus:border-sky-400"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-700 dark:text-slate-300">
                Kota Domisili
              </label>
              <input
                type="text"
                value={city}
                onChange={(e) => setCity(e.target.value)}
                placeholder="Misal: Bandung"
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-sky-600 focus:outline-none dark:border-slate-700 dark:bg-slate-800/80 dark:text-slate-100 dark:placeholder:text-slate-500 dark:focus:border-sky-400"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-700 dark:text-slate-300">
                Profesi
              </label>
              <input
                type="text"
                value={profession}
                onChange={(e) => setProfession(e.target.value)}
                placeholder="Misal: Arsitek, Guru, Wirausaha"
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-sky-600 focus:outline-none dark:border-slate-700 dark:bg-slate-800/80 dark:text-slate-100 dark:placeholder:text-slate-500 dark:focus:border-sky-400"
              />
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-700 dark:text-slate-300">
              Email Alumni
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="nama@email.com (opsional)"
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-sky-600 focus:outline-none dark:border-slate-700 dark:bg-slate-800/80 dark:text-slate-100 dark:placeholder:text-slate-500 dark:focus:border-sky-400"
            />
          </div>

          <div ref={autocompleteContainerRef} className="relative">
            <div className="mb-1 flex items-center justify-between">
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                Alamat / Area Tinggal *
              </label>
              <span className="text-[11px] text-slate-500 dark:text-slate-400">
                Auto-saran aktif saat mengetik
              </span>
            </div>
            <div className="relative flex gap-2">
              <div className="relative flex-1">
                <input
                  type="text"
                  required
                  value={address}
                  onChange={(e) => handleAddressChange(e.target.value)}
                  onFocus={() => {
                    if (
                      addressSuggestions.length > 0 ||
                      (address.trim().length >= 3 && isSearchingSuggestions)
                    ) {
                      setShowSuggestions(true);
                    }
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Escape') {
                      setShowSuggestions(false);
                    }
                  }}
                  placeholder="Ketik alamat / jalan / kota (mis. Malioboro, Dago)..."
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 pr-8 text-sm text-slate-900 placeholder:text-slate-400 focus:border-sky-600 focus:outline-none dark:border-slate-700 dark:bg-slate-800/80 dark:text-slate-100 dark:placeholder:text-slate-500 dark:focus:border-sky-400"
                />
                {isSearchingSuggestions && (
                  <div className="pointer-events-none absolute inset-y-0 right-2 flex items-center pr-1">
                    <Loader2 className="h-4 w-4 animate-spin text-sky-600 dark:text-sky-400" />
                  </div>
                )}
              </div>
              <button
                type="button"
                onClick={handleGeocode}
                disabled={isGeocoding}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-800 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700 whitespace-nowrap"
                title="Cari titik koordinat secara manual"
              >
                {isGeocoding ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Search className="h-3.5 w-3.5" />
                )}
                <span>Cari Titik</span>
              </button>
            </div>

            {/* Dropdown Live Suggestions */}
            {showSuggestions && (
              <div className="absolute left-0 right-0 top-full z-50 mt-1 max-h-60 overflow-y-auto rounded-lg border border-slate-200 bg-white py-1 shadow-2xl dark:border-slate-700 dark:bg-slate-900 dark:shadow-black/60">
                {isSearchingSuggestions && addressSuggestions.length === 0 && (
                  <div className="flex items-center gap-2 px-3 py-2.5 text-xs text-slate-500 dark:text-slate-400">
                    <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-sky-600 dark:text-sky-400" />
                    <span>Mencari saran lokasi...</span>
                  </div>
                )}

                {addressSuggestions.length > 0 && (
                  <>
                    <div className="border-b border-slate-100 px-3 py-1 text-[10px] font-semibold tracking-wider text-slate-400 uppercase dark:border-slate-800 dark:text-slate-500">
                      Pilih Alamat yang Sesuai ({addressSuggestions.length})
                    </div>
                    {addressSuggestions.map((cand, idx) => (
                      <button
                        key={`${cand.lat}-${cand.lng}-${idx}`}
                        type="button"
                        onClick={() => handleSelectSuggestion(cand)}
                        className="flex w-full items-start gap-2.5 border-b border-slate-100 px-3 py-2 text-left transition-colors last:border-b-0 hover:bg-sky-50 focus:bg-sky-50 focus:outline-none dark:border-slate-800 dark:hover:bg-slate-800 dark:focus:bg-slate-800"
                      >
                        <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-sky-600 dark:text-sky-400" />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-2">
                            <span className="truncate text-xs font-semibold text-slate-900 dark:text-slate-100">
                              {cand.shortLabel}
                            </span>
                            {cand.city && (
                              <span className="shrink-0 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                                {cand.city}
                              </span>
                            )}
                          </div>
                          <p className="mt-0.5 line-clamp-2 text-[11px] leading-snug text-slate-500 dark:text-slate-400">
                            {cand.displayName}
                          </p>
                        </div>
                      </button>
                    ))}
                  </>
                )}

                {!isSearchingSuggestions &&
                  addressSuggestions.length === 0 &&
                  address.trim().length >= 3 && (
                    <div className="px-3 py-2 text-xs text-slate-500 dark:text-slate-400">
                      Tidak ada saran alamat ditemukan. Klik tombol{' '}
                      <span className="font-semibold text-slate-700 dark:text-slate-200">
                        "Cari Titik"
                      </span>{' '}
                      untuk pencarian lebih luas.
                    </div>
                  )}
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-700 dark:text-slate-300">
                Latitude *
              </label>
              <input
                type="text"
                required
                value={lat}
                onChange={(e) => setLat(e.target.value)}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono text-xs tabular-nums text-slate-900 focus:border-sky-600 focus:outline-none dark:border-slate-700 dark:bg-slate-800/80 dark:text-slate-100 dark:focus:border-sky-400"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-700 dark:text-slate-300">
                Longitude *
              </label>
              <div className="flex gap-1.5">
                <input
                  type="text"
                  required
                  value={lng}
                  onChange={(e) => setLng(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono text-xs tabular-nums text-slate-900 focus:border-sky-600 focus:outline-none dark:border-slate-700 dark:bg-slate-800/80 dark:text-slate-100 dark:focus:border-sky-400"
                />
                <button
                  type="button"
                  onClick={handleUseGps}
                  title="Ambil koordinat GPS"
                  className="rounded-lg border border-slate-300 bg-slate-50 px-2.5 text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                >
                  <LocateFixed className="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>

          {geocodeHint && (
            <p className="rounded-lg bg-emerald-50 px-3 py-2 text-xs text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300">
              {geocodeHint}
            </p>
          )}

          {error && (
            <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-medium text-rose-800 dark:border-rose-800/70 dark:bg-rose-950/60 dark:text-rose-300">
              {error}
            </div>
          )}

          <div className="flex items-center justify-end gap-2 border-t border-slate-100 pt-3 dark:border-slate-800">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={isSaving}
              className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-800 disabled:opacity-60 dark:bg-sky-500 dark:text-slate-950 dark:hover:bg-sky-400"
            >
              {isSaving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              <span>{editingAlumni ? 'Simpan Perubahan' : 'Simpan Lokasi'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
