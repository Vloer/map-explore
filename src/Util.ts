import { APP_CONFIG } from "./Config";

/**
 * Converts meters to approximate E7 coordinate units.
 * Note: 1 degree latitude is ~111,111 meters.
 * E7 units are degrees * 10,000,000.
 */
export function metersToE7(meters: number): number {
  const degrees = meters / APP_CONFIG.METERS_PER_DEGREE;
  return Math.round(degrees * 1e7);
}

/**
 * Calculates approximate distance in meters between two E7 coordinate pairs.
 * Uses a simple equirectangular projection for performance.
 */
export function getDistanceE7(latE7_1: number, lngE7_1: number, latE7_2: number, lngE7_2: number): number {
  const dLat = (latE7_2 - latE7_1);
  const cosLat = Math.cos((latE7_1 / 1e7) * Math.PI / 180);
  const dLng = (lngE7_2 - lngE7_1) * cosLat;
  const distE7 = Math.sqrt(dLat * dLat + dLng * dLng);
  return (distE7 / 1e7) * 111111;
}
