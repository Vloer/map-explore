import type {
  BoundingBox,
  Node,
  Street,
  StreetSegment,
} from "../types";
import { bboxToString } from "../Util";

const OVERPASS_URL = "https://overpass-api.de/api/interpreter";
const PDOK_LOCATIESERVER_URL = "https://api.pdok.nl/bzk/locatieserver/search/v3_1/free";
const APP_USER_AGENT = "MapExplorer/1.0 (https://github.com/boris/mapexplorer)";

export const STREET_TYPES_TO_IGNORE = [
  "bus_stop",
  "elevator",
  "platform",
  "corridor",
  "proposed",
  "raceway",
  "construction",
  "footway",
  "cycleway",
  "path",
  "pedestrian",
];

/**
 * Service for fetching street data from external APIs (Overpass and PDOK).
 */
export class StreetAPIService {
  constructor() {}

  /**
   * Prepares a bounding box string for Overpass API.
   * @param {BoundingBox} bbox The bounding box object.
   * @returns {string} Comma-separated bounding box string.
   * @private
   */
  private _prepareBboxString(bbox: BoundingBox): string {
    let potentialResult: string | undefined;
    if (bbox.toString && typeof bbox.toString === "function") {
      potentialResult = bbox.toString();
    }
    const bboxStr =
      potentialResult !== undefined && potentialResult !== "[object Object]"
        ? potentialResult
        : bboxToString(bbox);
    return bboxStr;
  }

  /**
   * Builds an Overpass QL query for highways in a bounding box.
   * @param {string} bboxString The bounding box string.
   * @returns {string} The Overpass QL query.
   * @private
   */
  private _buildOverpassQuery(bboxString: string): string {
    return `
[out:json][timeout:90];
(
  way["highway"](${bboxString});
);
out center;
    `.trim();
  }

  /**
   * Fetches data from the Overpass API.
   * @param {string} query The Overpass QL query.
   * @returns {Promise<any>} The JSON response from Overpass.
   * @private
   */
  private async _fetchOverpassData(query: string): Promise<any> {
    const formBody = new URLSearchParams();
    formBody.append("data", query);

    const response = await fetch(OVERPASS_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "User-Agent": APP_USER_AGENT,
      },
      body: formBody.toString(),
    });

    if (!response.ok) {
      throw new Error(`Overpass API request failed with status ${response.status}`);
    }

    return await response.json();
  }

  /**
   * Parses the raw JSON response from Overpass into nodes and segments.
   * @param {any} data Raw Overpass response.
   * @param {string} placeName Name of the place (city/region).
   * @returns {{ nodes: { [id: number]: Node }; segments: StreetSegment[] }}
   * @private
   */
  private _parseOverpassResponse(
    data: any,
    placeName: string
  ): { nodes: { [id: number]: Node }; segments: StreetSegment[] } {
    const nodes: { [id: number]: Node } = {};
    const segments: StreetSegment[] = [];

    if (!data || !Array.isArray(data.elements)) {
      return { nodes, segments };
    }

    for (const element of data.elements) {
      if (element.type === "node") {
        nodes[element.id] = {
          id: element.id,
          lat: element.lat,
          lng: element.lon,
        };
      }
    }

    for (const element of data.elements) {
      if (element.type === "way" && element.tags?.name) {
        const streetType = element.tags.highway || "road";
        const coordinates: Node[] = [];

        // Try using center if available (from 'out center')
        if (element.center) {
          coordinates.push({
            id: element.id,
            lat: element.center.lat,
            lng: element.center.lon,
          });
        } else if (Array.isArray(element.nodes)) {
          for (const nodeId of element.nodes) {
            if (nodes[nodeId]) {
              coordinates.push(nodes[nodeId]);
            }
          }
        }

        if (coordinates.length > 0 && !STREET_TYPES_TO_IGNORE.includes(streetType)) {
          segments.push({
            id: element.id,
            name: element.tags.name,
            place: placeName.toLowerCase(),
            street_type: streetType,
            nodes: element.nodes || [],
            coordinates,
          });
        }
      }
    }
    return { nodes, segments };
  }

  /**
   * Groups street segments by name into Street objects.
   * @param {StreetSegment[]} segments Array of street segments.
   * @returns {Street[]} Array of consolidated Street objects.
   * @private
   */
  private _groupSegmentsIntoStreets(segments: StreetSegment[]): Street[] {
    const streetByName: { [name: string]: Street } = {};

    for (const segment of segments) {
      const name = segment.name;

      if (!streetByName[name]) {
        streetByName[name] = {
          name,
          place: segment.place,
          street_type: segment.street_type,
          segments: [segment],
          visited: false,
          coordinates: [...segment.coordinates],
        };
      } else {
        streetByName[name].segments.push(segment);
        streetByName[name].coordinates.push(...segment.coordinates);
      }
    }

    const uniqueStreets = Object.values(streetByName);
    uniqueStreets.sort((a, b) => a.name.localeCompare(b.name));

    return uniqueStreets;
  }

  /**
   * Fetches streets from PDOK Locatieserver (high performance for NL).
   * @param {string} placeName The name of the city or municipality.
   * @param {string} [placeType] Optional type (e.g., 'municipality').
   * @returns {Promise<Street[]>} Array of Street objects.
   */
  async getStreetsInNL(placeName: string, placeType?: string): Promise<Street[]> {
    console.info(`Fetching streets from PDOK for: ${placeName}`);
    
    // We try to match by woonplaats (city) or gemeente (municipality)
    const field = (placeType === 'municipality') ? 'gemeentenaam' : 'woonplaatsnaam';
    const query = `type:weg AND ${field}:"${placeName}"`;
    
    const params = new URLSearchParams({
      q: query,
      rows: "100",
      fl: "weergavenaam,centroide_ll"
    });

    let start = 0;
    let totalStreetsFound = Infinity;
    let allStreets: any[] = [];
    const rows = 100; // limit set by PDOK
    while (start < totalStreetsFound) {
      const url = `${PDOK_LOCATIESERVER_URL}?${params.toString()}&start=${start}`;
      const response = await fetch(url);
      const data = await response.json();

      totalStreetsFound = data.response.numFound;
      allStreets.push(...data.response.docs);
      start += rows;
      console.log(`APIService: Fetched ${allStreets.length} of ${totalStreetsFound} streets...`);
    }

    const streets: Street[] = allStreets.map((doc: any) => {
      const match = doc.centroide_ll.match(/POINT\(([\d.]+) ([\d.]+)\)/);
      const lng = match ? parseFloat(match[1]) : 0;
      const lat = match ? parseFloat(match[2]) : 0;
      
      // PDOK weergavenaam is usually "Streetname, City"
      const name = doc.weergavenaam.split(',')[0];

      return {
        name,
        place: placeName,
        street_type: 'road',
        segments: [],
        visited: false,
        coordinates: [{ id: 0, lat, lng }]
      };
    });

    return streets.sort((a, b) => a.name.localeCompare(b.name));
  }

  /**
   * Fetches streets within a bounding box, attempting PDOK first for NL.
   * @param {string} placeName The name of the place.
   * @param {BoundingBox} bbox The bounding box.
   * @param {string} [placeType] Optional place type.
   * @returns {Promise<Street[]>} Array of Street objects.
   */
  async getStreetsInBoundingBox(
    placeName: string,
    bbox: BoundingBox,
    placeType?: string
  ): Promise<Street[]> {
    // For NL, PDOK is vastly superior. We'll try it first.
    try {
      const streets = await this.getStreetsInNL(placeName, placeType);
      if (streets.length > 0) return streets;
    } catch (e) {
      console.warn("PDOK fetch failed, falling back to Overpass", e);
    }

    // Fallback or non-NL: Optimized Overpass query
    const bboxString = this._prepareBboxString(bbox);
    const query = this._buildOverpassQuery(bboxString);
    const rawData = await this._fetchOverpassData(query);
    const { segments } = this._parseOverpassResponse(rawData, placeName);
    return this._groupSegmentsIntoStreets(segments);
  }
}

