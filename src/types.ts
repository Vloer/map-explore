export interface LocationPoint {
  lat: number;
  lng: number;
  visits: number;
}

export interface DetailedLocationPoint {
  lat: number;
  lng: number;
  timestamp: number;
  visits: number;
}

export interface RegionStats {
  name: string;
  type: string;
  geojson: any;
  bounds: [number, number, number, number]; // [minLat, maxLat, minLng, maxLng]
}

export interface ImportOptions {
  includeRawSignals: boolean;
  includeSemanticSegments: boolean;
}

export interface TimelineData {
  rawSignals?: Array<{
    position?: {
      LatLng?: string;
      timestamp?: string;
    };
  }>;
  semanticSegments?: Array<{
    startTime?: string;
    endTime?: string;
    timelinePath?: Array<{
      point?: string;
      time?: string;
    }>;
    visit?: {
      topCandidate?: {
        placeLocation?: {
          latLng?: string;
        }
      }
    };
  }>;
}

export interface TooltipData {
  x: number;
  y: number;
  text: string;
}
