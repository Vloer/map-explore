import { useState, useEffect, useRef } from "react";
import * as turf from "@turf/turf";
import { databaseService } from "../services/DatabaseService";
import type { RegionStats } from "../types";
import { Logger } from "../Util";

/**
 * Hook to calculate exploration statistics for a given region.
 * Generates a grid of points within the region and checks how many have been "revealed" by the user's history.
 *
 * @param {RegionStats | null} regionStats The statistics and geometry of the region.
 * @param {number} fogRadius The radius in meters to consider a point explored.
 * @returns {{ explorationPercentage: number, setExplorationPercentage: (p: number) => void }}
 */
export function useExplorationStats(
  regionStats: RegionStats | null,
  fogRadius: number,
) {
  const [explorationPercentage, setExplorationPercentage] = useState<number>(0);
  const lastCalculationRef = useRef<{ id: string; radius: number } | null>(
    null,
  );

  useEffect(() => {
    if (regionStats) {
      const regionId = `${regionStats.name}-${regionStats.bounds.join(",")}`;
      
      // If nothing has changed, skip
      if (
        lastCalculationRef.current?.id === regionId &&
        lastCalculationRef.current?.radius === fogRadius
      ) {
        return;
      }

      // Debounce the calculation by 1 second to avoid UI stutter during sliding
      const timer = setTimeout(() => {
        lastCalculationRef.current = { id: regionId, radius: fogRadius };
        calculatePercentage(regionStats);
      }, 1000);

      return () => clearTimeout(timer);
    }
  }, [regionStats, fogRadius]);

  /**
   * Performs the grid-based geometric calculation of the exploration percentage.
   * @param {RegionStats} stats The region statistics.
   * @private
   */
  const calculatePercentage = async (stats: RegionStats) => {
    Logger.start("calculate_grid_pct");
    const [minLat, maxLat, minLng, maxLng] = stats.bounds;
    const allPoints = await databaseService.getPointsInBounds(
      minLat,
      maxLat,
      minLng,
      maxLng,
    );

    if (allPoints.length === 0) {
      setExplorationPercentage(0);
      return;
    }

    try {
      const villagePolygon = stats.geojson;
      const bbox: [number, number, number, number] = [
        minLng,
        minLat,
        maxLng,
        maxLat,
      ];

      // 1. Generate a grid of points within the village polygon
      // Using 10m spacing for a good balance between accuracy and performance.
      // The mask option ensures points are only generated inside the polygon.
      const grid = turf.pointGrid(bbox, 10, {
        units: "meters",
        mask: villagePolygon,
      });
      const pointsInVillage = grid.features;

      if (pointsInVillage.length === 0) {
        setExplorationPercentage(0);
        return;
      }

      // 3. Create a spatial lookup for database points to avoid O(N*M) check.
      // We'll bucket database points into a simple grid of 0.001 degrees (~111m)
      const bucketSize = 0.001;
      const buckets: Map<string, typeof allPoints> = new Map();

      for (const p of allPoints) {
        const key = `${Math.floor(p.lat / bucketSize)},${Math.floor(p.lng / bucketSize)}`;
        if (!buckets.has(key)) buckets.set(key, []);
        buckets.get(key)!.push(p);
      }

      // 4. Check each grid point for proximity to any database point
      // We use a more accurate distance check by scaling longitude by cos(lat)
      let exploredCount = 0;
      const metersPerDegLat = 111111;
      const fogRadiusSq = fogRadius * fogRadius;

      for (const gp of pointsInVillage) {
        const [glng, glat] = gp.geometry.coordinates;
        const cosLat = Math.cos((glat * Math.PI) / 180);
        const metersPerDegLng = metersPerDegLat * cosLat;

        // Check neighboring buckets
        let found = false;
        const bLat = Math.floor(glat / bucketSize);
        const bLng = Math.floor(glng / bucketSize);

        for (let i = -1; i <= 1 && !found; i++) {
          for (let j = -1; j <= 1 && !found; j++) {
            const bucket = buckets.get(`${bLat + i},${bLng + j}`);
            if (bucket) {
              for (const p of bucket) {
                const dy = (p.lat - glat) * metersPerDegLat;
                const dx = (p.lng - glng) * metersPerDegLng;
                if (dx * dx + dy * dy <= fogRadiusSq) {
                  found = true;
                  break;
                }
              }
            }
          }
        }
        if (found) exploredCount++;
      }

      // 5. Final Calculation
      const percentage = (exploredCount / pointsInVillage.length) * 100;

      console.log(`Grid-based Stats for ${stats.name}:`, {
        dbPoints: allPoints.length,
        gridPointsInVillage: pointsInVillage.length,
        exploredGridPoints: exploredCount,
        percentage: percentage.toFixed(5),
      });

      setExplorationPercentage(percentage);
    } catch (err) {
      console.error("Grid-based geometric calculation failed:", err);
    } finally {
      Logger.end("calculate_grid_pct");
    }
  };

  return { explorationPercentage, setExplorationPercentage, refreshStats: () => regionStats && calculatePercentage(regionStats) };
}
