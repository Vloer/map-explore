import { useEffect, useRef } from 'react';
import maplibregl from 'maplibre-gl';
import { FogLayer } from '../FogLayer';
import { HeatmapLayer } from '../HeatmapLayer';
import { databaseService } from '../services/DatabaseService';

/**
 * Hook to manage the map layers (Fog and Heatmap).
 * Handles initialization, data refreshing, and property updates for layers.
 * 
 * @param {React.MutableRefObject<maplibregl.Map | null>} map The map instance ref.
 * @param {boolean} isMapReady Whether the map has finished loading.
 * @returns {object} Layer refs and control functions.
 */
export function useLayers(map: React.MutableRefObject<maplibregl.Map | null>, isMapReady: boolean) {
  const fogLayer = useRef<FogLayer | null>(null);
  const heatmapLayer = useRef<HeatmapLayer | null>(null);

  useEffect(() => {
    if (!isMapReady || !map.current) return;

    /**
     * Initializes the layers and the database service.
     */
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

  /**
   * Refreshes the data in both the fog and heatmap layers.
   */
  const refreshLayers = () => {
    fogLayer.current?.refreshData();
    heatmapLayer.current?.refreshData();
  };

  /**
   * Updates the reveal radius for both fog and heatmap layers.
   * @param {number} radius The new radius in meters.
   */
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

  /**
   * Updates the heatmap strength (max visits).
   * @param {number} strength The new maximum visits value.
   */
  const updateHeatmapStrength = (strength: number) => {
    if (heatmapLayer.current) {
      heatmapLayer.current.maxVisits = strength;
      heatmapLayer.current.draw();
    }
  };

  /**
   * Toggles the visibility of the heatmap layer.
   * @param {boolean} enabled Whether the heatmap should be enabled.
   */
  const toggleHeatmap = (enabled: boolean) => {
    heatmapLayer.current?.setEnabled(enabled);
  };

  /**
   * Sets the GeoJSON feature(s) to be highlighted on the map.
   * @param {any} geojson GeoJSON feature or collection.
   */
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

