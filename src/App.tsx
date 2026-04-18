import { useEffect, useRef, useState } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { databaseService } from './DatabaseService';
import { FogLayer } from './FogLayer';
import { HeatmapLayer } from './HeatmapLayer';
import { APP_CONFIG } from './Config';

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

      map.current.on('mousemove', async (e) => {
        if (!map.current) return;
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
        map.current?.setCenter(APP_CONFIG.MAP_INITIAL_CENTER);
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

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setLoading(true);
    setImportStatus('Reading file...');
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const text = e.target?.result as string;
        const data = JSON.parse(text);
        setImportStatus(`Importing data...`);
        await databaseService.importGoogleHistory(data);
        setImportStatus('Import complete!');
        fogLayer.current?.refreshData();
        if (heatmapEnabled) heatmapLayer.current?.refreshData();
      } catch (err) {
        setImportStatus('Error importing data.');
      } finally {
        setLoading(false);
      }
    };
    reader.readAsText(file);
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
    if (!window.confirm("Are you sure you want to delete all location data?")) return;
    setLoading(true);
    try {
      await databaseService.clearDatabase();
      fogLayer.current?.refreshData();
      if (heatmapEnabled) heatmapLayer.current?.refreshData();
      alert("Database cleared.");
    } catch (err) {
      console.error(err);
      alert("Error clearing database.");
    } finally {
      setLoading(false);
    }
  };

  const fileInputRef = useRef<HTMLInputElement>(null);
  const onButtonClick = () => fileInputRef.current?.click();

  return (
    <div style={{ height: '100vh', width: '100vw', display: 'flex', flexDirection: 'column', backgroundColor: '#1a1a1a', position: 'relative' }}>
      <div id="map" ref={mapContainer} style={{ flexGrow: 1, height: '100%', width: '100%' }} />
      
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
          position: 'absolute',
          top: '20px',
          right: '20px',
          background: 'white',
          padding: '10px',
          borderRadius: '8px',
          boxShadow: '0 2px 10px rgba(0,0,0,0.2)',
          zIndex: 20,
          width: '150px'
        }}>
          <div style={{ fontSize: '12px', fontWeight: 'bold', marginBottom: '8px', textAlign: 'center' }}>Visits</div>
          <div style={{ 
            height: '10px', 
            width: '100%', 
            background: 'linear-gradient(to right, #00ff00, #ffff00, #ff0000)', 
            borderRadius: '5px',
            marginBottom: '4px'
          }} />
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px' }}>
            <span>1</span>
            <span>{Math.round(heatmapStrength / 2)}</span>
            <span>{heatmapStrength}+</span>
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
          <label style={{ fontSize: '14px', display: 'block', marginBottom: '8px', fontWeight: 'bold' }}>
            Radius: {fogRadius}m
          </label>
          <input 
            type="range" 
            min={APP_CONFIG.MIN_FOG_REVEAL_RADIUS} 
            max={APP_CONFIG.MAX_FOG_REVEAL_RADIUS} 
            step={APP_CONFIG.RADIUS_SLIDER_STEP}
            value={fogRadius} 
            onChange={handleRadiusChange}
            style={{ width: '100%', cursor: 'pointer' }}
          />
        </div>

        {heatmapEnabled && (
          <div style={{ marginBottom: '15px' }}>
            <label style={{ fontSize: '14px', display: 'block', marginBottom: '8px', fontWeight: 'bold' }}>
              Heatmap sensitivity: {heatmapStrength}{heatmapStrength === APP_CONFIG.HEATMAP_MAX_VISITS ? "+" : ""}
            </label>
            <input 
              type="range" 
              min="1" 
              max={APP_CONFIG.HEATMAP_MAX_VISITS} 
              step="1"
              value={heatmapStrength} 
              onChange={handleHeatmapStrengthChange}
              style={{ width: '100%', cursor: 'pointer' }}
            />
          </div>
        )}

        <button
          onClick={toggleHeatmap}
          style={{
            width: '100%',
            padding: '10px',
            backgroundColor: heatmapEnabled ? '#ff4444' : '#2196F3',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
            fontSize: '14px',
            fontWeight: 'bold',
            marginBottom: '15px'
          }}
        >
          {heatmapEnabled ? 'Disable Heatmap' : 'Enable Heatmap'}
        </button>

        <input
          type="file"
          accept=".json"
          ref={fileInputRef}
          onChange={handleFileUpload}
          style={{ display: 'none' }}
        />
        <button
          onClick={onButtonClick}
          disabled={loading}
          style={{
            width: '100%',
            padding: '10px',
            backgroundColor: loading ? '#ccc' : '#4CAF50',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: loading ? 'not-allowed' : 'pointer',
            fontSize: '14px',
            fontWeight: 'bold',
            marginBottom: '10px'
          }}
        >
          {loading ? 'Processing...' : 'Upload Google Takeout JSON'}
        </button>

        <button
          onClick={clearDatabase}
          disabled={loading}
          style={{
            width: '100%',
            padding: '10px',
            backgroundColor: 'transparent',
            color: '#ff4444',
            border: '1px solid #ff4444',
            borderRadius: '4px',
            cursor: loading ? 'not-allowed' : 'pointer',
            fontSize: '13px',
            fontWeight: 'normal'
          }}
        >
          Clear All Data
        </button>

        {importStatus && <p style={{ fontSize: '12px', marginTop: '10px', color: '#666', textAlign: 'center' }}>{importStatus}</p>}
      </div>
    </div>
  );
}

export default App;
