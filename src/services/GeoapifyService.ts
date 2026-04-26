import { VectorTile } from '@mapbox/vector-tile';
import Pbf from 'pbf';
import { APP_CONFIG } from '../Config';
import type { Street, StreetSegment, Node, BoundingBox, TileXYZ } from '../types';
import { Logger } from '../Util';

/**
 * Service for interacting with Geoapify Vector Tiles.
 */
export class GeoapifyService {
  private apiKey: string;

  constructor(apiKey: string = APP_CONFIG.GEOAPIFY_API_KEY) {
    this.apiKey = apiKey;
  }

  /**
   * Fetches and parses street data for a bounding box.
   * @param {BoundingBox} bbox The bounding box to fetch.
   * @param {string} placeName The name of the place for metadata.
   * @returns {Promise<Street[]>}
   */
  async getStreetsForBBox(bbox: BoundingBox, placeName: string): Promise<Street[]> {
    const tiles = this._getTilesInBBox(bbox, APP_CONFIG.GEOAPIFY_TILE_ZOOM);
    console.info(`GeoapifyService: Fetching ${tiles.length} tiles for ${placeName} at zoom ${APP_CONFIG.GEOAPIFY_TILE_ZOOM}`);
    Logger.start("geoapify_tiles_fetch_total");

    const streetMap = new Map<string, Street>();

    // Fetch tiles in parallel with a limit or sequentially if needed.
    // For now, let's do them in chunks to avoid overwhelming the network.
    const CHUNK_SIZE = 10;
    for (let i = 0; i < tiles.length; i += CHUNK_SIZE) {
      const chunk = tiles.slice(i, i + CHUNK_SIZE);
      console.debug(`GeoapifyService: Processing chunk ${Math.floor(i/CHUNK_SIZE) + 1} of ${Math.ceil(tiles.length/CHUNK_SIZE)}`);
      const results = await Promise.all(chunk.map(tile => this._fetchAndParseTile(tile, placeName)));
      
      for (const streets of results) {
        for (const street of streets) {
          if (streetMap.has(street.name)) {
            const existing = streetMap.get(street.name)!;
            // De-duplicate segments by ID to handle features appearing in multiple tiles (buffer)
            for (const newSeg of street.segments) {
              if (!existing.segments.some(s => s.id === newSeg.id)) {
                existing.segments.push(newSeg);
                existing.coordinates.push(...newSeg.coordinates);
              }
            }
          } else {
            streetMap.set(street.name, street);
          }
        }
      }
    }

    Logger.end("geoapify_tiles_fetch_total", `Total: ${streetMap.size} unique streets from ${tiles.length} tiles`);
    return Array.from(streetMap.values());
  }

  /**
   * Calculates which tiles are needed to cover a bounding box.
   * @private
   */
  private _getTilesInBBox(bbox: BoundingBox, z: number): TileXYZ[] {
    const minX = this._lon2tile(bbox.west, z);
    const maxX = this._lon2tile(bbox.east, z);
    const minY = this._lat2tile(bbox.north, z);
    const maxY = this._lat2tile(bbox.south, z);

    const tiles: TileXYZ[] = [];
    for (let x = minX; x <= maxX; x++) {
      for (let y = minY; y <= maxY; y++) {
        tiles.push({ x, y, z });
      }
    }
    return tiles;
  }

  /**
   * Fetches a single tile and parses its road layer.
   * @private
   */
  private async _fetchAndParseTile(tile: TileXYZ, placeName: string): Promise<Street[]> {
    if (!this.apiKey || this.apiKey === 'YOUR_GEOAPIFY_API_KEY') {
      console.error("GeoapifyService: API Key is missing or default! Please set VITE_GEOAPIFY_API_KEY in .env");
      return [];
    }

    const url = `https://maps.geoapify.com/v1/tile/${APP_CONFIG.GEOAPIFY_TILE_SET}/${tile.z}/${tile.x}/${tile.y}.pbf?apiKey=${this.apiKey}`;
    
    try {
      const response = await fetch(url);
      if (!response.ok) {
        console.warn(`GeoapifyService: Failed to fetch tile ${tile.z}/${tile.x}/${tile.y} (Status: ${response.status})`);
        if (response.status === 401 || response.status === 403) {
          console.error("GeoapifyService: API Key unauthorized. Check your Geoapify dashboard.");
        }
        return [];
      }

      const buffer = await response.arrayBuffer();
      const vt = new VectorTile(new Pbf(buffer));
      
      // Log layers for the very first tile fetched to verify schema
      if (tile.x % 10 === 0 && tile.y % 10 === 0) {
        console.log(`GeoapifyService: Tile ${tile.z}/${tile.x}/${tile.y} has layers:`, Object.keys(vt.layers));
      }

      // Collect features from multiple potential road layers to get all segments
      const layerNames = [APP_CONFIG.GEOAPIFY_ROADS_LAYER, 'transportation', 'roads', 'road', 'transportation_name'];

      // 1. First pass: build a name map based on OSM IDs and feature IDs
      const nameMap = new Map<number | string, string>();
      const typeMap = new Map<number | string, string>();

      for (const layerName of layerNames) {
        const layer = vt.layers[layerName];
        if (!layer) continue;

        for (let i = 0; i < layer.length; i++) {
          const feature = layer.feature(i);
          const props = feature.properties;
          const name = props.name || props.name_en || props['name:en'] || props['name:nl'];
          const type = props.class || props.kind || props.highway;
          
          if (name) {
            if (feature.id !== undefined) nameMap.set(feature.id, String(name));
            if (props.osm_id !== undefined) nameMap.set(String(props.osm_id), String(name));
          }
          if (type) {
            if (feature.id !== undefined) typeMap.set(feature.id, String(type));
            if (props.osm_id !== undefined) typeMap.set(String(props.osm_id), String(type));
          }
        }
      }

      // 2. Second pass: Collect unique features and resolve names
      const uniqueFeatures = new Map<number | string, any>();
      for (const layerName of layerNames) {
        const layer = vt.layers[layerName];
        if (!layer) continue;

        for (let i = 0; i < layer.length; i++) {
          const feature = layer.feature(i);
          const props = feature.properties;
          const id = feature.id !== undefined ? feature.id : `${props.osm_id || i}`;
          
          // If we already have this ID, prefer the one from a 'name' layer or with more properties
          if (!uniqueFeatures.has(id) || (!uniqueFeatures.get(id).properties.name && props.name)) {
            uniqueFeatures.set(id, feature);
          }
        }
      }

      const streets: Street[] = [];
      for (const feature of uniqueFeatures.values()) {
        const props = feature.properties;
        
        // Resolve name: priority = direct name -> OSM ID name lookup -> Feature ID name lookup -> fallback
        let streetName = props.name || props.name_en || props['name:en'] || props['name:nl'];
        if (!streetName && props.osm_id !== undefined) streetName = nameMap.get(String(props.osm_id));
        if (!streetName && feature.id !== undefined) streetName = nameMap.get(feature.id);
        
        // DEBUG: If it's still unnamed, the property is valid but its not a street so we can continue.
        if (!streetName && Object.keys(props).length > 0) {
          console.debug(placeName, ": GeoapifyService: Unnamed feature properties found. Continuing:", props);
          continue;
        }

        // Resolve type similarly
        let streetType = props.class || props.kind || props.highway;
        if (!streetType && props.osm_id !== undefined) streetType = typeMap.get(String(props.osm_id));
        if (!streetType && feature.id !== undefined) streetType = typeMap.get(feature.id);
        streetType = streetType || 'road';
        
        const geometry = feature.loadGeometry();
        const segments: StreetSegment[] = [];
        const allCoords: Node[] = [];

        for (const ring of geometry) {
          const coords: Node[] = ring.map((pt: any, idx: any) => {
            const [lng, lat] = this._tileToLonLat(tile.x, tile.y, tile.z, pt.x, pt.y);
            return { id: idx, lat, lng };
          });

          if (coords.length > 0) {
            segments.push({
              id: (feature.id as number) || Math.floor(Math.random() * 1000000),
              name: String(streetName),
              place: placeName,
              street_type: String(streetType),
              nodes: [],
              coordinates: coords
            });
            allCoords.push(...coords);
          }
        }

        if (segments.length > 0) {
          streets.push({
            name: String(streetName),
            place: placeName,
            street_type: String(streetType),
            segments,
            visited: false,
            coordinates: allCoords,
            osm_id: feature.id as number
          });
        }
      }

      return streets;
    } catch (e) {
      console.error(`GeoapifyService: Error processing tile ${tile.z}/${tile.x}/${tile.y}`, e);
      return [];
    }
  }

  // Coordinate conversion helpers
  private _lon2tile(lon: number, zoom: number) {
    return Math.floor(((lon + 180) / 360) * Math.pow(2, zoom));
  }

  private _lat2tile(lat: number, zoom: number) {
    return Math.floor(
      ((1 - Math.log(Math.tan((lat * Math.PI) / 180) + 1 / Math.cos((lat * Math.PI) / 180)) / Math.PI) / 2) *
        Math.pow(2, zoom)
    );
  }

  private _tileToLonLat(x: number, y: number, z: number, px: number, py: number): [number, number] {
    const size = 4096; // Tile size in feature coordinates
    const lon = ((x + px / size) / Math.pow(2, z)) * 360 - 180;
    const n = Math.PI - (2 * Math.PI * (y + py / size)) / Math.pow(2, z);
    const lat = (180 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));
    return [lon, lat];
  }
}

export const geoapifyService = new GeoapifyService();
