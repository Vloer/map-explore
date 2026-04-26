import { useState, useCallback, useMemo } from 'react';
import { StreetAPIService } from '../services/StreetAPIService';
import { StreetGeoService } from '../services/StreetGeoService';
import { databaseService } from '../services/DatabaseService';
import { APP_CONFIG } from '../Config';
import { Logger } from '../Util';
import type { RegionStats, Street, PlaceGeoData, BoundingBox } from '../types';

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
          
          // Even if cached, we might want to re-check visited status if it wasn't tracked?
          // For now, let's just use the cache.
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

      // Ensure we have correct min/max for the bbox
      const bbox: BoundingBox = {
        south: Math.min(region.bounds[0], region.bounds[1]),
        north: Math.max(region.bounds[0], region.bounds[1]),
        west: Math.min(region.bounds[2], region.bounds[3]),
        east: Math.max(region.bounds[2], region.bounds[3])
      };

      console.debug(`useStreets: Requesting bbox: S:${bbox.south} N:${bbox.north} W:${bbox.west} E:${bbox.east}`);

      const placeData: PlaceGeoData = {
        name: region.name,
        display_name: region.name,
        lat: (bbox.south + bbox.north) / 2,
        lng: (bbox.west + bbox.east) / 2,
        place_type: region.type,
        bounding_box: bbox,
        bounding_polygon: polygon,
        streets: []
      };

      const allStreets = await apiService.getStreetsForPlace(placeData);
      console.info(`useStreets: API returned ${allStreets.length} total streets for ${region.name}`);
      
      // Perform spatial clipping to the polygon
      Logger.start("polygon_clipping");
      const filtered = await geoService.filterStreetsInPolygon(allStreets, polygon);
      Logger.end("polygon_clipping", `Clipped ${allStreets.length} down to ${filtered.length} streets`);
      
      const visitedCount = filtered.filter(s => s.visited).length;
      console.info(`useStreets: ${visitedCount}/${filtered.length} streets visited in ${region.name}`);
      
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
