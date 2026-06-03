import { useState, useEffect, useMemo, useRef } from 'react';
import { useMap } from './hooks/useMap';
import { useLayers } from './hooks/useLayers';
import { useLocationSearch } from './hooks/useLocationSearch';
import { useExplorationStats } from './hooks/useExplorationStats';
import { useImport } from './hooks/useImport';
import { useMapEvents } from './hooks/useMapEvents';
import { useStreets } from './hooks/useStreets';
import { databaseService } from './services/DatabaseService';
import { APP_CONFIG } from './Config';
import { calculateCenter } from './Util';
import type { Street } from './types';
import './App.css';

import { SearchBox } from './components/SearchBox';
import { RegionStatsCard } from './components/RegionStatsCard';
import { Controls } from './components/Controls';
import { Tooltip } from './components/Tooltip';
import { HeatmapLegend } from './components/HeatmapLegend';
import { StreetListPanel } from './components/StreetListPanel';
import { LoadingOverlay } from './components/LoadingOverlay';
import { UloggerSyncModal } from './components/UloggerSyncModal';

/**
 * Main application component for the World Fog of War map.
 * Manages map state, layers, location search, and user data import.
 * 
 * @returns {JSX.Element} The rendered application.
 */
function App() {
  const { mapContainer, map, isMapReady } = useMap();
  const { 
    refreshLayers, 
    updateFogRadius, 
    updateHeatmapStrength, 
    toggleHeatmap: toggleHeatmapLayer,
    setHighlight,
    showGrid,
    toggleGrid
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
  const [heatmapStrength, setHeatmapStrength] = useState(APP_CONFIG.HEATMAP_STARTING_SENSITIVITY);
  const [showStreetPanel, setShowStreetPanel] = useState(false);
  const [streetHighlight, setStreetHighlight] = useState<any>(null);
  const [initError, setInitError] = useState<string | null>(null);
  const [uloggerModalOpen, setUloggerModalOpen] = useState(false);

  // Initialize database on mount
  useEffect(() => {
    databaseService.init().catch(err => {
      console.error("Critical Database Initialization Failure", err);
      setInitError(err.message || String(err));
    });
  }, []);

  const { explorationPercentage, refreshStats } = useExplorationStats(regionStats, fogRadius);
  const { tooltip } = useMapEvents(map, isMapReady);
  const { streets, isLoading: isLoadingStreets, geoService, refreshVisited } = useStreets(regionStats);

  const { visitedStreetsCount, totalStreetsCount } = useMemo(() => {
    const total = streets.length;
    const visited = streets.filter(s => s.visited).length;
    return { visitedStreetsCount: visited, totalStreetsCount: total };
  }, [streets]);

  // Effect for highlighting
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
  }, [regionStats, streetHighlight, setHighlight]);

  const onImportComplete = () => {
    refreshLayers();
    refreshStats();
  };

  const handleStreetClick = (street: Street) => {
    if (!map.current || !street.coordinates || street.coordinates.length === 0) return;
    
    const center = calculateCenter(street.coordinates);
    
    map.current.flyTo({
      center: [center.lng, center.lat],
      zoom: 17,
      essential: true
    });

    setStreetHighlight(geoService.createStreetHighlightFeature(street));
  };

  const {
    loading,
    importStatus,
    fileInputRef,
    handleFileSelect,
    onButtonClick
  } = useImport(onImportComplete);

  useEffect(() => {
    if (!isMapReady || !map.current) return;
    const onClick = (e: any) => reverseGeocode(e.lngLat.lat, e.lngLat.lng);
    map.current.on('click', onClick);
    return () => { map.current?.off('click', onClick); };
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
    try {
      await databaseService.clearDatabase();
      refreshLayers();
      setRegionStats(null);
      alert("Database cleared.");
    } catch (err) {
      console.error("Clear database failed", err);
    }
  };

  // Reset highlight when region changes
  const prevRegionId = useRef<string | null>(null);
  useEffect(() => {
    const currentId = regionStats ? `${regionStats.osmType}:${regionStats.osmId}` : null;
    if (currentId !== prevRegionId.current) {
      prevRegionId.current = currentId;
      setStreetHighlight(null);
    }
  }, [regionStats]);

  return (
    <div className="app-container">
      <div id="map" ref={mapContainer} />

      <div className="top-left-panel">
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
            visitedStreetsCount={visitedStreetsCount}
            totalStreetsCount={totalStreetsCount}
            onShowStreets={() => setShowStreetPanel(!showStreetPanel)}
            onRefreshStreets={refreshVisited}
            isRefreshing={isLoadingStreets}
          />
        )}

        {regionStats && (
          <StreetListPanel 
            key={`${regionStats.osmType}:${regionStats.osmId}`}
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

      {loading && (
        <LoadingOverlay 
          message="Importing Data" 
          subMessage={importStatus} 
        />
      )}

      {initError && (
        <LoadingOverlay 
          message="Database Error" 
          subMessage={`We encountered a problem with the local database: ${initError}. This can happen if the browser storage is corrupted or memory limits are exceeded.`}
          isError={true}
          onReset={() => databaseService.resetDatabase()}
        />
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
        onExportDatabase={() => databaseService.exportDatabase()}
        onUloggerClick={() => setUloggerModalOpen(true)}
        loading={loading}
        showGrid={showGrid}
        toggleGrid={toggleGrid}
      />
      
      <UloggerSyncModal 
        isOpen={uloggerModalOpen} 
        onClose={() => setUloggerModalOpen(false)} 
        onImportComplete={onImportComplete}
      />

      <input type="file" accept=".json,.gpx" ref={fileInputRef} onChange={handleFileSelect} style={{ display: 'none' }} />
    </div>
  );
}

export default App;
