import { useEffect, useState } from 'react';
import maplibregl from 'maplibre-gl';
import { databaseService } from '../DatabaseService';
import { APP_CONFIG } from '../Config';
import type { TooltipData } from '../types';

export function useMapEvents(map: React.MutableRefObject<maplibregl.Map | null>, isMapReady: boolean) {
  const [tooltip, setTooltip] = useState<TooltipData | null>(null);

  useEffect(() => {
    if (!isMapReady || !map.current) return;

    let lastMove = 0;
    const onMouseMove = async (e: maplibregl.MapMouseEvent) => {
      if (!map.current || Date.now() - lastMove < 50) return;
      lastMove = Date.now();

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
