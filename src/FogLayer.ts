import maplibregl from 'maplibre-gl';
import { DatabaseService } from './services/DatabaseService';
import { APP_CONFIG } from './Config';
import { getPixelsPerMeter } from './Util';
import type { LocationPoint } from './types';

/**
 * Manages the "Fog of War" canvas overlay on the map.
 * This layer renders a dark overlay (fog) and "cuts out" areas where the user has been.
 */
export class FogLayer {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private map: maplibregl.Map;
  private db: DatabaseService;
  private resizeObserver: ResizeObserver;
  private points: LocationPoint[] = [];
  private highlightGeoJSON: any = null;
  private isDrawing = false;
  
  /** The radius in meters to reveal around each location point. */
  public meterRadius: number = APP_CONFIG.BASE_FOG_REVEAL_RADIUS; 

  /**
   * Creates an instance of FogLayer.
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
      zIndex: '1'
    });
    
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

  private detailMeters: number = 0;

  /**
   * Refreshes the location points from the database based on the current map view.
   * @returns {Promise<void>}
   */
  public async refreshData() {
    const start = performance.now();
    const bounds = this.map.getBounds();
    const zoom = this.map.getZoom();
    const center = this.map.getCenter();
    
    const pixelsPerMeter = getPixelsPerMeter(center.lat, zoom);
    this.detailMeters = 2 / pixelsPerMeter; // 2 pixels of detail

    const buffer = APP_CONFIG.RENDER_BUFFER_RATIO; 
    const latBuffer = (bounds.getNorth() - bounds.getSouth()) * buffer;
    const lngBuffer = (bounds.getEast() - bounds.getWest()) * buffer;

    this.points = await this.db.getPointsInBounds(
      bounds.getSouth() - latBuffer,
      bounds.getNorth() + latBuffer,
      bounds.getWest() - lngBuffer,
      bounds.getEast() + lngBuffer,
      this.detailMeters
    );
    
    console.debug(`FogLayer: Refreshed data. Points: ${this.points.length} (${(performance.now() - start).toFixed(2)}ms)`);
    this.scheduleDraw();
  }

  /**
   * Sets the GeoJSON features to be highlighted on the fog layer.
   * @param {any} geojson GeoJSON feature or collection to highlight.
   */
  public setHighlight(geojson: any) {
    this.highlightGeoJSON = geojson;
    this.scheduleDraw();
  }

  /**
   * Schedules a redraw of the canvas on the next animation frame.
   * @private
   */
  private scheduleDraw() {
    if (this.isDrawing) return;
    this.isDrawing = true;
    requestAnimationFrame(() => {
      this.draw();
      this.isDrawing = false;
    });
  }

  /**
   * Performs the actual drawing of the fog and revealed areas on the canvas.
   */
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
      
      const pixelsPerMeter = getPixelsPerMeter(center.lat, zoom);
      const effectiveMeterRadius = Math.max(this.meterRadius, this.detailMeters * 0.707);
      const radius = Math.max(3, effectiveMeterRadius * pixelsPerMeter);

      let lastX = -9999;
      let lastY = -9999;
      const minPixelDistSq = APP_CONFIG.MIN_PIXEL_DIST_SQ;

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

    this.drawHighlights();

    console.debug(`FogLayer: Draw complete. Points: ${drawnCount}/${this.points.length} (${(performance.now() - start).toFixed(2)}ms)`);
  }

  /**
   * Renders the highlights (regions and streets) on top of the fog.
   * @private
   */
  private drawHighlights() {
    if (!this.highlightGeoJSON) return;

    this.ctx.globalCompositeOperation = 'source-over';
    this.ctx.lineCap = 'round';
    this.ctx.lineJoin = 'round';
    
    const drawCoords = (coords: any[], color: string, lineWidth: number, blur: number) => {
      if (!coords || coords.length === 0) return;
      
      this.ctx.beginPath();
      this.ctx.strokeStyle = color;
      this.ctx.lineWidth = lineWidth;
      this.ctx.shadowBlur = blur;
      this.ctx.shadowColor = color;

      if (coords.length === 1) {
        const pos = this.map.project([coords[0][0], coords[0][1]]);
        this.ctx.fillStyle = color;
        this.ctx.arc(pos.x, pos.y, lineWidth / 2, 0, Math.PI * 2);
        this.ctx.fill();
      } else {
        coords.forEach((coord, i) => {
          const pos = this.map.project([coord[0], coord[1]]);
          if (i === 0) this.ctx.moveTo(pos.x, pos.y);
          else this.ctx.lineTo(pos.x, pos.y);
        });
        this.ctx.stroke();
      }
    };

    const processGeometry = (geometry: any, type: string) => {
      if (!geometry) return;
      const isStreet = type === 'street';
      
      const geometries = geometry.type === 'Polygon' ? [geometry.coordinates[0]] :
                         geometry.type === 'MultiPolygon' ? geometry.coordinates.map((p: any) => p[0]) :
                         geometry.type === 'LineString' ? [geometry.coordinates] :
                         geometry.type === 'MultiLineString' ? geometry.coordinates : [];

      geometries.forEach((coords: any[]) => {
        if (isStreet) {
          drawCoords(coords, APP_CONFIG.HIGHLIGHT_STREET_GLOW, APP_CONFIG.HIGHLIGHT_LINE_WIDTH_STREET * 2, APP_CONFIG.HIGHLIGHT_SHADOW_BLUR);
          drawCoords(coords, APP_CONFIG.HIGHLIGHT_STREET_COLOR, APP_CONFIG.HIGHLIGHT_LINE_WIDTH_STREET / 2, 0);
        } else {
          drawCoords(coords, APP_CONFIG.HIGHLIGHT_REGION_COLOR, APP_CONFIG.HIGHLIGHT_LINE_WIDTH_REGION, APP_CONFIG.HIGHLIGHT_SHADOW_BLUR);
        }
      });
    };

    const processFeature = (feature: any) => {
      if (!feature) return;
      processGeometry(feature.geometry || feature, feature.properties?.type || 'unknown');
    };

    if (this.highlightGeoJSON.type === 'FeatureCollection') {
      this.highlightGeoJSON.features.forEach(processFeature);
    } else {
      processFeature(this.highlightGeoJSON);
    }
    
    this.ctx.shadowBlur = 0; 
  }

  /**
   * Cleans up resources used by the FogLayer.
   */
  public destroy() {
    this.resizeObserver.disconnect();
    this.canvas.remove();
  }
}

