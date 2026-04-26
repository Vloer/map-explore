export interface PlaceFromPoint {
  name: string;
  place_type: string;
}

export interface Coordinates {
  lat: number;
  lng: number;
}

export interface BoundingBox {
  south: number;
  north: number;
  west: number;
  east: number;
  toString?: () => string;
}

export interface Node {
  id: number;
  lat: number;
  lng: number;
}

export interface StreetSegment {
  id: number;
  name: string;
  place: string;
  street_type: string;
  nodes: number[];
  coordinates: Node[];
}

export interface Street {
  name: string;
  place: string;
  street_type: string;
  segments: StreetSegment[];
  visited: boolean;
  coordinates: Node[];
  osm_id?: number; // Added to support unique identification from tiles
}

export interface TileXYZ {
  x: number;
  y: number;
  z: number;
}

export interface PlaceGeoData {
  name: string;
  display_name: string;
  lat: number;
  lng: number;
  place_type: string;
  bounding_box: BoundingBox;
  bounding_polygon: number[][];
  streets: Street[];
}

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
  osmId?: number;
  osmType?: string;
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
