import maplibregl from 'maplibre-gl';
import { DatabaseService } from './DatabaseService';
import { APP_CONFIG } from './Config';
import type { LocationPoint } from './types';

export class HeatmapLayer {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private map: maplibregl.Map;
  private db: DatabaseService;
  private resizeObserver: ResizeObserver;
  private points: LocationPoint[] = [];
  private isDrawing = false;
  private enabled = false;
  
  public meterRadius: number = APP_CONFIG.BASE_FOG_REVEAL_RADIUS;
  public maxVisits: number = APP_CONFIG.HEATMAP_MAX_VISITS; 

  constructor(map: maplibregl.Map, db: DatabaseService) {
    this.map = map;
    this.db = db;

    this.canvas = document.createElement('canvas');
    this.canvas.style.position = 'absolute';
    this.canvas.style.top = '0';
    this.canvas.style.left = '0';
    this.canvas.style.pointerEvents = 'none';
    this.canvas.style.zIndex = '2'; 
    this.canvas.style.display = 'none';
    
    const container = map.getContainer();
    container.appendChild(this.canvas);

    const ctx = this.canvas.getContext('2d', { alpha: true });
    if (!ctx) throw new Error('Could not get canvas context');
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

  public setEnabled(enabled: boolean) {
    this.enabled = enabled;
    this.canvas.style.display = enabled ? 'block' : 'none';
    if (enabled) {
      this.refreshData();
    }
  }

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

  public async refreshData() {
    if (!this.enabled) return;
    const bounds = this.map.getBounds();
    const buffer = 0.1; 
    const latBuffer = (bounds.getNorth() - bounds.getSouth()) * buffer;
    const lngBuffer = (bounds.getEast() - bounds.getWest()) * buffer;

    this.points = await this.db.getPointsInBounds(
      bounds.getSouth() - latBuffer,
      bounds.getNorth() + latBuffer,
      bounds.getWest() - lngBuffer,
      bounds.getEast() + lngBuffer
    );
    
    this.scheduleDraw();
  }

  private scheduleDraw() {
    if (!this.enabled || this.isDrawing) return;
    this.isDrawing = true;
    requestAnimationFrame(() => {
      this.draw();
      this.isDrawing = false;
    });
  }

  private getHue(visits: number): number {
    // Coloring starts at 2. Scale it from 2 to maxVisits.
    const effectiveVisits = Math.max(0, visits - 2);
    const effectiveMax = Math.max(1, this.maxVisits - 2);
    const ratio = Math.min(effectiveVisits / effectiveMax, 1);
    // HSL: 120 (Green) to 0 (Red)
    return 120 * (1 - ratio);
  }

  public draw() {
    if (!this.enabled) return;
    const { width, height } = this.canvas.getBoundingClientRect();
    this.ctx.clearRect(0, 0, width, height);

    const zoom = this.map.getZoom();
    const lat = this.map.getCenter().lat;
    const metersPerPixel = (Math.cos(lat * Math.PI / 180) * 2 * Math.PI * APP_CONFIG.EARTH_RADIUS_METERS) / (APP_CONFIG.TILE_SIZE * Math.pow(2, zoom));
    const pixelsPerMeter = 1 / metersPerPixel;
    
    const radius = Math.max(5, (this.meterRadius * APP_CONFIG.HEATMAP_RADIUS_MULTIPLIER) * pixelsPerMeter);

    this.ctx.globalAlpha = APP_CONFIG.HEATMAP_OPACITY;
    this.ctx.globalCompositeOperation = 'screen';

    for (const p of this.points) {
      // Per user request: visits (1) should not have a color at all.
      if (p.visits < 2) continue;

      const pos = this.map.project([p.lng, p.lat]);
      if (pos.x < -radius || pos.x > width + radius || pos.y < -radius || pos.y > height + radius) {
        continue;
      }

      const hue = this.getHue(p.visits);
      const gradient = this.ctx.createRadialGradient(pos.x, pos.y, 0, pos.x, pos.y, radius);
      
      gradient.addColorStop(0, `hsla(${hue}, 100%, 50%, 0.8)`);
      gradient.addColorStop(0.3, `hsla(${hue}, 100%, 50%, 0.4)`);
      gradient.addColorStop(1, `hsla(${hue}, 100%, 50%, 0)`);

      this.ctx.fillStyle = gradient;
      this.ctx.fillRect(pos.x - radius, pos.y - radius, radius * 2, radius * 2);
    }

    this.ctx.globalAlpha = 1.0;
    this.ctx.globalCompositeOperation = 'source-over';
  }

  public destroy() {
    this.resizeObserver.disconnect();
    this.canvas.remove();
  }
}
