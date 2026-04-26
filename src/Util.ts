import { APP_CONFIG } from "./Config";
import type { Coordinates, Node } from "./types";

/**
 * Utility for standardized performance logging and debugging.
 */
export class Logger {
  private static timers: Map<string, number> = new Map();

  /**
   * Starts a named performance timer.
   * @param label Unique label for the timer.
   */
  static start(label: string) {
    this.timers.set(label, performance.now());
  }

  /**
   * Stops a timer and logs the elapsed time.
   * @param label The label used to start the timer.
   * @param message Optional message prefix.
   */
  static end(label: string, message?: string) {
    const startTime = this.timers.get(label);
    if (startTime === undefined) return;
    const duration = performance.now() - startTime;
    console.log(`[PERF] ${message || label}: ${duration.toFixed(2)}ms`);
    this.timers.delete(label);
  }

  /**
   * Logs a standard debug message.
   */
  static debug(module: string, message: string, data?: any) {
    if (data) console.debug(`[${module}] ${message}`, data);
    else console.debug(`[${module}] ${message}`);
  }

  /**
   * Logs an informational message.
   */
  static info(module: string, message: string) {
    console.info(`[${module}] ${message}`);
  }
}

/**
 * Converts meters to approximate E7 coordinate units.
 * Note: 1 degree latitude is ~111,111 meters.
 * E7 units are degrees * 10,000,000.
 * 
 * @param {number} meters The distance in meters.
 * @returns {number} The equivalent distance in E7 units.
 */
export function metersToE7(meters: number): number {
  const degrees = meters / APP_CONFIG.METERS_PER_DEGREE;
  return Math.round(degrees * 1e7);
}

/**
 * Calculates approximate distance in meters between two E7 coordinate pairs.
 * Uses a simple equirectangular projection for performance.
 * 
 * @param {number} latE7_1 Latitude of the first point in E7.
 * @param {number} lngE7_1 Longitude of the first point in E7.
 * @param {number} latE7_2 Latitude of the second point in E7.
 * @param {number} lngE7_2 Longitude of the second point in E7.
 * @returns {number} The approximate distance in meters.
 */
export function getDistanceE7(latE7_1: number, lngE7_1: number, latE7_2: number, lngE7_2: number): number {
  const dLat = (latE7_2 - latE7_1);
  const cosLat = Math.cos((latE7_1 / 1e7) * Math.PI / 180);
  const dLng = (lngE7_2 - lngE7_1) * cosLat;
  const distE7 = Math.sqrt(dLat * dLat + dLng * dLng);
  return (distE7 / 1e7) * APP_CONFIG.METERS_PER_DEGREE;
}

/**
 * Calculates pixels per meter at a given latitude and zoom level.
 * 
 * @param {number} lat The latitude in degrees.
 * @param {number} zoom The map zoom level.
 * @returns {number} The number of pixels per meter.
 */
export function getPixelsPerMeter(lat: number, zoom: number): number {
  const metersPerPixel = (Math.cos(lat * Math.PI / 180) * 2 * Math.PI * APP_CONFIG.EARTH_RADIUS_METERS) / (APP_CONFIG.TILE_SIZE * Math.pow(2, zoom));
  return 1 / metersPerPixel;
}

/**
 * Calculates the center of a list of coordinates.
 * 
 * @param {Node[] | Coordinates[]} coordinates Array of coordinates or nodes.
 * @returns {{ lat: number, lng: number }} The average latitude and longitude.
 */
export function calculateCenter(coordinates: Node[] | Coordinates[]): { lat: number, lng: number } {
  if (!coordinates || coordinates.length === 0) return { lat: 0, lng: 0 };
  
  let sumLat = 0;
  let sumLng = 0;
  coordinates.forEach(c => {
    sumLat += (c as any).lat;
    sumLng += (c as any).lng;
  });
  
  return {
    lat: sumLat / coordinates.length,
    lng: sumLng / coordinates.length
  };
  }

  /**
  * Capitalizes the first letter of a string. * 
 * @param {string} s The string to capitalize.
 * @returns {string} The capitalized string.
 */
export function capitalize(s: string): string {
  if (!s) return "";
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/**
 * Snaps an E7 coordinate to the grid based on the configured detail radius.
 * @param {number} val The E7 coordinate value.
 * @returns {number} The snapped E7 coordinate value.
 */
export function snap(val: number): number {
  const s = metersToE7(APP_CONFIG.DETAIL_RADIUS_METERS);
  return Math.round(val / s) * s;
}
