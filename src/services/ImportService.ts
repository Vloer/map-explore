import { databaseService } from './DatabaseService';
import { APP_CONFIG } from '../Config';
import { getDistanceE7 } from '../Util';
import type { TimelineData } from '../types';
import type { SignalPoint } from './DatabaseService';

/**
 * Service for handling data imports into the system.
 * Processes external data formats (like Google Timeline) into standardized signal points.
 */
export class ImportService {
  /**
   * Parses a lat,lng string into E7 integers.
   * @param {string} s The "lat,lng" string.
   * @returns {{latE7: number, lngE7: number} | null}
   * @private
   */
  private parseLatLngToE7(s: string): {latE7: number, lngE7: number} | null {
    try {
      const parts = s.split(',');
      if (parts.length !== 2) return null;
      const lat = parseFloat(parts[0].replace(/[^\d.-]/g, ''));
      const lng = parseFloat(parts[1].replace(/[^\d.-]/g, ''));
      if (isNaN(lat) || isNaN(lng)) return null;
      return {
        latE7: Math.round(lat * 1e7),
        lngE7: Math.round(lng * 1e7)
      };
    } catch (e) {
      return null;
    }
  }

  /**
   * Imports Google Location History (Timeline) data into the database.
   * Processes the data, applies distance-based decimation, and delegates storage to DatabaseService.
   * @param {TimelineData} data The parsed timeline JSON data.
   * @returns {Promise<void>}
   */
  async importGoogleHistory(data: TimelineData) {
    console.log(`ImportService: Processing Google History import...`);
    
    const points: SignalPoint[] = [];

    // 1. Process Raw Signals
    if (data.rawSignals) {
      let lastLatE7 = 0;
      let lastLngE7 = 0;
      for (const signal of data.rawSignals) {
        if (signal.position?.LatLng && signal.position.timestamp) {
          const coords = this.parseLatLngToE7(signal.position.LatLng);
          if (coords) {
            if (getDistanceE7(lastLatE7, lastLngE7, coords.latE7, coords.lngE7) > APP_CONFIG.IMPORT_DECIMATION_METERS) {
              points.push({
                latE7: coords.latE7,
                lngE7: coords.lngE7,
                timestamp: new Date(signal.position.timestamp).getTime()
              });
              lastLatE7 = coords.latE7;
              lastLngE7 = coords.lngE7;
            }
          }
        }
      }
    }

    // 2. Process Semantic Segments
    if (data.semanticSegments) {
      let lastLatE7 = 0;
      let lastLngE7 = 0;
      for (const segment of data.semanticSegments) {
        // Timeline Path Points
        if (segment.timelinePath) {
          for (const tp of segment.timelinePath) {
            if (tp.point && tp.time) {
              const coords = this.parseLatLngToE7(tp.point);
              if (coords) {
                if (getDistanceE7(lastLatE7, lastLngE7, coords.latE7, coords.lngE7) > APP_CONFIG.IMPORT_DECIMATION_METERS) {
                  points.push({ 
                    latE7: coords.latE7, 
                    lngE7: coords.lngE7, 
                    timestamp: new Date(tp.time).getTime() 
                  });
                  lastLatE7 = coords.latE7;
                  lastLngE7 = coords.lngE7;
                }
              }
            }
          }
        }
        
        // Visit Location
        const visitLoc = segment.visit?.topCandidate?.placeLocation?.latLng;
        if (visitLoc && segment.startTime) {
          const coords = this.parseLatLngToE7(visitLoc);
          if (coords) {
            if (getDistanceE7(lastLatE7, lastLngE7, coords.latE7, coords.lngE7) > APP_CONFIG.IMPORT_DECIMATION_METERS) {
              points.push({ 
                latE7: coords.latE7, 
                lngE7: coords.lngE7, 
                timestamp: new Date(segment.startTime).getTime() 
              });
              lastLatE7 = coords.latE7;
              lastLngE7 = coords.lngE7;
            }
          }
        }
      }
    }

    if (points.length === 0) {
      console.warn("ImportService: No valid points found for import.");
      return;
    }

    // 3. Delegate writing to DatabaseService
    await databaseService.bulkInsertSignals(points);
  }

  /**
   * Imports data from a GPX file into the database.
   * Parses the XML, applies decimation, and delegates storage to DatabaseService.
   * @param {string} xmlString The raw XML content of the GPX file.
   * @returns {Promise<void>}
   */
  async importGpx(xmlString: string) {
    console.log(`ImportService: Processing GPX import...`);
    
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(xmlString, "text/xml");
    const trackPoints = xmlDoc.getElementsByTagName("trkpt");
    
    const points: SignalPoint[] = [];
    let lastLatE7 = 0;
    let lastLngE7 = 0;

    for (let i = 0; i < trackPoints.length; i++) {
      const pt = trackPoints[i];
      const latAttr = pt.getAttribute("lat");
      const lonAttr = pt.getAttribute("lon");
      const timeEl = pt.getElementsByTagName("time")[0];

      if (latAttr && lonAttr && timeEl) {
        const lat = parseFloat(latAttr);
        const lng = parseFloat(lonAttr);
        // Date parsing is sensitive, but GPX standard is ISO 8601
        const timestamp = new Date(timeEl.textContent || "").getTime();

        if (isNaN(timestamp)) continue;

        const latE7 = Math.round(lat * 1e7);
        const lngE7 = Math.round(lng * 1e7);

        if (getDistanceE7(lastLatE7, lastLngE7, latE7, lngE7) > APP_CONFIG.IMPORT_DECIMATION_METERS) {
          points.push({ latE7, lngE7, timestamp });
          lastLatE7 = latE7;
          lastLngE7 = lngE7;
        }
      }
    }

    if (points.length === 0) {
      console.warn("ImportService: No valid points found in GPX.");
      return;
    }

    // Delegate writing to DatabaseService
    await databaseService.bulkInsertSignals(points);
  }
}

export const importService = new ImportService();
