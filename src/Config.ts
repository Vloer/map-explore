/**
 * Configuration for World Fog of War
 */
export const APP_CONFIG = {
  // The visual radius shown on the map (in meters)
  FOG_RADIUS_METERS: 25,

  // The snapping grid size (in meters).
  // Points closer than this will be aggregated into one database entry.
  // Ideally should be close to or slightly smaller than FOG_RADIUS_METERS.
  DETAIL_RADIUS_METERS: 20,
};
