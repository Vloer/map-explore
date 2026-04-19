import { useEffect, useRef, useState } from 'react';
import maplibregl from 'maplibre-gl';
import { APP_CONFIG } from '../Config';

/**
 * Hook to initialize and manage the MapLibre map instance.
 * Sets up the map container, style, and navigation controls.
 * 
 * @returns {object} Map container ref, map instance ref, and ready state.
 */
export function useMap() {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map | null>(null);
  const [isMapReady, setIsMapReady] = useState(false);

  useEffect(() => {
    if (map.current) return;
    if (!mapContainer.current) return;

    try {
      map.current = new maplibregl.Map({
        container: mapContainer.current,
        style: {
          version: 8,
          sources: {
            'osm': {
              type: 'raster',
              tiles: [APP_CONFIG.MAP_STYLE],
              tileSize: APP_CONFIG.TILE_SIZE,
              attribution: '&copy; OpenStreetMap Contributors',
              maxzoom: APP_CONFIG.MAP_MAX_ZOOM
            }
          },
          layers: [{ id: 'osm', type: 'raster', source: 'osm' }]
        },
        center: APP_CONFIG.MAP_INITIAL_CENTER,
        zoom: APP_CONFIG.MAP_INITIAL_ZOOM,
        maxZoom: APP_CONFIG.MAP_MAX_ZOOM
      });

      map.current.addControl(new maplibregl.NavigationControl());

      map.current.on('load', () => {
        if (!map.current) return;
        setIsMapReady(true);
      });
    } catch (err) {
      console.error("useMap: Map creation failed:", err);
    }

    return () => {
      map.current?.remove();
      map.current = null;
    };
  }, []);

  return { mapContainer, map, isMapReady };
}

