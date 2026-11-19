import L from 'leaflet';

// Expose global L before loading UMD plugins such as leaflet.markercluster
(globalThis as unknown as { L: typeof L }).L = L;

await import('leaflet.markercluster');

export { L };
