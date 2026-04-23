import type {
  Street,
} from "../types";
import { Logger } from "../Util";

const PDOK_LOCATIESERVER_URL = "https://api.pdok.nl/bzk/locatieserver/search/v3_1/free";

/**
 * Service for fetching street data from PDOK API (Netherlands only).
 */
export class StreetAPIService {
  constructor() {}

  /**
   * Helper to yield control to the main thread during heavy processing.
   * @private
   */
  private async _yield() {
    return new Promise(resolve => setTimeout(resolve, 0));
  }

  /**
   * Fetches streets from PDOK Locatieserver (high performance for NL).
   * @param {string} placeName The name of the city or municipality.
   * @param {string} [placeType] Optional type (e.g., 'municipality').
   * @returns {Promise<Street[]>} Array of Street objects.
   */
  async getStreetsInNL(placeName: string, placeType?: string): Promise<Street[]> {
    console.info(`Fetching streets from PDOK for: ${placeName}`);
    Logger.start("pdok_fetch_and_process");
    
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
    const rows = 100;
    
    while (start < totalStreetsFound) {
      const url = `${PDOK_LOCATIESERVER_URL}?${params.toString()}&start=${start}`;
      const response = await fetch(url);
      const data = await response.json();

      totalStreetsFound = data.response.numFound;
      allStreets.push(...data.response.docs);
      start += rows;
      console.log(`APIService: Fetched ${allStreets.length} of ${totalStreetsFound} streets...`);
      await this._yield();
    }

    const streets: Street[] = [];
    const CHUNK_SIZE = 500;
    
    for (let i = 0; i < allStreets.length; i += CHUNK_SIZE) {
      const chunk = allStreets.slice(i, i + CHUNK_SIZE);
      for (const doc of chunk) {
        const match = doc.centroide_ll.match(/POINT\(([\d.]+) ([\d.]+)\)/);
        const lng = match ? parseFloat(match[1]) : 0;
        const lat = match ? parseFloat(match[2]) : 0;
        const name = doc.weergavenaam.split(',')[0];

        streets.push({
          name,
          place: placeName,
          street_type: 'road',
          segments: [],
          visited: false,
          coordinates: [{ id: 0, lat, lng }]
        });
      }
      if (allStreets.length > CHUNK_SIZE) await this._yield();
    }

    streets.sort((a, b) => a.name.localeCompare(b.name));
    Logger.end("pdok_fetch_and_process", `Fetched ${streets.length} streets from PDOK`);
    return streets;
  }

  /**
   * Fetches streets for a given place.
   * @param {string} placeName The name of the place.
   * @param {string} [placeType] Optional place type.
   * @returns {Promise<Street[]>} Array of Street objects.
   */
  async getStreetsForPlace(
    placeName: string,
    placeType?: string
  ): Promise<Street[]> {
    return await this.getStreetsInNL(placeName, placeType);
  }
}
