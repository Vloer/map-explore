import maplibregl from 'maplibre-gl';
import { DatabaseService } from './DatabaseService';
import { APP_CONFIG } from './Config';
import type { LocationPoint } from './types';

export class FogLayer {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private map: maplibregl.Map;
  private db: DatabaseService;
  private resizeObserver: ResizeObserver;
  private points: LocationPoint[] = [];
  private isDrawing = false;
  
  public meterRadius: number = APP_CONFIG.BASE_FOG_REVEAL_RADIUS; 

  constructor(map: maplibregl.Map, db: DatabaseService) {
    console.log("FogLayer: Constructor started");
    this.map = map;
    this.db = db;

    this.canvas = document.createElement('canvas');
    this.canvas.style.position = 'absolute';
    this.canvas.style.top = '0';
    this.canvas.style.left = '0';
    this.canvas.style.pointerEvents = 'none';
    this.canvas.style.zIndex = '1';
    
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

    this.refreshData();
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
    if (this.isDrawing) return;
    this.isDrawing = true;
    requestAnimationFrame(() => {
      this.draw();
      this.isDrawing = false;
    });
  }

  private getPixelsPerMeter(lat: number, zoom: number): number {
    const metersPerPixel = (Math.cos(lat * Math.PI / 180) * 2 * Math.PI * APP_CONFIG.EARTH_RADIUS_METERS) / (APP_CONFIG.TILE_SIZE * Math.pow(2, zoom));
    return 1 / metersPerPixel;
  }

  public draw() {
    const { width, height } = this.canvas.getBoundingClientRect();
    const zoom = this.map.getZoom();
    const center = this.map.getCenter();
    
    this.ctx.globalCompositeOperation = 'source-over';
    this.ctx.clearRect(0, 0, width, height);
    this.ctx.fillStyle = APP_CONFIG.FOG_COLOR; 
    this.ctx.fillRect(0, 0, width, height);

    if (this.points.length === 0) return;

    this.ctx.globalCompositeOperation = 'destination-out';
    
    const pixelsPerMeter = this.getPixelsPerMeter(center.lat, zoom);
    const radius = Math.max(3, this.meterRadius * pixelsPerMeter);

    let visiblePoints = 0;
    let drawnPoints = 0;
    
    let lastX = -9999;
    let lastY = -9999;
    const minPixelDistSq = 4; // 2 pixels distance

    this.ctx.beginPath();
    for (const p of this.points) {
      const pos = this.map.project([p.lng, p.lat]);
      
      if (pos.x < -radius || pos.x > width + radius || pos.y < -radius || pos.y > height + radius) {
        continue;
      }
      visiblePoints++;

      const dx = pos.x - lastX;
      const dy = pos.y - lastY;
      if (dx * dx + dy * dy < minPixelDistSq) {
        continue;
      }

      this.ctx.moveTo(pos.x + radius, pos.y);
      this.ctx.arc(pos.x, pos.y, radius, 0, Math.PI * 2);
      
      lastX = pos.x;
      lastY = pos.y;
      drawnPoints++;
    }
    this.ctx.fill();
  }

  public destroy() {
    this.resizeObserver.disconnect();
    this.canvas.remove();
  }
}
