/**
 * Configuration for World Fog of War
 */
export const APP_CONFIG = {
  // Map settings
  MAP_INITIAL_CENTER: [5.2561, 51.3697] as [number, number],
  MAP_INITIAL_ZOOM: 14,
  MAP_MAX_ZOOM: 19,
  MAP_STYLE: 'https://a.tile.openstreetmap.org/{z}/{x}/{y}.png',

  // Reveal radius settings (meters)
  BASE_FOG_REVEAL_RADIUS: 25,
  MAX_FOG_REVEAL_RADIUS: 150,
  MIN_FOG_REVEAL_RADIUS: 5,
  RADIUS_SLIDER_STEP: 5,

  // Snapping / Grid settings (meters)
  DETAIL_RADIUS_METERS: 20,

  // Heatmap settings
  HEATMAP_MAX_VISITS: 50,
  HEATMAP_RADIUS_MULTIPLIER: 1.5,
  HEATMAP_OPACITY: 0.45,
  
  // Fog settings
  FOG_OPACITY: 0.75,
  FOG_COLOR: 'rgba(15, 15, 20, 0.75)',

  // Interaction settings
  HOVER_RADIUS_DEGREES: 0.0002,
  TOOLTIP_OFFSET: 15,

  // Exploration settings
  EXPLORATION_LEVELS: {
    COUNTRY: { minZoom: 0, maxZoom: 5, layer: 'admin-0' },
    COUNTY: { minZoom: 5, maxZoom: 9, layer: 'admin-1' },
    CITY: { minZoom: 9, maxZoom: 12, layer: 'place-city' },
    VILLAGE: { minZoom: 12, maxZoom: 20, layer: 'place-village' },
  },
  
  // Approximate areas in sq meters (fallback or reference)
  // For a truly accurate calculation, we'd need a polygon-area service.
  // We'll estimate % based on visible features for now.

  // Constants
  METERS_PER_DEGREE: 111111,
  EARTH_RADIUS_METERS: 6378137,
  TILE_SIZE: 256,
  SQLITE_PAGE_SIZE: 8192,
  NEAREST_QUERY_LIMIT: 200,
};
