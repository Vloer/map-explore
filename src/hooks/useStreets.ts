import { useState, useCallback, useMemo } from 'react';
import { StreetAPIService } from '../services/StreetAPIService';
import { StreetGeoService } from '../services/StreetGeoService';
import { databaseService } from '../services/DatabaseService';
import { APP_CONFIG } from '../Config';
import type { RegionStats, Street, BoundingBox } from '../types';

/**
 * Hook for managing and loading street data for a specific geographic region.
 * Handles caching, API fetching from OSM, and spatial filtering.
 * 
 * @returns Object containing street data, loading state, errors, and load functions.
 */
export function useStreets() {
  const [streets, setStreets] = useState<Street[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const apiService = useMemo(() => new StreetAPIService(), []);
  const geoService = useMemo(() => new StreetGeoService(), []);

  /**
   * Loads street data for a given region.
   * Checks local cache first before fetching from Overpass API.
   * 
   * @param region The region statistics object containing bounds and geometry.
   */
  const loadStreets = useCallback(async (region: RegionStats) => {
    if (!region || !region.osmId || !region.osmType) return;
    
    setIsLoading(true);
    setError(null);
    
    try {
      const cached = await databaseService.getStreetsCache(region.osmId, region.osmType);
      
      if (cached) {
        const age = Date.now() - cached.lastUpdated;
        if (age < APP_CONFIG.STREETS_CACHE_TTL_MS) {
          console.info(`useStreets: Using cached streets for ${region.name} (${(age / (24*3600*1000)).toFixed(1)} days old)`);
          setStreets(cached.streets);
          setIsLoading(false);
          return;
        }
      }

      const bounds = region.bounds; 
      const bbox: BoundingBox = {
        south: bounds[0],
        north: bounds[1],
        west: bounds[2],
        east: bounds[3]
      };

      let polygon: number[][] = [];
      const geojson = region.geojson;
      
      if (geojson.geometry) {
        if (geojson.geometry.type === 'Polygon') {
          polygon = geojson.geometry.coordinates[0];
        } else if (geojson.geometry.type === 'MultiPolygon') {
          polygon = geojson.geometry.coordinates[0][0];
        }
      } else if (geojson.type === 'Polygon') {
        polygon = geojson.coordinates[0];
      } else if (geojson.type === 'MultiPolygon') {
        polygon = geojson.coordinates[0][0];
      }

      const allStreets = await apiService.getStreetsInBoundingBox(region.name, bbox, region.type);
      const filtered = await geoService.filterStreetsInPolygon(allStreets, polygon);
      
      await databaseService.saveStreetsCache(region.osmId, region.osmType, filtered);
      setStreets(filtered);
    } catch (err) {
      console.error("Failed to load streets:", err);
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsLoading(false);
    }
  }, [apiService, geoService]);

  return {
    streets,
    isLoading,
    error,
    loadStreets,
    setStreets,
    geoService 
  };
}
