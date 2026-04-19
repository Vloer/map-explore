import type {
  Street,
  StreetSegment,
} from "../types";
import * as turf from "@turf/turf";

export interface ProgressReport {
  processed: number;
  total: number;
  message: string;
}

export class StreetGeoService {
  public async filterStreetsInPolygon(
    streets: Street[],
    boundingPolygon: number[][],
    reportProgress?: (progress: ProgressReport) => void
  ): Promise<Street[]> {
    if (!boundingPolygon || boundingPolygon.length === 0) return streets;

    const closedPolygonCoords = this._ensurePolygonIsClosed(boundingPolygon);
    if (closedPolygonCoords.length < 4) return streets;

    const polygon = turf.polygon([closedPolygonCoords]);
    const filteredStreets: Street[] = [];

    const chunkSize = this._setChunkSize(streets.length);
    for (let i = 0; i < streets.length; i += chunkSize) {
      const chunk = streets.slice(i, i + chunkSize);
      for (const street of chunk) {
        // PDOK streets might not have segments array populated but have coordinates
        const segmentsToProcess = (street.segments && street.segments.length > 0) 
          ? street.segments 
          : [{ coordinates: street.coordinates } as StreetSegment];

        const segmentsInPolygon: StreetSegment[] = [];
        for (const segment of segmentsToProcess) {
          if (!segment.coordinates || segment.coordinates.length === 0) continue;
          
          if (segment.coordinates.length === 1) {
            // Point-in-polygon check for PDOK / single-node results
            const point = turf.point([segment.coordinates[0].lng, segment.coordinates[0].lat]);
            if (turf.booleanPointInPolygon(point, polygon)) {
              segmentsInPolygon.push(segment);
            }
          } else {
            // Line-in-polygon check for standard OSM results
            const lineCoords = segment.coordinates.map((node) => [node.lng, node.lat]);
            const streetLine = turf.lineString(lineCoords);
            if (turf.booleanIntersects(streetLine, polygon) || turf.booleanWithin(streetLine, polygon)) {
              segmentsInPolygon.push(segment);
            }
          }
        }

        if (segmentsInPolygon.length > 0) {
          filteredStreets.push({
            ...street,
            segments: segmentsInPolygon,
            coordinates: segmentsInPolygon.flatMap((seg) => seg.coordinates),
          });
        }
      }
      if (reportProgress) {
        reportProgress({
          processed: Math.min(i + chunkSize, streets.length),
          total: streets.length,
          message: `Processing streets... (${Math.min(i + chunkSize, streets.length)}/${streets.length})`,
        });
      }
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
    return filteredStreets;
  }

  private _ensurePolygonIsClosed(polygon: number[][]): number[][] {
    const coords = polygon.map((c) => [c[0], c[1]]);
    if (coords.length > 0) {
      const first = coords[0];
      const last = coords[coords.length - 1];
      if (first[0] !== last[0] || first[1] !== last[1]) coords.push(first);
    }
    return coords;
  }

  private _setChunkSize(amount: number): number {
    if (amount < 200) return 10;
    if (amount < 1000) return 50;
    if (amount < 5000) return 200;
    return 500;
  }
}
