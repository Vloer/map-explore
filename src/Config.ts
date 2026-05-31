/**
 * Configuration for World Fog of War
 */
export const APP_CONFIG = {
  // Map settings
  MAP_INITIAL_CENTER: [5.2561, 51.3697] as [number, number],
  MAP_INITIAL_ZOOM: 14,
  MAP_MAX_ZOOM: 19,
  MAP_STYLE: 'https://a.tile.openstreetmap.org/{z}/{x}/{y}.png',

  // API Keys
  GEOAPIFY_API_KEY: import.meta.env.VITE_GEOAPIFY_API_KEY || '',

  // Geoapify Tile settings
  GEOAPIFY_TILE_SET: 'osm-bright',
  GEOAPIFY_TILE_ZOOM: 14,
  GEOAPIFY_ROADS_LAYER: 'transportation_name', // Has names and geometries in OpenMapTiles
  
  // Unlocking settings
  UNLOCK_GRID_SIZE_METERS: 30,
  UNLOCK_DISTANCE_THRESHOLD_METERS: 40,

  // Reveal radius settings (meters)
  BASE_FOG_REVEAL_RADIUS: 100,
  MAX_FOG_REVEAL_RADIUS: 150,
  MIN_FOG_REVEAL_RADIUS: 5,
  RADIUS_SLIDER_STEP: 5,

  // Snapping / Grid settings (meters)
  DETAIL_RADIUS_METERS: 5,
  IMPORT_DECIMATION_METERS: 5,

  // Heatmap settings
  HEATMAP_MAX_VISITS: 50,
  HEATMAP_STARTING_SENSITIVITY: 5,
  HEATMAP_RADIUS_MULTIPLIER: 1.5,
  HEATMAP_DETAIL_METERS: 0,
  HEATMAP_OPACITY: 0.35,
  HEATMAP_HUE_START: 120, // Green
  HEATMAP_HUE_END: 0,     // Red
  
  // Fog settings
  FOG_OPACITY: 0.75,
  FOG_COLOR: 'rgba(15, 15, 20, 0.75)',

  // Highlight settings
  HIGHLIGHT_REGION_COLOR: 'rgba(0, 229, 255, 1)',
  HIGHLIGHT_REGION_GLOW: 'rgba(0, 229, 255, 0.4)',
  HIGHLIGHT_STREET_COLOR: 'rgba(255, 255, 0, 1)',
  HIGHLIGHT_STREET_GLOW: 'rgba(255, 255, 0, 0.4)',
  HIGHLIGHT_LINE_WIDTH_STREET: 6,
  HIGHLIGHT_LINE_WIDTH_REGION: 4,
  HIGHLIGHT_SHADOW_BLUR: 10,

  // Rendering settings
  RENDER_BUFFER_RATIO: 0.1,
  MIN_PIXEL_DIST_SQ: 4,

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
  
  // Cache settings
  STREETS_CACHE_TTL_MS: 30 * 24 * 60 * 60 * 1000, // 30 days

  // Constants
  METERS_PER_DEGREE: 111111,
  EARTH_RADIUS_METERS: 6378137,
  TILE_SIZE: 256,
  SQLITE_PAGE_SIZE: 4096,
  NEAREST_QUERY_LIMIT: 200,
  MIN_GRID_SHOW_ZOOM: 16,
};

export const PLACE_TYPES: { [key: string]: number } = {
  river: 99,
  water: 99,
  industrial: 99,
  railway: 99,
  building: 99,
  road: 99,
  man_made: 99,
  country: 9,
  state: 8,
  region: 7,
  province: 6,
  county: 5,
  municipality: 4,
  city: 3,
  town: 2,
  village: 1,
};
