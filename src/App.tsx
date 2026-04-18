import { useEffect, useRef, useState } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import * as turf from '@turf/turf';
import { databaseService } from './DatabaseService';
import type { ImportOptions } from './DatabaseService';
import { FogLayer } from './FogLayer';
import { HeatmapLayer } from './HeatmapLayer';
import { APP_CONFIG } from './Config';

interface RegionStats {
  name: string;
  type: string;
  geojson: any;
  bounds: [number, number, number, number]; // [minLat, maxLat, minLng, maxLng]
}

function App() {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map | null>(null);
  const fogLayer = useRef<FogLayer | null>(null);
  const heatmapLayer = useRef<HeatmapLayer | null>(null);

  const [loading, setLoading] = useState(false);
  const [importStatus, setImportStatus] = useState('');
  const [fogRadius, setFogRadius] = useState(APP_CONFIG.BASE_FOG_REVEAL_RADIUS);
  const [heatmapEnabled, setHeatmapEnabled] = useState(false);
  const [heatmapStrength, setHeatmapStrength] = useState(Math.floor(APP_CONFIG.HEATMAP_MAX_VISITS / 2));
  const [tooltip, setTooltip] = useState<{ x: number, y: number, text: string } | null>(null);
  const [regionStats, setRegionStats] = useState<RegionStats | null>(null);
  const [explorationPercentage, setExplorationPercentage] = useState<number>(0);

  const [searchQuery, setSearchQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);

  const [pendingData, setPendingData] = useState<any | null>(null);
  const [showImportModal, setShowImportModal] = useState(false);

  useEffect(() => {
    if (map.current) return;
    if (!mapContainer.current) return;

    try {
      map.current = new maplibregl.Map({
        container: mapContainer.current,
        style: {
          version: 8,
          sources: {
            'osm': {
              type: 'raster',
              tiles: [APP_CONFIG.MAP_STYLE],
              tileSize: APP_CONFIG.TILE_SIZE,
              attribution: '&copy; OpenStreetMap Contributors',
              maxzoom: APP_CONFIG.MAP_MAX_ZOOM
            }
          },
          layers: [{ id: 'osm', type: 'raster', source: 'osm' }]
        },
        center: APP_CONFIG.MAP_INITIAL_CENTER,
        zoom: APP_CONFIG.MAP_INITIAL_ZOOM,
        maxZoom: APP_CONFIG.MAP_MAX_ZOOM,
        attributionControl: true
      });

      map.current.addControl(new maplibregl.NavigationControl());

      // Use a basic throttle for mousemove to prevent lag
      let lastMove = 0;
      map.current.on('mousemove', async (e) => {
        if (!map.current || Date.now() - lastMove < 50) return;
        lastMove = Date.now();

        const radius = APP_CONFIG.HOVER_RADIUS_DEGREES;
        const nearest = await databaseService.getNearestPoint(e.lngLat.lat, e.lngLat.lng, radius);
        if (nearest) {
          const date = new Date(nearest.timestamp);
          const timeStr = date.toLocaleString([], {
            year: 'numeric', month: '2-digit', day: '2-digit',
            hour: '2-digit', minute: '2-digit'
          });
          setTooltip({
            x: e.point.x,
            y: e.point.y,
            text: `${nearest.lat.toFixed(5)}, ${nearest.lng.toFixed(5)}\nLatest visit: ${timeStr}\nTotal signals: ${nearest.visits}`
          });
        } else {
          setTooltip(null);
        }
      });

      map.current.on('load', async () => {
        map.current?.addSource('region-highlight', {
          type: 'geojson',
          data: { type: 'FeatureCollection', features: [] }
        });
        map.current?.addLayer({
          id: 'region-highlight-line',
          type: 'line',
          source: 'region-highlight',
          paint: { 'line-color': '#2196F3', 'line-width': 3, 'line-opacity': 0.8 }
        });
        map.current?.addLayer({
          id: 'region-highlight-fill',
          type: 'fill',
          source: 'region-highlight',
          paint: { 'fill-color': '#2196F3', 'fill-opacity': 0.05 }
        });

        try {
          await databaseService.init();
          if (map.current) {
            fogLayer.current = new FogLayer(map.current, databaseService);
            heatmapLayer.current = new HeatmapLayer(map.current, databaseService);
            heatmapLayer.current.maxVisits = heatmapStrength;
          }
        } catch (dbErr) {
          console.error("App: DB init failed:", dbErr);
        }
      });
    } catch (err) {
      console.error("App: Map creation failed:", err);
    }

    return () => {
      fogLayer.current?.destroy();
      heatmapLayer.current?.destroy();
      map.current?.remove();
      map.current = null;
    };
  }, []);

  useEffect(() => {
    if (regionStats) {
      calculatePercentage(regionStats);
    }
  }, [regionStats, fogRadius]);

  const calculatePercentage = async (stats: RegionStats) => {
    const [minLat, maxLat, minLng, maxLng] = stats.bounds;

    // Get all points from DB in this region's bounding box
    const points = await databaseService.getPointsInBounds(minLat, maxLat, minLng, maxLng);

    if (points.length === 0) {
      console.log(`Exploration: 0 points found for ${stats.name}`);
      setExplorationPercentage(0);
      return;
    }

    // Use turf to check which signals are inside the actual borders
    let countInPolygon = 0;
    const polygon = stats.geojson;

    for (const p of points) {
      const pt = [p.lng, p.lat];
      if (turf.booleanPointInPolygon(pt, polygon)) {
        countInPolygon++;
      }
    }

    const totalAreaSqM = turf.area(polygon);

    // Exploration logic: One signal reveals a circle of fogRadius.
    // However, signals are snapped to a grid (DETAIL_RADIUS).
    // To avoid massive overestimation from overlaps, we use the occupied grid cell area
    // but scale it proportionally to the visual radius.
    const gridCellArea = Math.pow(APP_CONFIG.DETAIL_RADIUS_METERS * 2, 2);
    const radiusScaleFactor = Math.pow(fogRadius / APP_CONFIG.DETAIL_RADIUS_METERS, 2);

    // Total explored area = signals * gridCellArea * scaleFactor
    // This ensures increasing fogRadius INCREASES the percentage discovered.
    const exploredAreaSqM = countInPolygon * gridCellArea * radiusScaleFactor;

    let percentage = (exploredAreaSqM / totalAreaSqM) * 100;
    if (percentage > 100) percentage = 100;

    console.log(`Exploration Stats for ${stats.name}:`, {
      regionAreaKm2: (totalAreaSqM / 1000000).toFixed(2),
      signalsInRegion: countInPolygon,
      fogRadius,
      discoveredAreaKm2: (exploredAreaSqM / 1000000).toFixed(4),
      percentage: percentage.toFixed(5)
    });

    setExplorationPercentage(percentage);
  };

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim() || !map.current) return;

    setIsSearching(true);
    try {
      const response = await fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(searchQuery)}&format=json&addressdetails=1&limit=1&polygon_geojson=1`);
      const results = await response.json();

      if (results && results.length > 0) {
        const place = results[0];
        const [minLat, maxLat, minLng, maxLng] = place.boundingbox.map(Number);

        map.current.fitBounds([minLng, minLat, maxLng, maxLat], { padding: 50 });

        const source = map.current.getSource('region-highlight') as maplibregl.GeoJSONSource;
        if (source) source.setData(place.geojson);

        setRegionStats({
          name: place.display_name.split(',')[0],
          type: place.type || place.class,
          geojson: place.geojson,
          bounds: [minLat, maxLat, minLng, maxLng]
        });
      } else {
        alert("Location not found");
      }
    } catch (err) {
      console.error("Search error:", err);
    } finally {
      setIsSearching(false);
    }
  };

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setLoading(true);
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const text = e.target?.result as string;
        const data = JSON.parse(text);
        setPendingData(data);
        setShowImportModal(true);
      } catch (err) {
        setLoading(false);
      }
    };
    reader.readAsText(file);
    event.target.value = '';
  };

  const startImport = async (options: ImportOptions) => {
    if (!pendingData) return;
    setShowImportModal(false);
    setLoading(true);
    try {
      await databaseService.importGoogleHistory(pendingData, options);
      setImportStatus('Import complete!');
      setPendingData(null);
      fogLayer.current?.refreshData();
      if (heatmapEnabled) heatmapLayer.current?.refreshData();
      if (regionStats) calculatePercentage(regionStats);
    } catch (err) {
      setImportStatus('Error importing.');
    } finally {
      setLoading(false);
    }
  };

  const handleRadiusChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseInt(e.target.value);
    setFogRadius(val);
    if (fogLayer.current) {
      fogLayer.current.meterRadius = val;
      fogLayer.current.draw();
    }
    if (heatmapLayer.current) {
      heatmapLayer.current.meterRadius = val;
      heatmapLayer.current.draw();
    }
  };

  const handleHeatmapStrengthChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseInt(e.target.value);
    setHeatmapStrength(val);
    if (heatmapLayer.current) {
      heatmapLayer.current.maxVisits = val;
      heatmapLayer.current.draw();
    }
  };

  const toggleHeatmap = () => {
    const next = !heatmapEnabled;
    setHeatmapEnabled(next);
    heatmapLayer.current?.setEnabled(next);
  };

  const clearDatabase = async () => {
    if (!window.confirm("Delete all data?")) return;
    setLoading(true);
    try {
      await databaseService.clearDatabase();
      fogLayer.current?.refreshData();
      if (heatmapEnabled) heatmapLayer.current?.refreshData();
      setRegionStats(null);
      setExplorationPercentage(0);
      const source = map.current?.getSource('region-highlight') as maplibregl.GeoJSONSource;
      if (source) source.setData({ type: 'FeatureCollection', features: [] });
      alert("Database cleared.");
    } finally {
      setLoading(false);
    }
  };

  const fileInputRef = useRef<HTMLInputElement>(null);
  const onButtonClick = () => fileInputRef.current?.click();

  return (
    <div style={{ height: '100vh', width: '100vw', display: 'flex', flexDirection: 'column', backgroundColor: '#1a1a1a', position: 'relative' }}>
      <div id="map" ref={mapContainer} style={{ flexGrow: 1, height: '100%', width: '100%' }} />

      <div style={{ position: 'absolute', top: '20px', left: '20px', zIndex: 30, display: 'flex', flexDirection: 'column', gap: '10px' }}>
        <form onSubmit={handleSearch} style={{ display: 'flex', gap: '5px' }}>
          <input
            type="text"
            placeholder="Search location..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{ padding: '8px 12px', borderRadius: '4px', border: 'none', boxShadow: '0 2px 5px rgba(0,0,0,0.2)', width: '200px' }}
          />
          <button type="submit" disabled={isSearching} style={{ padding: '8px 12px', background: '#2196F3', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}>
            {isSearching ? '...' : 'Search'}
          </button>
        </form>

        {regionStats && (
          <div style={{
            background: 'rgba(255, 255, 255, 0.95)', padding: '15px',
            borderRadius: '8px', boxShadow: '0 2px 10px rgba(0,0,0,0.2)',
            minWidth: '250px'
          }}>
            <div style={{ fontSize: '16px', fontWeight: 'bold', color: '#333' }}>{regionStats.name}</div>
            <div style={{ fontSize: '12px', color: '#666', marginBottom: '10px', textTransform: 'capitalize' }}>{regionStats.type} exploration</div>
            <div style={{ height: '8px', width: '100%', background: '#eee', borderRadius: '4px', overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${explorationPercentage}%`, background: '#4CAF50', transition: 'width 0.8s ease' }} />
            </div>
            <div style={{ fontSize: '12px', marginTop: '6px', textAlign: 'right', fontWeight: 'bold' }}>
              {explorationPercentage.toFixed(5)}%
            </div>
          </div>
        )}
      </div>

      {tooltip && (
        <div style={{
          position: 'absolute',
          left: tooltip.x + APP_CONFIG.TOOLTIP_OFFSET,
          top: tooltip.y + APP_CONFIG.TOOLTIP_OFFSET,
          backgroundColor: 'rgba(0, 0, 0, 0.8)',
          color: 'white',
          padding: '8px 12px',
          borderRadius: '4px',
          pointerEvents: 'none',
          zIndex: 100,
          fontSize: '12px',
          whiteSpace: 'pre-line',
          border: '1px solid rgba(255,255,255,0.2)'
        }}>
          {tooltip.text}
        </div>
      )}

      {heatmapEnabled && (
        <div style={{
          position: 'absolute', top: '20px', right: '20px',
          background: 'white', padding: '10px', borderRadius: '8px',
          boxShadow: '0 2px 10px rgba(0,0,0,0.2)', zIndex: 20, width: '150px'
        }}>
          <div style={{ fontSize: '12px', fontWeight: 'bold', marginBottom: '8px', textAlign: 'center' }}>Visits</div>
          <div style={{ height: '10px', width: '100%', background: 'linear-gradient(to right, #00ff00, #ffff00, #ff0000)', borderRadius: '5px', marginBottom: '4px' }} />
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px' }}>
            <span>2</span><span>{Math.round(heatmapStrength / 2)}</span><span>{heatmapStrength}+</span>
          </div>
        </div>
      )}

      {showImportModal && (
        <div style={{
          position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex',
          alignItems: 'center', justifyContent: 'center', zIndex: 1000
        }}>
          <div style={{ background: 'white', padding: '25px', borderRadius: '12px', maxWidth: '400px', width: '90%', boxShadow: '0 4px 20px rgba(0,0,0,0.3)' }}>
            <h3 style={{ margin: '0 0 15px 0' }}>Import Options</h3>
            <p style={{ fontSize: '14px', color: '#444', marginBottom: '20px' }}>How much detail do you want to import from your timeline?</p>
            <button onClick={() => startImport({ includeRawSignals: true, includeSemanticSegments: true })} style={{ width: '100%', padding: '12px', marginBottom: '10px', backgroundColor: '#4CAF50', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}>Full Detail (Raw + Semantic)</button>
            <button onClick={() => startImport({ includeRawSignals: false, includeSemanticSegments: true })} style={{ width: '100%', padding: '12px', marginBottom: '15px', backgroundColor: '#2196F3', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}>Semantic Segments Only (Cleaner)</button>
            <button onClick={() => { setShowImportModal(false); setLoading(false); setImportStatus(''); }} style={{ width: '100%', padding: '8px', backgroundColor: 'transparent', color: '#666', border: 'none', cursor: 'pointer', fontSize: '13px' }}>Cancel</button>
          </div>
        </div>
      )}

      <div id="controls" style={{
        position: 'absolute', bottom: '20px', left: '20px', zIndex: 20,
        background: 'white', padding: '15px', borderRadius: '8px',
        boxShadow: '0 2px 10px rgba(0,0,0,0.2)', width: '250px'
      }}>
        <h3 style={{ margin: '0 0 15px 0', fontSize: '18px' }}>World Fog of War</h3>
        <div style={{ marginBottom: '15px' }}>
          <label style={{ fontSize: '14px', display: 'block', marginBottom: '8px', fontWeight: 'bold' }}>Radius: {fogRadius}m</label>
          <input type="range" min={APP_CONFIG.MIN_FOG_REVEAL_RADIUS} max={APP_CONFIG.MAX_FOG_REVEAL_RADIUS} step={APP_CONFIG.RADIUS_SLIDER_STEP} value={fogRadius} onChange={handleRadiusChange} style={{ width: '100%', cursor: 'pointer' }} />
        </div>
        {heatmapEnabled && (
          <div style={{ marginBottom: '15px' }}>
            <label style={{ fontSize: '14px', display: 'block', marginBottom: '8px', fontWeight: 'bold' }}>Heatmap sensitivity: {heatmapStrength}{heatmapStrength === APP_CONFIG.HEATMAP_MAX_VISITS ? "+" : ""}</label>
            <input type="range" min="1" max={APP_CONFIG.HEATMAP_MAX_VISITS} step="1" value={heatmapStrength} onChange={handleHeatmapStrengthChange} style={{ width: '100%', cursor: 'pointer' }} />
          </div>
        )}
        <button onClick={toggleHeatmap} style={{ width: '100%', padding: '10px', backgroundColor: heatmapEnabled ? '#ff4444' : '#2196F3', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '14px', fontWeight: 'bold', marginBottom: '15px' }}>{heatmapEnabled ? 'Disable Heatmap' : 'Enable Heatmap'}</button>
        <button onClick={onButtonClick} disabled={loading} style={{ width: '100%', padding: '10px', backgroundColor: loading ? '#ccc' : '#4CAF50', color: 'white', border: 'none', borderRadius: '4px', cursor: loading ? 'not-allowed' : 'pointer', fontSize: '14px', fontWeight: 'bold', marginBottom: '10px' }}>{loading ? 'Processing...' : 'Upload Google location data'}</button>
        <button onClick={clearDatabase} disabled={loading} style={{ width: '100%', padding: '10px', backgroundColor: 'transparent', color: '#ff4444', border: '1px solid #ff4444', borderRadius: '4px', cursor: loading ? 'not-allowed' : 'pointer', fontSize: '13px', fontWeight: 'normal' }}>Clear All Data</button>
        {importStatus && <p style={{ fontSize: '12px', marginTop: '10px', color: '#666', textAlign: 'center' }}>{importStatus}</p>}
      </div>
      <input type="file" accept=".json" ref={fileInputRef} onChange={handleFileSelect} style={{ display: 'none' }} />
    </div>
  );
}

export default App;
