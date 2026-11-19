import React, { useEffect, useMemo, useRef, useState } from 'react';
import { HeatLayer } from 'leaflet.heat';
import { Layers, LocateFixed, Moon, Radar, Sun, Users, Flame } from 'lucide-react';
import { L } from '../utils/initLeaflet';
import type { AlumniRecord, MapUserOrigin } from '../types/alumni';
import { formatDistance, haversineDistanceKm } from '../utils/geo';

interface AlumniMapProps {
  alumniList: AlumniRecord[];
  selectedAlumni: AlumniRecord | null;
  onSelectAlumni: (alumni: AlumniRecord) => void;
  userOrigin: MapUserOrigin | null;
  myAlumniId?: string | null;
  focusTrigger: number;
  showProximityRadius: boolean;
  onToggleProximityRadius: (next: boolean) => void;
  proximityRadiusKm: number;
  onChangeProximityRadiusKm: (km: number) => void;
  onRequestGpsOrigin?: () => void;
  isDark?: boolean;
  onToggleTheme?: () => void;
}

const RADIUS_PRESETS_KM = [5, 10, 25, 50, 100];

const DARK_TILE_URL = 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png';
const DARK_TILE_ATTR = '&copy; OpenStreetMap contributors &copy; CARTO';

const LIGHT_TILE_URL = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
const LIGHT_TILE_ATTR = '&copy; OpenStreetMap contributors';

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return 'AL';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export const AlumniMap: React.FC<AlumniMapProps> = ({
  alumniList,
  selectedAlumni,
  onSelectAlumni,
  userOrigin,
  myAlumniId,
  focusTrigger,
  showProximityRadius,
  onToggleProximityRadius,
  proximityRadiusKm,
  onChangeProximityRadiusKm,
  onRequestGpsOrigin,
  isDark = true,
  onToggleTheme,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const tileLayerRef = useRef<L.TileLayer | null>(null);
  const clusterGroupRef = useRef<L.MarkerClusterGroup | null>(null);
  const plainLayerRef = useRef<L.LayerGroup | null>(null);
  const heatLayerRef = useRef<(HeatLayer & L.Layer) | null>(null);
  const originMarkerRef = useRef<L.Marker | null>(null);
  const proximityCircleRef = useRef<L.Circle | null>(null);
  const connectorLineRef = useRef<L.Polyline | null>(null);
  const markersByIdRef = useRef<Map<string, L.Marker>>(new Map());
  const onSelectRef = useRef(onSelectAlumni);
  onSelectRef.current = onSelectAlumni;

  const [mapReady, setMapReady] = useState(false);
  const [useClustering, setUseClustering] = useState(true);
  const [showHeatmap, setShowHeatmap] = useState(false);
  const [showPinsWithHeatmap, setShowPinsWithHeatmap] = useState(true);
  const [showLayerMenu, setShowLayerMenu] = useState(false);
  const [useDarkTiles, setUseDarkTiles] = useState(isDark);

  useEffect(() => {
    setUseDarkTiles(isDark);
  }, [isDark]);

  const alumniWithinRadiusCount = useMemo(() => {
    if (!userOrigin) return 0;
    return alumniList.filter(
      (item) =>
        haversineDistanceKm(userOrigin.lat, userOrigin.lng, item.lat, item.lng) <=
        proximityRadiusKm
    ).length;
  }, [alumniList, userOrigin, proximityRadiusKm]);

  // Initialize Leaflet map once
  useEffect(() => {
    const el = containerRef.current;
    if (!el || mapRef.current) return;

    const map = L.map(el, {
      center: [-2.5, 117.5],
      zoom: 5,
      minZoom: 2,
      maxZoom: 19,
      zoomControl: false,
    });

    L.control.zoom({ position: 'bottomright' }).addTo(map);

    const tileLayer = L.tileLayer(useDarkTiles ? DARK_TILE_URL : LIGHT_TILE_URL, {
      maxZoom: 19,
      subdomains: useDarkTiles ? 'abcd' : 'abc',
      attribution: useDarkTiles ? DARK_TILE_ATTR : LIGHT_TILE_ATTR,
    }).addTo(map);

    const clusterGroup = L.markerClusterGroup({
      chunkedLoading: true,
      maxClusterRadius: 48,
      spiderfyOnMaxZoom: true,
      showCoverageOnHover: false,
      iconCreateFunction: (cluster) => {
        const count = cluster.getChildCount();
        const tierClass = count >= 20 ? 'is-lg' : count >= 6 ? 'is-md' : 'is-sm';
        return L.divIcon({
          html: `<div class="alumni-cluster-pin ${tierClass}">${count}</div>`,
          className: 'alumni-cluster-wrapper',
          iconSize: L.point(42, 42),
        });
      },
    });

    const plainLayer = L.layerGroup();

    mapRef.current = map;
    tileLayerRef.current = tileLayer;
    clusterGroupRef.current = clusterGroup;
    plainLayerRef.current = plainLayer;
    setMapReady(true);

    const resizeObserver = new ResizeObserver(() => {
      if ((map as unknown as { _mapPane?: HTMLElement })._mapPane) {
        map.invalidateSize({ animate: false, pan: false });
      }
    });
    resizeObserver.observe(el);

    const timer = window.setTimeout(() => {
      if ((map as unknown as { _mapPane?: HTMLElement })._mapPane) {
        map.invalidateSize({ animate: false, pan: false });
      }
    }, 120);

    return () => {
      window.clearTimeout(timer);
      resizeObserver.disconnect();
      setMapReady(false);
      map.stop();
      map.remove();
      mapRef.current = null;
      tileLayerRef.current = null;
      clusterGroupRef.current = null;
      plainLayerRef.current = null;
      heatLayerRef.current = null;
      originMarkerRef.current = null;
      proximityCircleRef.current = null;
      connectorLineRef.current = null;
      markersByIdRef.current.clear();
    };
  }, []);

  // Swap tile layer when dark/light map tiles change
  useEffect(() => {
    const map = mapRef.current;
    if (!mapReady || !map) return;

    if (tileLayerRef.current && map.hasLayer(tileLayerRef.current)) {
      map.removeLayer(tileLayerRef.current);
    }

    const nextTileLayer = L.tileLayer(useDarkTiles ? DARK_TILE_URL : LIGHT_TILE_URL, {
      maxZoom: 19,
      subdomains: useDarkTiles ? 'abcd' : 'abc',
      attribution: useDarkTiles ? DARK_TILE_ATTR : LIGHT_TILE_ATTR,
    }).addTo(map);
    nextTileLayer.bringToBack();
    tileLayerRef.current = nextTileLayer;
  }, [mapReady, useDarkTiles]);

  // Build and attach alumni pin layers (clustering or flat)
  useEffect(() => {
    const map = mapRef.current;
    const clusterGroup = clusterGroupRef.current;
    const plainLayer = plainLayerRef.current;
    if (!mapReady || !map || !clusterGroup || !plainLayer) return;

    clusterGroup.clearLayers();
    plainLayer.clearLayers();
    markersByIdRef.current.clear();

    const shouldRenderPins = !showHeatmap || showPinsWithHeatmap;
    if (!shouldRenderPins) {
      if (map.hasLayer(clusterGroup)) map.removeLayer(clusterGroup);
      if (map.hasLayer(plainLayer)) map.removeLayer(plainLayer);
      return;
    }

    const markers: L.Marker[] = [];

    for (const alumni of alumniList) {
      const isSelected = selectedAlumni?.id === alumni.id;
      const isMe = myAlumniId === alumni.id;
      let radiusClass = '';
      if (showProximityRadius && userOrigin) {
        const dist = haversineDistanceKm(userOrigin.lat, userOrigin.lng, alumni.lat, alumni.lng);
        radiusClass = dist <= proximityRadiusKm ? 'is-within-radius' : 'is-outside-radius';
      }

      const icon = L.divIcon({
        className: 'alumni-pin-wrapper',
        html: `<div class="alumni-pin ${isSelected ? 'is-selected' : ''} ${
          isMe ? 'is-me' : ''
        } ${radiusClass}" title="${escapeHtml(alumni.name)}"><span class="alumni-pin-initials">${getInitials(
          alumni.name
        )}</span></div>`,
        iconSize: [34, 34],
        iconAnchor: [17, 32],
      });

      const marker = L.marker([alumni.lat, alumni.lng], { icon });
      const distLabel = userOrigin
        ? ` · ${formatDistance(
            haversineDistanceKm(userOrigin.lat, userOrigin.lng, alumni.lat, alumni.lng)
          )}`
        : '';

      marker.bindTooltip(
        `<div class="map-tooltip-title">${escapeHtml(alumni.name)}</div><div class="map-tooltip-sub">Angkatan ${escapeHtml(alumni.angkatan)} · ${escapeHtml(alumni.city)}${escapeHtml(distLabel)}</div>`,
        { direction: 'top', offset: [0, -26] }
      );

      marker.on('click', () => {
        onSelectRef.current(alumni);
      });

      markersByIdRef.current.set(alumni.id, marker);
      markers.push(marker);
    }

    if (useClustering) {
      if (map.hasLayer(plainLayer)) map.removeLayer(plainLayer);
      clusterGroup.addLayers(markers);
      if (!map.hasLayer(clusterGroup)) {
        map.addLayer(clusterGroup);
      }
    } else {
      if (map.hasLayer(clusterGroup)) map.removeLayer(clusterGroup);
      for (const marker of markers) {
        plainLayer.addLayer(marker);
      }
      if (!map.hasLayer(plainLayer)) {
        map.addLayer(plainLayer);
      }
    }
  }, [
    mapReady,
    alumniList,
    useClustering,
    showHeatmap,
    showPinsWithHeatmap,
    selectedAlumni?.id,
    myAlumniId,
    showProximityRadius,
    userOrigin,
  ]);

  // Lightweight proximity class update when slider moves (60fps without rebuilding cluster layers)
  useEffect(() => {
    if (!mapReady) return;
    for (const alumni of alumniList) {
      const marker = markersByIdRef.current.get(alumni.id);
      if (!marker) continue;
      const el = marker.getElement()?.querySelector('.alumni-pin');
      if (!el) continue;

      if (showProximityRadius && userOrigin) {
        const dist = haversineDistanceKm(userOrigin.lat, userOrigin.lng, alumni.lat, alumni.lng);
        const inside = dist <= proximityRadiusKm;
        el.classList.toggle('is-within-radius', inside);
        el.classList.toggle('is-outside-radius', !inside);
      } else {
        el.classList.remove('is-within-radius', 'is-outside-radius');
      }
    }
  }, [mapReady, alumniList, showProximityRadius, userOrigin, proximityRadiusKm]);

  // Heatmap layer synced with filtered alumniList
  useEffect(() => {
    const map = mapRef.current;
    if (!mapReady || !map) return;

    if (!showHeatmap) {
      if (heatLayerRef.current && map.hasLayer(heatLayerRef.current)) {
        map.removeLayer(heatLayerRef.current);
      }
      return;
    }

    const heatPoints: [number, number, number][] = alumniList.map((item) => [
      item.lat,
      item.lng,
      0.85,
    ]);

    if (!heatLayerRef.current) {
      const layer = new HeatLayer(heatPoints, {
        radius: 34,
        blur: 24,
        maxZoom: 13,
        minOpacity: 0.4,
        gradient: {
          0.25: '#38bdf8',
          0.55: '#22c55e',
          0.8: '#facc15',
          1.0: '#ef4444',
        },
      }) as unknown as HeatLayer & L.Layer;
      heatLayerRef.current = layer;
      layer.addTo(map);
    } else {
      heatLayerRef.current.setLatLngs(heatPoints);
      if (!map.hasLayer(heatLayerRef.current)) {
        heatLayerRef.current.addTo(map);
      }
    }
  }, [mapReady, showHeatmap, alumniList]);

  // User origin marker + proximity circle
  useEffect(() => {
    const map = mapRef.current;
    if (!mapReady || !map) return;

    if (!userOrigin) {
      if (originMarkerRef.current) {
        map.removeLayer(originMarkerRef.current);
        originMarkerRef.current = null;
      }
      if (proximityCircleRef.current) {
        map.removeLayer(proximityCircleRef.current);
        proximityCircleRef.current = null;
      }
      return;
    }

    const originLatLng: L.LatLngExpression = [userOrigin.lat, userOrigin.lng];
    if (!originMarkerRef.current) {
      const originIcon = L.divIcon({
        className: 'user-origin-wrapper',
        html: '<div class="user-origin-pin"></div>',
        iconSize: [22, 22],
        iconAnchor: [11, 11],
      });
      originMarkerRef.current = L.marker(originLatLng, {
        icon: originIcon,
        zIndexOffset: 900,
      }).addTo(map);
    } else {
      originMarkerRef.current.setLatLng(originLatLng);
    }
    originMarkerRef.current.bindTooltip(
      `<div class="map-tooltip-title">${escapeHtml(userOrigin.label)}</div>`,
      { direction: 'top', offset: [0, -10] }
    );

    const strokeColor = useDarkTiles ? '#38bdf8' : '#0284c7';
    const fillColor = useDarkTiles ? '#0ea5e9' : '#38bdf8';

    if (showProximityRadius) {
      if (!proximityCircleRef.current) {
        proximityCircleRef.current = L.circle(originLatLng, {
          radius: proximityRadiusKm * 1000,
          color: strokeColor,
          weight: 2,
          dashArray: '6 5',
          fillColor,
          fillOpacity: useDarkTiles ? 0.14 : 0.12,
          interactive: false,
        }).addTo(map);
      } else {
        proximityCircleRef.current.setLatLng(originLatLng);
        proximityCircleRef.current.setRadius(proximityRadiusKm * 1000);
        proximityCircleRef.current.setStyle({
          color: strokeColor,
          fillColor,
          fillOpacity: useDarkTiles ? 0.14 : 0.12,
        });
        if (!map.hasLayer(proximityCircleRef.current)) {
          proximityCircleRef.current.addTo(map);
        }
      }
    } else if (proximityCircleRef.current && map.hasLayer(proximityCircleRef.current)) {
      map.removeLayer(proximityCircleRef.current);
    }
  }, [mapReady, userOrigin, showProximityRadius, proximityRadiusKm, useDarkTiles]);

  // Dashed distance line between userOrigin and selectedAlumni
  useEffect(() => {
    const map = mapRef.current;
    if (!mapReady || !map) return;

    if (connectorLineRef.current) {
      map.removeLayer(connectorLineRef.current);
      connectorLineRef.current = null;
    }

    if (userOrigin && selectedAlumni) {
      const distKm = haversineDistanceKm(
        userOrigin.lat,
        userOrigin.lng,
        selectedAlumni.lat,
        selectedAlumni.lng
      );
      if (distKm > 0.01) {
        connectorLineRef.current = L.polyline(
          [
            [userOrigin.lat, userOrigin.lng],
            [selectedAlumni.lat, selectedAlumni.lng],
          ],
          {
            color: useDarkTiles ? '#38bdf8' : '#0369a1',
            weight: 2,
            dashArray: '5 6',
            opacity: useDarkTiles ? 0.85 : 0.75,
            interactive: false,
          }
        ).addTo(map);
      }
    }
  }, [mapReady, userOrigin, selectedAlumni, useDarkTiles]);

  // Focus selected alumni or origin when triggered externally
  useEffect(() => {
    const map = mapRef.current;
    const clusterGroup = clusterGroupRef.current;
    if (!mapReady || !map || focusTrigger === 0) return;
    if (!(map as unknown as { _mapPane?: HTMLElement })._mapPane) return;

    if (selectedAlumni) {
      const marker = markersByIdRef.current.get(selectedAlumni.id);
      if (useClustering && clusterGroup && marker && map.hasLayer(clusterGroup)) {
        clusterGroup.zoomToShowLayer(marker, () => {
          if (!(map as unknown as { _mapPane?: HTMLElement })._mapPane) return;
          map.stop();
          map.setView([selectedAlumni.lat, selectedAlumni.lng], Math.max(map.getZoom(), 13), {
            animate: false,
          });
        });
      } else {
        map.stop();
        map.setView([selectedAlumni.lat, selectedAlumni.lng], 13, { animate: false });
      }
      return;
    }

    if (userOrigin) {
      const targetZoom = proximityRadiusKm <= 10 ? 12 : proximityRadiusKm <= 30 ? 10 : 9;
      map.stop();
      map.setView([userOrigin.lat, userOrigin.lng], targetZoom, { animate: false });
    }
  }, [focusTrigger, mapReady]);

  const stopMapPropagation = (e: React.SyntheticEvent) => {
    e.stopPropagation();
  };

  return (
    <div className="relative h-full w-full overflow-hidden bg-slate-200 dark:bg-slate-950">
      <div ref={containerRef} className="h-full w-full" aria-label="Peta Sebaran Alumni" />

      {/* Top-Left Map Controls */}
      <div
        className="pointer-events-auto absolute top-3 left-3 z-[450] flex max-w-[calc(100%-1.5rem)] flex-col gap-2"
        onMouseDown={stopMapPropagation}
        onPointerDown={stopMapPropagation}
        onTouchStart={stopMapPropagation}
        onWheel={stopMapPropagation}
      >
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setShowLayerMenu((v) => !v)}
            className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-semibold shadow-sm transition-colors whitespace-nowrap ${
              showLayerMenu
                ? 'border-slate-900 bg-slate-900 text-white dark:border-sky-400 dark:bg-sky-500 dark:text-slate-950'
                : 'border-slate-200 bg-white/95 text-slate-800 hover:bg-slate-50 dark:border-slate-700/80 dark:bg-slate-900/95 dark:text-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            <Layers className="h-3.5 w-3.5" />
            <span>Menu Peta</span>
          </button>

          <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-slate-200 bg-white/95 px-3 py-2 text-xs font-medium text-slate-800 shadow-sm hover:bg-slate-50 dark:border-slate-700/80 dark:bg-slate-900/95 dark:text-slate-100 dark:hover:bg-slate-800 whitespace-nowrap">
            <input
              type="checkbox"
              checked={showHeatmap}
              onChange={(e) => setShowHeatmap(e.target.checked)}
              className="h-3.5 w-3.5 rounded border-slate-300 text-sky-600 focus:ring-sky-500 dark:border-slate-600 dark:bg-slate-800"
            />
            <Flame className="h-3.5 w-3.5 text-amber-500" />
            <span>Layer Heatmap</span>
          </label>

          <button
            type="button"
            onClick={() => {
              if (!userOrigin && onRequestGpsOrigin) {
                onRequestGpsOrigin();
              }
              onToggleProximityRadius(!showProximityRadius);
            }}
            className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-semibold shadow-sm transition-colors whitespace-nowrap ${
              showProximityRadius
                ? 'border-sky-600 bg-sky-600 text-white hover:bg-sky-700 dark:border-sky-500 dark:bg-sky-500 dark:text-slate-950 dark:hover:bg-sky-400'
                : 'border-slate-200 bg-white/95 text-slate-800 hover:bg-slate-50 dark:border-slate-700/80 dark:bg-slate-900/95 dark:text-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            <Radar className="h-3.5 w-3.5" />
            <span>Show Proximity Radius</span>
          </button>

          <button
            type="button"
            onClick={() => setUseDarkTiles((prev) => !prev)}
            title={useDarkTiles ? 'Gunakan peta terang' : 'Gunakan peta mode malam'}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white/95 px-3 py-2 text-xs font-semibold text-slate-800 shadow-sm transition-colors hover:bg-slate-50 dark:border-slate-700/80 dark:bg-slate-900/95 dark:text-slate-100 dark:hover:bg-slate-800 whitespace-nowrap"
          >
            {useDarkTiles ? (
              <>
                <Moon className="h-3.5 w-3.5 text-sky-400" />
                <span>Peta Malam</span>
              </>
            ) : (
              <>
                <Sun className="h-3.5 w-3.5 text-amber-500" />
                <span>Peta Terang</span>
              </>
            )}
          </button>
        </div>

        {/* Layer Options Popover */}
        {showLayerMenu && (
          <div className="w-72 rounded-xl border border-slate-200 bg-white/95 p-3 shadow-lg backdrop-blur-sm dark:border-slate-700/80 dark:bg-slate-900/95 dark:shadow-black/50">
            <div className="mb-2 flex items-center justify-between border-b border-slate-100 pb-2 dark:border-slate-800">
              <span className="text-xs font-semibold text-slate-900 dark:text-slate-100">
                Pengaturan Layer Peta
              </span>
              <span className="font-mono text-[11px] tabular-nums text-slate-500 dark:text-slate-400">
                {alumniList.length} alumni
              </span>
            </div>

            <div className="space-y-2.5 text-xs text-slate-700 dark:text-slate-300">
              <label className="flex cursor-pointer items-center justify-between gap-2">
                <span className="flex items-center gap-2">
                  <Users className="h-3.5 w-3.5 text-sky-600 dark:text-sky-400" />
                  <span>Clustering Pin Alumni</span>
                </span>
                <input
                  type="checkbox"
                  checked={useClustering}
                  onChange={(e) => setUseClustering(e.target.checked)}
                  className="h-4 w-4 rounded border-slate-300 text-sky-600 dark:border-slate-600 dark:bg-slate-800"
                />
              </label>

              <label className="flex cursor-pointer items-center justify-between gap-2">
                <span className="flex items-center gap-2">
                  <Flame className="h-3.5 w-3.5 text-amber-500" />
                  <span>Tampilkan Layer Heatmap</span>
                </span>
                <input
                  type="checkbox"
                  checked={showHeatmap}
                  onChange={(e) => setShowHeatmap(e.target.checked)}
                  className="h-4 w-4 rounded border-slate-300 text-sky-600 dark:border-slate-600 dark:bg-slate-800"
                />
              </label>

              {showHeatmap && (
                <label className="flex cursor-pointer items-center justify-between gap-2 pl-5 text-slate-600 dark:text-slate-400">
                  <span>Tampilkan pin alumni di atas heatmap</span>
                  <input
                    type="checkbox"
                    checked={showPinsWithHeatmap}
                    onChange={(e) => setShowPinsWithHeatmap(e.target.checked)}
                    className="h-4 w-4 rounded border-slate-300 text-sky-600 dark:border-slate-600 dark:bg-slate-800"
                  />
                </label>
              )}

              <label className="flex cursor-pointer items-center justify-between gap-2 border-t border-slate-100 pt-2 dark:border-slate-800">
                <span className="flex items-center gap-2">
                  <Moon className="h-3.5 w-3.5 text-sky-600 dark:text-sky-400" />
                  <span>Basemap Peta Gelap</span>
                </span>
                <input
                  type="checkbox"
                  checked={useDarkTiles}
                  onChange={(e) => setUseDarkTiles(e.target.checked)}
                  className="h-4 w-4 rounded border-slate-300 text-sky-600 dark:border-slate-600 dark:bg-slate-800"
                />
              </label>

              {onToggleTheme && (
                <button
                  type="button"
                  onClick={onToggleTheme}
                  className="mt-1 flex w-full items-center justify-between rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                >
                  <span>Tema Aplikasi</span>
                  <span className="font-semibold text-sky-700 dark:text-sky-400">
                    {isDark ? 'Mode Gelap' : 'Mode Terang'}
                  </span>
                </button>
              )}
            </div>
          </div>
        )}

        {/* Proximity Radius Slider Panel */}
        {showProximityRadius && (
          <div className="w-80 max-w-full rounded-xl border border-slate-200 bg-white/95 p-3 shadow-lg backdrop-blur-sm dark:border-slate-700/80 dark:bg-slate-900/95 dark:shadow-black/50">
            <div className="mb-1.5 flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-900 dark:text-slate-100">
                Radius Kedekatan
              </span>
              <span className="font-mono text-xs font-semibold tabular-nums text-sky-700 dark:text-sky-400">
                {proximityRadiusKm} km
              </span>
            </div>

            {userOrigin ? (
              <>
                <p className="mb-2 truncate text-[11px] text-slate-600 dark:text-slate-400">
                  Pusat:{' '}
                  <span className="font-medium text-slate-800 dark:text-slate-200">
                    {userOrigin.label}
                  </span>
                  {' · '}
                  <span className="font-mono font-semibold tabular-nums text-sky-700 dark:text-sky-400">
                    {alumniWithinRadiusCount} alumni
                  </span>{' '}
                  di dalam radius
                </p>
                <input
                  type="range"
                  min={1}
                  max={100}
                  step={1}
                  value={proximityRadiusKm}
                  onChange={(e) => onChangeProximityRadiusKm(Number(e.target.value))}
                  aria-label="Slider radius kedekatan dalam kilometer"
                  className="h-2 w-full cursor-pointer accent-sky-600 dark:accent-sky-400"
                />
                <div className="mt-2 flex items-center justify-between gap-1">
                  {RADIUS_PRESETS_KM.map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => onChangeProximityRadiusKm(preset)}
                      className={`rounded-md px-2 py-1 font-mono text-[11px] tabular-nums transition-colors ${
                        proximityRadiusKm === preset
                          ? 'bg-sky-600 font-semibold text-white dark:bg-sky-500 dark:text-slate-950'
                          : 'bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700'
                      }`}
                    >
                      {preset}km
                    </button>
                  ))}
                </div>
              </>
            ) : (
              <div className="space-y-2 text-xs text-slate-600 dark:text-slate-400">
                <p>Tentukan titik acuan terlebih dahulu agar lingkaran radius tampil di peta.</p>
                {onRequestGpsOrigin && (
                  <button
                    type="button"
                    onClick={onRequestGpsOrigin}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-sky-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-sky-700 dark:bg-sky-500 dark:text-slate-950 dark:hover:bg-sky-400"
                  >
                    <LocateFixed className="h-3.5 w-3.5" />
                    <span>Aktifkan Lokasi GPS</span>
                  </button>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Bottom-Left Heatmap Legend */}
      {showHeatmap && (
        <div className="pointer-events-none absolute bottom-4 left-3 z-[450] rounded-lg border border-slate-200 bg-white/95 px-3 py-2 shadow-md dark:border-slate-700/80 dark:bg-slate-900/95">
          <div className="mb-1 text-[11px] font-semibold text-slate-800 dark:text-slate-100">
            Konsentrasi Alumni (Heatmap)
          </div>
          <div className="flex items-center gap-2 text-[11px] text-slate-600 dark:text-slate-400">
            <span>Rendah</span>
            <div className="alumni-heatmap-scale" />
            <span>Padat</span>
          </div>
        </div>
      )}
    </div>
  );
};
