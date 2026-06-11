import maplibregl from 'maplibre-gl';
import { DatabaseService } from './services/DatabaseService';
import { APP_CONFIG } from './Config';
import { getPixelsPerMeter } from './Util';
import type { LocationPoint } from './types';

/**
 * Manages the heatmap canvas overlay on the map.
 * This layer renders a heatmap showing the frequency of visits to different locations.
 */
export class HeatmapLayer {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private map: maplibregl.Map;
  private db: DatabaseService;
  private resizeObserver: ResizeObserver;
  private points: LocationPoint[] = [];
  private isDrawing = false;
  private enabled = false;
  private detailMeters = APP_CONFIG.HEATMAP_DETAIL_METERS;
  
  /** The radius in meters for each heatmap point. */
  public meterRadius: number = APP_CONFIG.BASE_FOG_REVEAL_RADIUS;
  /** The maximum number of visits to scale the heatmap colors. */
  public maxVisits: number = APP_CONFIG.HEATMAP_MAX_VISITS;
  /** Minimum speed filter in km/h. */
  public minSpeed: number | undefined = undefined;
  /** Maximum speed filter in km/h. */
  public maxSpeed: number | undefined = undefined;

  /**
   * Creates an instance of HeatmapLayer.
   * @param {maplibregl.Map} map The MapLibre map instance.
   * @param {DatabaseService} db The database service for retrieving location points.
   */
  constructor(map: maplibregl.Map, db: DatabaseService) {
    this.map = map;
    this.db = db;

    this.canvas = document.createElement('canvas');
    Object.assign(this.canvas.style, {
      position: 'absolute',
      top: '0',
      left: '0',
      pointerEvents: 'none',
      zIndex: '2'
    });
    
    const container = map.getContainer();
    container.appendChild(this.canvas);

    const ctx = this.canvas.getContext('2d', { alpha: true });
    if (!ctx) throw new Error('Could not get heatmap canvas context');
    this.ctx = ctx;

    this.resizeCanvas();

    this.map.on('move', () => this.scheduleDraw());
    this.map.on('moveend', () => this.refreshData());
    this.map.on('zoomend', () => this.refreshData());
    this.map.on('viewreset', () => this.refreshData());

    this.resizeObserver = new ResizeObserver(() => {
      this.resizeCanvas();
      this.refreshData();
    });
    this.resizeObserver.observe(container);
  }

  /**
   * Resizes the canvas to match the map container size and handles High DPI screens.
   * @private
   */
  private resizeCanvas() {
    const container = this.map.getContainer();
    const rect = container.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    
    this.canvas.width = rect.width * dpr;
    this.canvas.height = rect.height * dpr;
    this.canvas.style.width = `${rect.width}px`;
    this.canvas.style.height = `${rect.height}px`;
    
    this.ctx.scale(dpr, dpr);
  }

  /**
   * Enables or disables the heatmap layer.
   * @param {boolean} enabled Whether the heatmap should be enabled.
   */
  public setEnabled(enabled: boolean) {
    this.enabled = enabled;
    this.canvas.style.display = enabled ? 'block' : 'none';
    if (enabled) this.refreshData();
  }

  /**
   * Refreshes the location points from the database based on the current map view.
   * @returns {Promise<void>}
   */
  public async refreshData() {
    if (!this.enabled) return;
    const start = performance.now();
    const bounds = this.map.getBounds();
    const zoom = this.map.getZoom();
    const center = this.map.getCenter();
    
    const pixelsPerMeter = getPixelsPerMeter(center.lat, zoom);
    this.detailMeters = 2 / pixelsPerMeter;

    const buffer = APP_CONFIG.RENDER_BUFFER_RATIO; 
    const latBuffer = (bounds.getNorth() - bounds.getSouth()) * buffer;
    const lngBuffer = (bounds.getEast() - bounds.getWest()) * buffer;

    this.points = await this.db.getPointsInBounds(
      bounds.getSouth() - latBuffer,
      bounds.getNorth() + latBuffer,
      bounds.getWest() - lngBuffer,
      bounds.getEast() + lngBuffer,
      this.detailMeters,
      this.minSpeed,
      this.maxSpeed
    );
    
    console.debug(`HeatmapLayer: Refreshed data. Points: ${this.points.length} (${(performance.now() - start).toFixed(2)}ms)`);
    this.scheduleDraw();
  }

  /**
   * Schedules a redraw of the canvas on the next animation frame.
   * @private
   */
  private scheduleDraw() {
    if (!this.enabled || this.isDrawing) return;
    this.isDrawing = true;
    requestAnimationFrame(() => {
      this.draw();
      this.isDrawing = false;
    });
  }

  /**
   * Calculates the hue based on the number of visits.
   * @param {number} visits The number of visits to a location.
   * @returns {number} The calculated hue value.
   * @private
   */
  private getHue(visits: number): number {
    const effectiveVisits = Math.max(0, visits - 2);
    const effectiveMax = Math.max(1, this.maxVisits - 2);
    const ratio = Math.min(effectiveVisits / effectiveMax, 1);
    
    const hueRange = APP_CONFIG.HEATMAP_HUE_START - APP_CONFIG.HEATMAP_HUE_END;
    return APP_CONFIG.HEATMAP_HUE_START - (ratio * hueRange);
  }

  /**
   * Performs the actual drawing of the heatmap on the canvas.
   */
  public draw() {
    if (!this.enabled) return;
    const start = performance.now();
    const { width, height } = this.canvas.getBoundingClientRect();
    this.ctx.clearRect(0, 0, width, height);

    const zoom = this.map.getZoom();
    const center = this.map.getCenter();
    const pixelsPerMeter = getPixelsPerMeter(center.lat, zoom);
    
    // Constant base radius in meters, but we ensure it doesn't get too small in pixels
    const baseRadiusMeters = this.meterRadius * APP_CONFIG.HEATMAP_RADIUS_MULTIPLIER;
    const radius = Math.max(15, baseRadiusMeters * pixelsPerMeter);

    this.ctx.globalAlpha = APP_CONFIG.HEATMAP_OPACITY;
    this.ctx.globalCompositeOperation = 'screen';

    let drawnCount = 0;
    for (const p of this.points) {
      if (p.visits < 2) continue;

      const pos = this.map.project([p.lng, p.lat]);
      if (pos.x < -radius || pos.x > width + radius || pos.y < -radius || pos.y > height + radius) {
        continue;
      }

      const hue = this.getHue(p.visits);
      
      // Calculate intensity based on visits ratio
      const effectiveVisits = Math.max(0, p.visits - 2);
      const effectiveMax = Math.max(1, this.maxVisits - 2);
      const intensity = 0.3 + (Math.min(effectiveVisits / effectiveMax, 1) * 0.7);

      const gradient = this.ctx.createRadialGradient(pos.x, pos.y, 0, pos.x, pos.y, radius);
      
      // Use HSLA with the calculated intensity for consistent scaling
      gradient.addColorStop(0, `hsla(${hue}, 100%, 50%, ${intensity})`);
      gradient.addColorStop(0.5, `hsla(${hue}, 100%, 50%, ${intensity * 0.4})`);
      gradient.addColorStop(1, `hsla(${hue}, 100%, 50%, 0)`);

      this.ctx.fillStyle = gradient;
      this.ctx.fillRect(pos.x - radius, pos.y - radius, radius * 2, radius * 2);
      drawnCount++;
    }

    this.ctx.globalAlpha = 1.0;
    this.ctx.globalCompositeOperation = 'source-over';
    console.debug(`HeatmapLayer: Draw complete. Points: ${drawnCount}/${this.points.length} (${(performance.now() - start).toFixed(2)}ms)`);
  }

  /**
   * Cleans up resources used by the HeatmapLayer.
   */
  public destroy() {
    this.resizeObserver.disconnect();
    this.canvas.remove();
  }
}

