import { useEffect, useRef, useState, useCallback } from 'react';
import maplibregl from 'maplibre-gl';
import { FogLayer } from '../FogLayer';
import { HeatmapLayer } from '../HeatmapLayer';
import { databaseService } from '../services/DatabaseService';
import { APP_CONFIG } from '../Config';

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
  const [showGrid, setShowGrid] = useState(() => {
    return localStorage.getItem('show_debug_grid') === 'true';
  });

  const toggleGrid = useCallback((enabled: boolean) => {
    setShowGrid(enabled);
    localStorage.setItem('show_debug_grid', String(enabled));
  }, []);

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

  const _updateGrid = useCallback(() => {
    if (!map.current || !showGrid) return;
    
    const zoom = map.current.getZoom();
    if (zoom < APP_CONFIG.MIN_GRID_SHOW_ZOOM) {
      if (map.current.getSource('debug-grid')) {
        (map.current.getSource('debug-grid') as maplibregl.GeoJSONSource).setData({ type: 'FeatureCollection', features: [] });
      }
      return;
    }

    const bounds = map.current.getBounds();
    const sw = bounds.getSouthWest();
    const ne = bounds.getNorthEast();

    const gridSizeDegrees = APP_CONFIG.UNLOCK_GRID_SIZE_METERS / APP_CONFIG.METERS_PER_DEGREE;
    
    // Calculate start and end grid indices
    const startLat = Math.floor(sw.lat / gridSizeDegrees) * gridSizeDegrees;
    const endLat = Math.ceil(ne.lat / gridSizeDegrees) * gridSizeDegrees;
    const startLng = Math.floor(sw.lng / gridSizeDegrees) * gridSizeDegrees;
    const endLng = Math.ceil(ne.lng / gridSizeDegrees) * gridSizeDegrees;

    const features: any[] = [];
    
    // Limit number of grid cells to prevent crashing if user zooms out too much
    let count = 0;
    for (let lat = startLat; lat < endLat && count < 1000; lat += gridSizeDegrees) {
      for (let lng = startLng; lng < endLng && count < 1000; lng += gridSizeDegrees) {
        const gridId = databaseService.getGridId(lat + gridSizeDegrees/2, lng + gridSizeDegrees/2);
        
        // Square polygon
        features.push({
          id: count, // Use local index as numeric ID for feature-state
          type: 'Feature',
          properties: { id: String(gridId) },
          geometry: {
            type: 'Polygon',
            coordinates: [[
              [lng, lat],
              [lng + gridSizeDegrees, lat],
              [lng + gridSizeDegrees, lat + gridSizeDegrees],
              [lng, lat + gridSizeDegrees],
              [lng, lat]
            ]]
          }
        });
        count++;
      }
    }

    if (map.current.getSource('debug-grid')) {
      (map.current.getSource('debug-grid') as maplibregl.GeoJSONSource).setData({
        type: 'FeatureCollection',
        features
      });
    } else {
      map.current.addSource('debug-grid', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features },
        generateId: false // We provided our own
      });

      map.current.addLayer({
        id: 'debug-grid-lines',
        type: 'line',
        source: 'debug-grid',
        paint: {
          'line-color': '#00ffff', // Cyan for better visibility
          'line-width': 2,
          'line-opacity': 0.9
        }
      });

      // Hover fill to highlight the box
      map.current.addLayer({
        id: 'debug-grid-hover',
        type: 'fill',
        source: 'debug-grid',
        paint: {
          'fill-color': '#00ffff',
          'fill-opacity': [
            'case',
            ['boolean', ['feature-state', 'hover'], false],
            0.4,
            0
          ]
        }
      });

      // Labels - only show when hovered
      map.current.addLayer({
        id: 'debug-grid-labels',
        type: 'symbol',
        source: 'debug-grid',
        layout: {
          'text-field': ['get', 'id'],
          'text-size': 14,
          'text-allow-overlap': true,
          'text-font': ['Open Sans Bold', 'Arial Unicode MS Bold']
        },
        paint: {
          'text-color': '#ffffff',
          'text-halo-color': '#000000',
          'text-halo-width': 2,
          'text-opacity': [
            'case',
            ['boolean', ['feature-state', 'hover'], false],
            1,
            0
          ]
        }
      });
    }
  }, [showGrid]);

  useEffect(() => {
    if (!isMapReady || !map.current) return;

    let hoveredFeatureId: number | null = null;

    const onMouseMove = (e: any) => {
      if (!map.current || !showGrid) return;
      
      const features = map.current.queryRenderedFeatures(e.point, { layers: ['debug-grid-hover'] });
      
      if (features.length > 0) {
        const newHoveredId = features[0].id as number;
        
        if (hoveredFeatureId !== newHoveredId) {
          if (hoveredFeatureId !== null) {
            map.current.setFeatureState(
              { source: 'debug-grid', id: hoveredFeatureId },
              { hover: false }
            );
          }
          
          hoveredFeatureId = newHoveredId;
          map.current.setFeatureState(
            { source: 'debug-grid', id: hoveredFeatureId },
            { hover: true }
          );
        }
      } else if (hoveredFeatureId !== null) {
        map.current.setFeatureState(
          { source: 'debug-grid', id: hoveredFeatureId },
          { hover: false }
        );
        hoveredFeatureId = null;
      }
    };

    if (showGrid) {
      _updateGrid();
      map.current.on('moveend', _updateGrid);
      map.current.on('mousemove', onMouseMove);
    } else {
      map.current.off('moveend', _updateGrid);
      map.current.off('mousemove', onMouseMove);
      if (map.current.getLayer('debug-grid-lines')) map.current.removeLayer('debug-grid-lines');
      if (map.current.getLayer('debug-grid-labels')) map.current.removeLayer('debug-grid-labels');
      if (map.current.getLayer('debug-grid-hover')) map.current.removeLayer('debug-grid-hover');
      if (map.current.getSource('debug-grid')) map.current.removeSource('debug-grid');
    }

    return () => {
      if (map.current) {
        map.current.off('moveend', _updateGrid);
        map.current.off('mousemove', onMouseMove);
      }
    };
  }, [isMapReady, map, showGrid, _updateGrid]);

  /**
   * Refreshes the data in both the fog and heatmap layers.
   */
  const refreshLayers = useCallback(() => {
    fogLayer.current?.refreshData();
    heatmapLayer.current?.refreshData();
  }, []);

  /**
   * Updates the reveal radius for both fog and heatmap layers.
   * @param {number} radius The new radius in meters.
   */
  const updateFogRadius = useCallback((radius: number) => {
    if (fogLayer.current) {
      fogLayer.current.meterRadius = radius;
      fogLayer.current.draw();
    }
    if (heatmapLayer.current) {
      heatmapLayer.current.meterRadius = radius;
      heatmapLayer.current.draw();
    }
  }, []);

  /**
   * Updates the heatmap strength (max visits).
   * @param {number} strength The new maximum visits value.
   */
  const updateHeatmapStrength = useCallback((strength: number) => {
    if (heatmapLayer.current) {
      heatmapLayer.current.maxVisits = strength;
      heatmapLayer.current.draw();
    }
  }, []);

  /**
   * Updates the speed filter for both layers.
   * @param {number | undefined} min Minimum speed in km/h.
   * @param {number | undefined} max Maximum speed in km/h.
   */
  const updateSpeedFilter = useCallback((min: number | undefined, max: number | undefined) => {
    if (fogLayer.current) {
      fogLayer.current.minSpeed = min;
      fogLayer.current.maxSpeed = max;
    }
    if (heatmapLayer.current) {
      heatmapLayer.current.minSpeed = min;
      heatmapLayer.current.maxSpeed = max;
    }
    refreshLayers();
  }, [refreshLayers]);

  /**
   * Toggles the visibility of the heatmap layer.
   * @param {boolean} enabled Whether the heatmap should be enabled.
   */
  const toggleHeatmap = useCallback((enabled: boolean) => {
    heatmapLayer.current?.setEnabled(enabled);
  }, []);

  /**
   * Sets the GeoJSON feature(s) to be highlighted on the map.
   * @param {any} geojson GeoJSON feature or collection.
   */
  const setHighlight = useCallback((geojson: any) => {
    fogLayer.current?.setHighlight(geojson);
  }, []);

  return { 
    fogLayer, 
    heatmapLayer, 
    refreshLayers, 
    updateFogRadius, 
    updateHeatmapStrength, 
    toggleHeatmap,
    setHighlight,
    showGrid,
    toggleGrid,
    updateSpeedFilter
  };
}

