import { useState, useEffect } from 'react';
import { useMap } from './hooks/useMap';
import { useLayers } from './hooks/useLayers';
import { useLocationSearch } from './hooks/useLocationSearch';
import { useExplorationStats } from './hooks/useExplorationStats';
import { useImport } from './hooks/useImport';
import { useMapEvents } from './hooks/useMapEvents';
import { databaseService } from './DatabaseService';
import { APP_CONFIG } from './Config';

import { SearchBox } from './components/SearchBox';
import { RegionStatsCard } from './components/RegionStatsCard';
import { Controls } from './components/Controls';
import { ImportModal } from './components/ImportModal';
import { Tooltip } from './components/Tooltip';
import { HeatmapLegend } from './components/HeatmapLegend';

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

  const { explorationPercentage } = useExplorationStats(regionStats, fogRadius);
  const { tooltip } = useMapEvents(map, isMapReady);

  // Sync regionStats with FogLayer highlight
  useEffect(() => {
    setHighlight(regionStats?.geojson || null);
  }, [regionStats, setHighlight]);

  const onImportComplete = () => {
    refreshLayers();
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
          <RegionStatsCard stats={regionStats} percentage={explorationPercentage} />
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
