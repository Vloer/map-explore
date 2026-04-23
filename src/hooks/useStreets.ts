import { useState, useCallback, useMemo } from 'react';
import { StreetAPIService } from '../services/StreetAPIService';
import { StreetGeoService } from '../services/StreetGeoService';
import { databaseService } from '../services/DatabaseService';
import { APP_CONFIG } from '../Config';
import { Logger } from '../Util';
import type { RegionStats, Street } from '../types';

/**
 * Hook for managing and loading street data for a specific geographic region.
 * Handles caching, API fetching from PDOK, and spatial filtering.
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
   * Checks local cache first before fetching from API.
   * 
   * @param region The region statistics object containing bounds and geometry.
   */
  const loadStreets = useCallback(async (region: RegionStats) => {
    if (!region || !region.osmId || !region.osmType) return;
    
    setIsLoading(true);
    setError(null);
    Logger.start("total_street_load");
    
    try {
      // 1. Check Database Cache
      Logger.start("cache_lookup");
      const cached = await databaseService.getStreetsCache(region.osmId, region.osmType);
      Logger.end("cache_lookup");
      
      if (cached) {
        const age = Date.now() - cached.lastUpdated;
        if (age < APP_CONFIG.STREETS_CACHE_TTL_MS) {
          Logger.info("useStreets", `Using cached streets for ${region.name} (${(age / (24*3600*1000)).toFixed(1)} days old)`);
          setStreets(cached.streets);
          setIsLoading(false);
          Logger.end("total_street_load", "Total Street Load (Cache)");
          return;
        }
      }

      // 2. Fetch from API if no cache or expired
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

      const allStreets = await apiService.getStreetsForPlace(region.name, region.type);
      const filtered = await geoService.filterStreetsInPolygon(allStreets, polygon);
      
      // 3. Save to Database Cache
      Logger.start("cache_save");
      await databaseService.saveStreetsCache(region.osmId, region.osmType, filtered);
      Logger.end("cache_save");
      
      setStreets(filtered);
    } catch (err) {
      console.error("Failed to load streets:", err);
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsLoading(false);
      Logger.end("total_street_load", "Total Street Load (API)");
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
