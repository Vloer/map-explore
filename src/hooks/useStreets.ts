import { useState, useCallback, useMemo, useEffect } from 'react';
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
 * @param region Optional current region to load data for.
 * @returns Object containing street data, loading state, errors, and load functions.
 */
export function useStreets(region?: RegionStats | null) {
  const [streets, setStreets] = useState<Street[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const apiService = useMemo(() => new StreetAPIService(), []);
  const geoService = useMemo(() => new StreetGeoService(), []);

  /**
   * Loads street data for a given region.
   * Checks local cache first before fetching from API.
   */
  const loadStreets = useCallback(async (regionToLoad: RegionStats) => {
    if (!regionToLoad || !regionToLoad.osmId || !regionToLoad.osmType) return;
    
    setIsLoading(true);
    setError(null);
    Logger.start("total_street_load");
    
    try {
      // 1. Check Database Cache
      Logger.start("cache_lookup");
      const cached = await databaseService.getStreetsCache(regionToLoad.osmId, regionToLoad.osmType);
      Logger.end("cache_lookup");
      
      if (cached) {
        const age = Date.now() - cached.lastUpdated;
        if (age < APP_CONFIG.STREETS_CACHE_TTL_MS) {
          Logger.info("useStreets", `Using cached streets for ${regionToLoad.name} (${(age / (24*3600*1000)).toFixed(1)} days old)`);
          setStreets(cached.streets);
          setIsLoading(false);
          Logger.end("total_street_load", "Total Street Load (Cache)");
          return;
        }
      }

      // 2. Fetch from API if no cache or expired
      let polygon: number[][] = [];
      const geojson = regionToLoad.geojson;
      
      // geojson is now strongly typed as Polygon | MultiPolygon
      if (geojson.type === 'Polygon') {
        polygon = geojson.coordinates[0];
      } else if (geojson.type === 'MultiPolygon') {
        polygon = geojson.coordinates[0][0];
      }

      // Ensure we have correct min/max for the bbox
      const bbox: BoundingBox = {
        south: Math.min(regionToLoad.bounds[0], regionToLoad.bounds[1]),
        north: Math.max(regionToLoad.bounds[0], regionToLoad.bounds[1]),
        west: Math.min(regionToLoad.bounds[2], regionToLoad.bounds[3]),
        east: Math.max(regionToLoad.bounds[2], regionToLoad.bounds[3])
      };

      const placeData: PlaceGeoData = {
        name: regionToLoad.name,
        display_name: regionToLoad.name,
        lat: (bbox.south + bbox.north) / 2,
        lng: (bbox.west + bbox.east) / 2,
        place_type: regionToLoad.type,
        bounding_box: bbox,
        bounding_polygon: polygon,
        streets: []
      };

      const allStreets = await apiService.getStreetsForPlace(placeData);
      
      Logger.start("polygon_clipping");
      const filtered = await geoService.filterStreetsInPolygon(allStreets, polygon);
      Logger.end("polygon_clipping", `Clipped ${allStreets.length} down to ${filtered.length} streets`);
      
      Logger.start("cache_save");
      await databaseService.saveStreetsCache(regionToLoad.osmId, regionToLoad.osmType, filtered);
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

  // Effect to automatically load or clear streets when region changes
  useEffect(() => {
    if (region) {
      loadStreets(region);
    } else {
      setStreets([]);
    }
  }, [region, loadStreets]);

  return {
    streets,
    isLoading,
    error,
    loadStreets,
    setStreets,
    geoService,
    refreshVisited: async () => {
      setIsLoading(true);
      try {
        const updated = await apiService.refreshVisitedStatus(streets);
        setStreets(updated);
      } finally {
        setIsLoading(false);
      }
    }
  };
}
