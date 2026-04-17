import maplibregl from 'maplibre-gl';
import { DatabaseService } from './DatabaseService';

export class FogLayer {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private map: maplibregl.Map;
  private db: DatabaseService;
  private resizeObserver: ResizeObserver;
  private points: {lat: number, lng: number}[] = [];
  private isDrawing = false;

  // Configurable radius in meters
  public meterRadius: number = 20;

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

    // Expand bounds slightly to avoid flickering
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
    // Standard Mercator scale calculation
    const metersPerPixel = (Math.cos(lat * Math.PI / 180) * 2 * Math.PI * 6378137) / (256 * Math.pow(2, zoom));
    return 1 / metersPerPixel;
  }

  public draw() {
    const { width, height } = this.canvas.getBoundingClientRect();
    const zoom = this.map.getZoom();
    const center = this.map.getCenter();

    // 1. Fill with fog
    this.ctx.globalCompositeOperation = 'source-over';
    this.ctx.clearRect(0, 0, width, height);
    this.ctx.fillStyle = 'rgba(15, 15, 20, 0.75)';
    this.ctx.fillRect(0, 0, width, height);

    if (this.points.length === 0) return;

    // 2. Cut out explored areas
    this.ctx.globalCompositeOperation = 'destination-out';

    // Calculate pixel radius based on meters
    const pixelsPerMeter = this.getPixelsPerMeter(center.lat, zoom);
    const radius = Math.max(3, this.meterRadius * pixelsPerMeter);

    let visiblePoints = 0;
    let drawnPoints = 0;

    // Screen-space decimation: don't draw if too close to last drawn point
    let lastX = -9999;
    let lastY = -9999;
    const minPixelDistSq = 4; // 2 pixels distance

    this.ctx.beginPath();
    for (const p of this.points) {
      const pos = this.map.project([p.lng, p.lat]);

      // Frustum culling
      if (pos.x < -radius || pos.x > width + radius || pos.y < -radius || pos.y > height + radius) {
        continue;
      }
      visiblePoints++;

      // Visual Decimation: Skip if this point is practically on top of the last one
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

    // Optional: Log reduction
    // console.log(`FogLayer: Visible=${visiblePoints}, Drawn=${drawnPoints} (Radius=${radius.toFixed(1)}px)`);
  }

  public destroy() {
    this.resizeObserver.disconnect();
    this.canvas.remove();
  }
}
