import { useEffect, useRef, useState } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { databaseService } from './DatabaseService';
import { FogLayer } from './FogLayer';

function App() {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map | null>(null);
  const fogLayer = useRef<FogLayer | null>(null);
  const [loading, setLoading] = useState(false);
  const [importStatus, setImportStatus] = useState('');

  const [tooltip, setTooltip] = useState<{ x: number, y: number, text: string } | null>(null);

  useEffect(() => {
    if (map.current) return;
    if (!mapContainer.current) return;

    console.log("App: Initializing map...");
    try {
      map.current = new maplibregl.Map({
        container: mapContainer.current,
        style: {
          version: 8,
          sources: {
            'osm': {
              type: 'raster',
              tiles: ['https://a.tile.openstreetmap.org/{z}/{x}/{y}.png'],
              tileSize: 256,
              attribution: '&copy; OpenStreetMap Contributors',
              maxzoom: 19
            }
          },
          layers: [
            {
              id: 'osm',
              type: 'raster',
              source: 'osm'
            }
          ]
        },
        center: [5.2561, 51.3697], // Hapert, Netherlands
        zoom: 14,
        maxZoom: 19,
        attributionControl: true
      });
      console.log("App: Map initialized with center [5.2561, 51.3697]");

      map.current.addControl(new maplibregl.NavigationControl());

      map.current.on('error', (e) => {
        console.error("MapLibre error:", e);
      });

      map.current.on('mousemove', async (e) => {
        if (!map.current) return;
        
        // Find nearest point within current visual radius
        // 0.0001 degrees is ~11 meters, good enough for "hovering a circle"
        const radius = 0.0002; 
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
            text: `${nearest.lat.toFixed(5)}, ${nearest.lng.toFixed(5)}\nLatest visit: ${timeStr}`
          });
        } else {
          setTooltip(null);
        }
      });

      map.current.on('load', async () => {
        console.log("App: Map loaded");
        map.current?.setCenter([5.2561, 51.3697]);
        try {
          await databaseService.init();
          console.log("App: DB initialized");
          if (map.current) {
            fogLayer.current = new FogLayer(map.current, databaseService);
            console.log("App: FogLayer created");
          }
        } catch (dbErr) {
          console.error("App: DB/FogLayer init failed:", dbErr);
        }
      });
    } catch (err) {
      console.error("App: Map creation failed:", err);
    }

    return () => {
      fogLayer.current?.destroy();
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
        console.log("File read successfully, size:", text.length);

        setImportStatus('Parsing JSON...');
        const data = JSON.parse(text);
        console.log("JSON parsed. Top level keys:", Object.keys(data));

        if (data.timelineEdits) {
          console.log("Found timelineEdits, count:", data.timelineEdits.length);
        }
        if (data.locations) {
          console.log("Found locations, count:", data.locations.length);
        }

        setImportStatus(`Importing data...`);
        await databaseService.importGoogleHistory(data);

        setImportStatus('Import complete!');
        fogLayer.current?.refreshData();
      } catch (err) {
        console.error("Import error details:", err);
        setImportStatus('Error importing data. Check console.');
      } finally {
        setLoading(false);
      }
    };
    reader.readAsText(file);
  };

  const fileInputRef = useRef<HTMLInputElement>(null);

  const onButtonClick = () => {
    fileInputRef.current?.click();
  };

  return (
    <div style={{ height: '100vh', width: '100vw', display: 'flex', flexDirection: 'column', backgroundColor: '#1a1a1a', position: 'relative' }}>
      <div id="map" ref={mapContainer} style={{ flexGrow: 1, height: '100%', width: '100%' }} />
      
      {tooltip && (
        <div style={{
          position: 'absolute',
          left: tooltip.x + 15,
          top: tooltip.y + 15,
          backgroundColor: 'rgba(0, 0, 0, 0.8)',
          color: 'white',
          padding: '8px 12px',
          borderRadius: '4px',
          pointerEvents: 'none',
          zIndex: 100,
          fontSize: '12px',
          whiteSpace: 'pre-line',
          boxShadow: '0 2px 5px rgba(0,0,0,0.3)',
          border: '1px solid rgba(255,255,255,0.2)'
        }}>
          {tooltip.text}
        </div>
      )}

      <div id="controls">
        <h3 style={{ margin: '0 0 10px 0' }}>World Fog of War</h3>
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
            padding: '10px 20px',
            backgroundColor: loading ? '#ccc' : '#4CAF50',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: loading ? 'not-allowed' : 'pointer',
            fontSize: '14px',
            fontWeight: 'bold'
          }}
        >
          {loading ? 'Processing...' : 'Upload Google Takeout JSON'}
        </button>
        {importStatus && <p style={{ fontSize: '12px', marginTop: '8px', color: '#666' }}>{importStatus}</p>}
      </div>
    </div>
  );
}

export default App;
