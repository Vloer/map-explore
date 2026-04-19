import { useState, useCallback } from 'react';
import { StreetAPIService } from '../services/StreetAPIService';
import { StreetGeoService } from '../services/StreetGeoService';
import { databaseService } from '../services/DatabaseService';
import type { RegionStats, Street, BoundingBox } from '../types';

const apiService = new StreetAPIService();
const geoService = new StreetGeoService();

const CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

export function useStreets() {
  const [streets, setStreets] = useState<Street[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadStreets = useCallback(async (region: RegionStats) => {
    if (!region || !region.osmId || !region.osmType) return;
    
    setIsLoading(true);
    setError(null);
    
    try {
      // 1. Check Database Cache
      const cached = await databaseService.getStreetsCache(region.osmId, region.osmType);
      
      if (cached) {
        const age = Date.now() - cached.lastUpdated;
        if (age < CACHE_TTL_MS) {
          console.info(`useStreets: Using cached streets for ${region.name} (${(age / (24*3600*1000)).toFixed(1)} days old)`);
          setStreets(cached.streets);
          setIsLoading(false);
          return;
        }
        console.info(`useStreets: Cache for ${region.name} is expired (${(age / (24*3600*1000)).toFixed(1)} days old), refreshing...`);
      }

      // 2. Fetch from API if no cache or expired
      console.info(`useStreets: Fetching streets for ${region.name} from API...`);
      const bounds = region.bounds; // [minLat, maxLat, minLng, maxLng]
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
      
      // 3. Save to Database Cache
      await databaseService.saveStreetsCache(region.osmId, region.osmType, filtered);
      console.info(`useStreets: Saving streets of ${region.name} in database`);
      
      setStreets(filtered);
    } catch (err) {
      console.error("Failed to load streets:", err);
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsLoading(false);
    }
  }, []);

  return {
    streets,
    isLoading,
    error,
    loadStreets,
    setStreets
  };
}
