export function haversineDistanceKm(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const earthRadiusKm = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return earthRadiusKm * c;
}

export function formatDistance(km: number): string {
  if (!Number.isFinite(km)) return '-';
  if (km < 1) {
    return `${Math.max(10, Math.round(km * 1000))} m`;
  }
  if (km < 10) {
    return `${km.toFixed(1)} km`;
  }
  return `${Math.round(km)} km`;
}

export function buildDirectionsUrl(
  destination: { lat: number; lng: number },
  origin?: { lat: number; lng: number } | null
): string {
  const params = new URLSearchParams({
    api: '1',
    destination: `${destination.lat.toFixed(6)},${destination.lng.toFixed(6)}`,
  });

  if (origin && Number.isFinite(origin.lat) && Number.isFinite(origin.lng)) {
    const distanceKm = haversineDistanceKm(
      origin.lat,
      origin.lng,
      destination.lat,
      destination.lng
    );
    if (distanceKm > 0.005) {
      params.set('origin', `${origin.lat.toFixed(6)},${origin.lng.toFixed(6)}`);
    }
  }

  return `https://www.google.com/maps/dir/?${params.toString()}`;
}
