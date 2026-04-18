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
