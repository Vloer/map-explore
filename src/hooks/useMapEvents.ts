import { useEffect, useState } from 'react';
import maplibregl from 'maplibre-gl';
import { databaseService } from '../services/DatabaseService';
import { APP_CONFIG } from '../Config';
import type { TooltipData } from '../types';

/**
 * Hook to manage map-level events and interactions.
 * Currently handles mouse movement for displaying tooltips over visited locations.
 * 
 * @param {React.MutableRefObject<maplibregl.Map | null>} map The map instance ref.
 * @param {boolean} isMapReady Whether the map has finished loading.
 * @returns {object} Current tooltip data.
 */
export function useMapEvents(map: React.MutableRefObject<maplibregl.Map | null>, isMapReady: boolean) {
  const [tooltip, setTooltip] = useState<TooltipData | null>(null);

  useEffect(() => {
    if (!isMapReady || !map.current) return;

    let lastMove = 0;
    let lastQueryPos = { x: -100, y: -100 };

    /**
     * Throttled mouse move handler to check for nearby visited points.
     */
    const onMouseMove = async (e: maplibregl.MapMouseEvent) => {
      if (!map.current) return;
      
      const zoom = map.current.getZoom();
      // Optimization: Don't query database if zoomed out too far (individual points not visible)
      if (zoom < 13) {
        if (tooltip) setTooltip(null);
        return;
      }

      const now = Date.now();
      const dx = Math.abs(e.point.x - lastQueryPos.x);
      const dy = Math.abs(e.point.y - lastQueryPos.y);

      // Optimization: Increase throttle to 150ms AND require mouse to move at least 3px 
      // from last query position to prevent redundant hits.
      if (now - lastMove < 150 || (dx < 3 && dy < 3)) return;
      
      lastMove = now;
      lastQueryPos = { x: e.point.x, y: e.point.y };

      const radius = APP_CONFIG.HOVER_RADIUS_DEGREES;
      const nearest = await databaseService.getNearestPoint(e.lngLat.lat, e.lngLat.lng, radius);
      
      if (nearest) {
        const date = new Date(nearest.timestamp);
        const timeStr = date.toLocaleString([], {
          year: 'numeric', month: '2-digit', day: '2-digit',
          hour: '2-digit', minute: '2-digit'
        });
        setTooltip({
          x: e.point.x,
          y: e.point.y,
          text: `${nearest.lat.toFixed(5)}, ${nearest.lng.toFixed(5)}\nLatest visit: ${timeStr}\nTotal signals: ${nearest.visits}`
        });
      } else {
        setTooltip(null);
      }
    };

    map.current.on('mousemove', onMouseMove);

    return () => {
      map.current?.off('mousemove', onMouseMove);
    };
  }, [isMapReady, map]);

  return { tooltip };
}

