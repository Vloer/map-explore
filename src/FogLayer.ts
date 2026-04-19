import maplibregl from 'maplibre-gl';
import { DatabaseService } from './services/DatabaseService';
import { APP_CONFIG } from './Config';
import type { LocationPoint } from './types';

export class FogLayer {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private map: maplibregl.Map;
  private db: DatabaseService;
  private resizeObserver: ResizeObserver;
  private points: LocationPoint[] = [];
  private highlightGeoJSON: any = null;
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

  private detailMeters: number = 0;

  public async refreshData() {
    const start = performance.now();
    const bounds = this.map.getBounds();
    const zoom = this.map.getZoom();
    const center = this.map.getCenter();
    
    // Calculate detail level: we want roughly 2 pixels of detail
    const metersPerPixel = (Math.cos(center.lat * Math.PI / 180) * 2 * Math.PI * APP_CONFIG.EARTH_RADIUS_METERS) / (APP_CONFIG.TILE_SIZE * Math.pow(2, zoom));
    this.detailMeters = metersPerPixel * 2;

    const buffer = 0.1; 
    const latBuffer = (bounds.getNorth() - bounds.getSouth()) * buffer;
    const lngBuffer = (bounds.getEast() - bounds.getWest()) * buffer;

    this.points = await this.db.getPointsInBounds(
      bounds.getSouth() - latBuffer,
      bounds.getNorth() + latBuffer,
      bounds.getWest() - lngBuffer,
      bounds.getEast() + lngBuffer,
      this.detailMeters
    );
    
    console.log(`FogLayer: Refreshed data. Points in buffer: ${this.points.length} (Detail: ${this.detailMeters.toFixed(1)}m, ${(performance.now() - start).toFixed(2)}ms)`);
    this.scheduleDraw();
  }

  public setHighlight(geojson: any) {
    this.highlightGeoJSON = geojson;
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
    const start = performance.now();
    const { width, height } = this.canvas.getBoundingClientRect();
    const zoom = this.map.getZoom();
    const center = this.map.getCenter();
    
    this.ctx.globalCompositeOperation = 'source-over';
    this.ctx.clearRect(0, 0, width, height);
    this.ctx.fillStyle = APP_CONFIG.FOG_COLOR; 
    this.ctx.fillRect(0, 0, width, height);

    let drawnCount = 0;
    if (this.points.length > 0) {
      this.ctx.globalCompositeOperation = 'destination-out';
      
      const pixelsPerMeter = this.getPixelsPerMeter(center.lat, zoom);

      // The effective radius is the larger of:
      // 1. The user-selected meterRadius
      // 2. A radius that covers the gap between downsampled points (detailMeters * 0.707)
      const effectiveMeterRadius = Math.max(this.meterRadius, this.detailMeters * 0.707);
      const radius = Math.max(3, effectiveMeterRadius * pixelsPerMeter);

      let lastX = -9999;
      let lastY = -9999;
      const minPixelDistSq = 4; // 2 pixels distance

      this.ctx.beginPath();
      for (const p of this.points) {
        const pos = this.map.project([p.lng, p.lat]);
        
        if (pos.x < -radius || pos.x > width + radius || pos.y < -radius || pos.y > height + radius) {
          continue;
        }

        const dx = pos.x - lastX;
        const dy = pos.y - lastY;
        if (dx * dx + dy * dy < minPixelDistSq) {
          continue;
        }

        this.ctx.moveTo(pos.x + radius, pos.y);
        this.ctx.arc(pos.x, pos.y, radius, 0, Math.PI * 2);
        
        lastX = pos.x;
        lastY = pos.y;
        drawnCount++;
      }
      this.ctx.fill();
    }

    // Draw highlight polygon on top
    if (this.highlightGeoJSON) {
      this.ctx.globalCompositeOperation = 'source-over';
      this.ctx.lineCap = 'round';
      this.ctx.lineJoin = 'round';
      
      const drawCoords = (coords: any[], color: string, width: number, blur: number) => {
        if (!coords || coords.length === 0) return;
        
        this.ctx.beginPath();
        this.ctx.strokeStyle = color;
        this.ctx.lineWidth = width;
        
        if (blur > 0) {
          this.ctx.shadowBlur = blur;
          this.ctx.shadowColor = color;
        } else {
          this.ctx.shadowBlur = 0;
        }

        if (coords.length === 1) {
          // Special case: Single point (common for PDOK centroids)
          // Draw a small circle to make the highlight visible
          const pos = this.map.project([coords[0][0], coords[0][1]]);
          this.ctx.fillStyle = color;
          this.ctx.arc(pos.x, pos.y, width / 2, 0, Math.PI * 2);
          this.ctx.fill();
        } else {
          // Standard case: Multiple points (LineString)
          coords.forEach((coord, i) => {
            const pos = this.map.project([coord[0], coord[1]]);
            if (i === 0) {
              this.ctx.moveTo(pos.x, pos.y);
            } else {
              this.ctx.lineTo(pos.x, pos.y);
            }
          });
          this.ctx.stroke();
        }
      };

      const processGeometry = (geometry: any, type: string) => {
        if (!geometry) return;
        
        const isStreet = type === 'street';
        const baseColor = isStreet ? 'rgba(255, 255, 0, 1)' : 'rgba(0, 229, 255, 1)';
        const glowColor = isStreet ? 'rgba(255, 255, 0, 0.4)' : 'rgba(0, 229, 255, 0.4)';
        
        const geometries = geometry.type === 'Polygon' ? [geometry.coordinates[0]] :
                           geometry.type === 'MultiPolygon' ? geometry.coordinates.map((p: any) => p[0]) :
                           geometry.type === 'LineString' ? [geometry.coordinates] :
                           geometry.type === 'MultiLineString' ? geometry.coordinates : [];

        geometries.forEach((coords: any[]) => {
          if (isStreet) {
            // Draw multi-layered glow for streets
            drawCoords(coords, glowColor, 12, 10);
            drawCoords(coords, glowColor, 8, 5);
            drawCoords(coords, baseColor, 3, 0);
          } else {
            // Standard highlight for regions
            drawCoords(coords, baseColor, 4, 10);
          }
        });
      };

      const processFeature = (feature: any) => {
        if (!feature) return;
        const type = feature.properties?.type || 'unknown';
        processGeometry(feature.geometry || feature, type);
      };

      if (this.highlightGeoJSON.type === 'Feature') {
        processFeature(this.highlightGeoJSON);
      } else if (this.highlightGeoJSON.type === 'FeatureCollection') {
        this.highlightGeoJSON.features.forEach(processFeature);
      } else {
        processFeature({ geometry: this.highlightGeoJSON });
      }
      
      this.ctx.shadowBlur = 0; // Reset shadow
    }

    console.log(`FogLayer: Draw complete. Points rendered: ${drawnCount}/${this.points.length} (${(performance.now() - start).toFixed(2)}ms)`);
  }

  public destroy() {
    this.resizeObserver.disconnect();
    this.canvas.remove();
  }
}
