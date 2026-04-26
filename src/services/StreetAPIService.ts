import type {
  Street,
  PlaceGeoData,
} from "../types";
import { Logger } from "../Util";
import { geoapifyService } from "./GeoapifyService";
import { databaseService } from "./DatabaseService";

/**
 * Service for fetching street data from Geoapify (Global).
 */
export class StreetAPIService {
  constructor() {}

  /**
   * Fetches streets for a given place using Geoapify and checks visited status.
   * @param {PlaceGeoData} placeData The place geo data including bounding box/polygon.
   * @returns {Promise<Street[]>} Array of Street objects.
   */
  async getStreetsForPlace(
    placeData: PlaceGeoData
  ): Promise<Street[]> {
    console.info(`StreetAPIService: Fetching streets for: ${placeData.name}`);
    
    // 1. Fetch from Geoapify (Vector Tiles)
    const streets = await geoapifyService.getStreetsForBBox(placeData.bounding_box, placeData.name);

    // 2. Update Database Grid Index for these streets (if not already there)
    Logger.start("update_grid_index");
    await databaseService.updateStreetGridIndex(streets);
    Logger.end("update_grid_index", `Indexed ${streets.length} streets`);

    // 3. Check which streets are visited using the grid-based spatial join
    Logger.start("check_visited_streets");
    const visitedSet = await databaseService.checkVisitedStreets();
    Logger.end("check_visited_streets", `Found ${visitedSet.size} visited streets`);

    // 4. Update visited status on the street objects
    for (const street of streets) {
      if (visitedSet.has(`${street.name}|${street.place}`)) {
        street.visited = true;
      }
    }

    return streets;
  }
}
