import { useEffect, useRef } from 'react';
import maplibregl from 'maplibre-gl';
import { FogLayer } from '../FogLayer';
import { HeatmapLayer } from '../HeatmapLayer';
import { databaseService } from '../DatabaseService';

export function useLayers(map: React.MutableRefObject<maplibregl.Map | null>, isMapReady: boolean) {
  const fogLayer = useRef<FogLayer | null>(null);
  const heatmapLayer = useRef<HeatmapLayer | null>(null);

  useEffect(() => {
    if (!isMapReady || !map.current) return;

    const initLayers = async () => {
      try {
        await databaseService.init();
        if (map.current) {
          fogLayer.current = new FogLayer(map.current, databaseService);
          heatmapLayer.current = new HeatmapLayer(map.current, databaseService);
        }
      } catch (err) {
        console.error("useLayers: DB or Layer init failed:", err);
      }
    };

    initLayers();

    return () => {
      fogLayer.current?.destroy();
      heatmapLayer.current?.destroy();
      fogLayer.current = null;
      heatmapLayer.current = null;
    };
  }, [isMapReady, map]);

  const refreshLayers = () => {
    fogLayer.current?.refreshData();
    heatmapLayer.current?.refreshData();
  };

  const updateFogRadius = (radius: number) => {
    if (fogLayer.current) {
      fogLayer.current.meterRadius = radius;
      fogLayer.current.draw();
    }
    if (heatmapLayer.current) {
      heatmapLayer.current.meterRadius = radius;
      heatmapLayer.current.draw();
    }
  };

  const updateHeatmapStrength = (strength: number) => {
    if (heatmapLayer.current) {
      heatmapLayer.current.maxVisits = strength;
      heatmapLayer.current.draw();
    }
  };

  const toggleHeatmap = (enabled: boolean) => {
    heatmapLayer.current?.setEnabled(enabled);
  };

  const setHighlight = (geojson: any) => {
    fogLayer.current?.setHighlight(geojson);
  };

  return { 
    fogLayer, 
    heatmapLayer, 
    refreshLayers, 
    updateFogRadius, 
    updateHeatmapStrength, 
    toggleHeatmap,
    setHighlight
  };
}
