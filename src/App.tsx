import { useState, useEffect } from 'react';
import { useMap } from './hooks/useMap';
import { useLayers } from './hooks/useLayers';
import { useLocationSearch } from './hooks/useLocationSearch';
import { useExplorationStats } from './hooks/useExplorationStats';
import { useImport } from './hooks/useImport';
import { useMapEvents } from './hooks/useMapEvents';
import { useStreets } from './hooks/useStreets';
import { databaseService } from './services/DatabaseService';
import { APP_CONFIG } from './Config';
import type { Street } from './types';

import { SearchBox } from './components/SearchBox';
import { RegionStatsCard } from './components/RegionStatsCard';
import { Controls } from './components/Controls';
import { ImportModal } from './components/ImportModal';
import { Tooltip } from './components/Tooltip';
import { HeatmapLegend } from './components/HeatmapLegend';
import { StreetListPanel } from './components/StreetListPanel';

function App() {
  const { mapContainer, map, isMapReady } = useMap();
  const { 
    refreshLayers, 
    updateFogRadius, 
    updateHeatmapStrength, 
    toggleHeatmap: toggleHeatmapLayer,
    setHighlight
  } = useLayers(map, isMapReady);
  
  const { 
    searchQuery, 
    setSearchQuery, 
    isSearching, 
    regionStats, 
    setRegionStats,
    handleSearch,
    reverseGeocode
  } = useLocationSearch(map);

  const [fogRadius, setFogRadius] = useState(APP_CONFIG.BASE_FOG_REVEAL_RADIUS);
  const [heatmapEnabled, setHeatmapEnabled] = useState(false);
  const [heatmapStrength, setHeatmapStrength] = useState(Math.floor(APP_CONFIG.HEATMAP_MAX_VISITS / 2));
  const [showStreetPanel, setShowStreetPanel] = useState(false);
  const [streetHighlight, setStreetHighlight] = useState<any>(null);

  const { explorationPercentage } = useExplorationStats(regionStats, fogRadius);
  const { tooltip } = useMapEvents(map, isMapReady);
  const { streets, isLoading: isLoadingStreets, loadStreets, setStreets } = useStreets();

  // Sync regionStats with FogLayer highlight and load streets
  useEffect(() => {
    const features: any[] = [];
    if (regionStats?.geojson) {
      features.push({
        type: 'Feature',
        properties: { type: 'region' },
        geometry: regionStats.geojson
      });
    }
    if (streetHighlight) {
      features.push(streetHighlight);
    }
    
    setHighlight(features.length > 0 ? { type: 'FeatureCollection', features } : null);

    if (regionStats) {
      loadStreets(regionStats);
    } else {
      setStreets([]);
      setStreetHighlight(null);
    }
  }, [regionStats, streetHighlight, setHighlight, loadStreets, setStreets]);

  const onImportComplete = () => {
    refreshLayers();
  };

  const handleStreetClick = (street: Street) => {
    if (!map.current || !street.coordinates || street.coordinates.length === 0) return;
    
    // Calculate center of the street
    let sumLat = 0;
    let sumLng = 0;
    street.coordinates.forEach(c => {
      sumLat += c.lat;
      sumLng += c.lng;
    });
    
    const centerLat = sumLat / street.coordinates.length;
    const centerLng = sumLng / street.coordinates.length;
    
    map.current.flyTo({
      center: [centerLng, centerLat],
      zoom: 17,
      essential: true
    });

    // Create a MultiLineString for the street highlight
    const multiLine: number[][][] = [];
    if (street.segments && street.segments.length > 0) {
      street.segments.forEach(seg => {
        multiLine.push(seg.coordinates.map(c => [c.lng, c.lat]));
      });
    } else {
      // PDOK or simple coordinate streets
      multiLine.push(street.coordinates.map(c => [c.lng, c.lat]));
    }

    setStreetHighlight({
      type: 'Feature',
      properties: { type: 'street', name: street.name },
      geometry: {
        type: 'MultiLineString',
        coordinates: multiLine
      }
    });
  };

  const {
    loading,
    setLoading,
    importStatus,
    showImportModal,
    handleFileSelect,
    startImport,
    cancelImport,
    onButtonClick,
    fileInputRef
  } = useImport(onImportComplete);

  // Handle map click for reverse geocoding
  useEffect(() => {
    if (!isMapReady || !map.current) return;

    const onClick = (e: maplibregl.MapMouseEvent) => {
      reverseGeocode(e.lngLat.lat, e.lngLat.lng);
    };

    map.current.on('click', onClick);
    return () => {
      map.current?.off('click', onClick);
    };
  }, [isMapReady, map, reverseGeocode]);

  const handleRadiusChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseInt(e.target.value);
    setFogRadius(val);
    updateFogRadius(val);
  };

  const handleHeatmapStrengthChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseInt(e.target.value);
    setHeatmapStrength(val);
    updateHeatmapStrength(val);
  };

  const onToggleHeatmap = () => {
    const next = !heatmapEnabled;
    setHeatmapEnabled(next);
    toggleHeatmapLayer(next);
  };

  const clearDatabase = async () => {
    if (!window.confirm("Delete all data?")) return;
    setLoading(true);
    try {
      await databaseService.clearDatabase();
      refreshLayers();
      setRegionStats(null);
      alert("Database cleared.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ height: '100vh', width: '100vw', display: 'flex', flexDirection: 'column', backgroundColor: '#1a1a1a', position: 'relative' }}>
      <div id="map" ref={mapContainer} style={{ flexGrow: 1, height: '100%', width: '100%' }} />

      <div style={{ position: 'absolute', top: '20px', left: '20px', zIndex: 30, display: 'flex', flexDirection: 'column', gap: '10px' }}>
        <SearchBox 
          searchQuery={searchQuery} 
          setSearchQuery={setSearchQuery} 
          handleSearch={handleSearch} 
          isSearching={isSearching} 
        />

        {regionStats && (
          <RegionStatsCard 
            stats={regionStats} 
            percentage={explorationPercentage} 
            onShowStreets={() => setShowStreetPanel(!showStreetPanel)}
          />
        )}

        {regionStats && (
          <StreetListPanel 
            streets={streets} 
            regionName={regionStats.name}
            onStreetClick={handleStreetClick}
            isVisible={showStreetPanel}
            onToggle={() => setShowStreetPanel(false)}
            isLoading={isLoadingStreets}
          />
        )}
      </div>

      {tooltip && <Tooltip data={tooltip} />}

      {heatmapEnabled && <HeatmapLegend heatmapStrength={heatmapStrength} />}

      {showImportModal && (
        <ImportModal onStart={startImport} onCancel={cancelImport} />
      )}

      <Controls 
        fogRadius={fogRadius}
        onRadiusChange={handleRadiusChange}
        heatmapEnabled={heatmapEnabled}
        heatmapStrength={heatmapStrength}
        onHeatmapStrengthChange={handleHeatmapStrengthChange}
        toggleHeatmap={onToggleHeatmap}
        onUploadClick={onButtonClick}
        onClearDatabase={clearDatabase}
        loading={loading}
        importStatus={importStatus}
      />
      
      <input type="file" accept=".json" ref={fileInputRef} onChange={handleFileSelect} style={{ display: 'none' }} />
    </div>
  );
}

export default App;
