import maplibregl from 'maplibre-gl';
import { DatabaseService } from './DatabaseService';

export class FogLayer {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private map: maplibregl.Map;
  private db: DatabaseService;
  private resizeObserver: ResizeObserver;
  private points: {lat: number, lng: number}[] = [];
  private lastFetchBounds: maplibregl.LngLatBounds | null = null;
  private isDrawing = false;

  constructor(map: maplibregl.Map, db: DatabaseService) {
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

    // GEMINI.md: canvas sync on viewreset, movestart, moveend
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

  private async refreshData() {
    const bounds = this.map.getBounds();
    
    // Expand bounds slightly to avoid flickering at edges
    const buffer = 0.1; // 10% buffer
    const latBuffer = (bounds.getNorth() - bounds.getSouth()) * buffer;
    const lngBuffer = (bounds.getEast() - bounds.getWest()) * buffer;

    this.points = await this.db.getPointsInBounds(
      bounds.getSouth() - latBuffer,
      bounds.getNorth() + latBuffer,
      bounds.getWest() - lngBuffer,
      bounds.getEast() + lngBuffer
    );
    
    this.lastFetchBounds = bounds;
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

  public draw() {
    const { width, height } = this.canvas.getBoundingClientRect();
    
    // 1. Fill with fog
    this.ctx.globalCompositeOperation = 'source-over';
    this.ctx.clearRect(0, 0, width, height);
    this.ctx.fillStyle = 'rgba(15, 15, 20, 0.75)'; // Dark, moody fog
    this.ctx.fillRect(0, 0, width, height);

    // 2. Cut out explored areas
    this.ctx.globalCompositeOperation = 'destination-out';
    
    const zoom = this.map.getZoom();
    // Radius scales with zoom but has a minimum to remain visible
    const baseRadius = 15;
    const radius = Math.max(4, baseRadius * Math.pow(1.4, zoom - 15));

    // Batch drawing for performance
    this.ctx.beginPath();
    for (const p of this.points) {
      const pos = this.map.project([p.lng, p.lat]);
      
      // Optimization: Skip if point is outside visible canvas
      if (pos.x < -radius || pos.x > width + radius || pos.y < -radius || pos.y > height + radius) {
        continue;
      }

      this.ctx.moveTo(pos.x + radius, pos.y);
      this.ctx.arc(pos.x, pos.y, radius, 0, Math.PI * 2);
    }
    this.ctx.fill();
  }

  public destroy() {
    this.resizeObserver.disconnect();
    this.canvas.remove();
  }
}
