import { useState, useEffect, useMemo, useRef } from 'react';
import { useMap } from './hooks/useMap';
import { useLayers } from './hooks/useLayers';
import { useLocationSearch } from './hooks/useLocationSearch';
import { useExplorationStats } from './hooks/useExplorationStats';
import { useImport } from './hooks/useImport';
import { useMapEvents } from './hooks/useMapEvents';
import { useStreets } from './hooks/useStreets';
import { useUserLocation } from './hooks/useUserLocation';
import { databaseService } from './services/DatabaseService';
import { uloggerService } from './services/UloggerService';
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
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { LoginScreen } from './components/LoginScreen';

/**
 * The internal content of the app, gated by authentication.
 */
function AppContent({ initError }: { initError: string | null }) {
  const { session, logout } = useAuth();
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
  
  const [uloggerModalOpen, setUloggerModalOpen] = useState(false);
  const [uloggerModalMode, setUloggerModalMode] = useState<'manual' | 'autosync'>('manual');
  const [autoSyncActive, setAutoSyncActive] = useState(false);
  const [autoSyncIds, setAutoSyncIds] = useState<number[]>([]);

  // Local effect for UI state on mount
  useEffect(() => {
    // Check for active auto-sync on mount
    const expiry = localStorage.getItem('ulogger_auto_sync_expiry');
    const savedIds = localStorage.getItem('ulogger_auto_sync_ids');
    
    if (savedIds) {
      try {
        setAutoSyncIds(JSON.parse(savedIds));
      } catch (e) {
        console.error("Failed to parse auto-sync IDs", e);
      }
    }

    if (expiry && Number(expiry) > Date.now()) {
      setAutoSyncActive(true);
    }
  }, []);

  // Auto-sync timer logic
  useEffect(() => {
    if (!autoSyncActive || !session) return;

    const interval = setInterval(async () => {
      // Check if expired
      const expiry = localStorage.getItem('ulogger_auto_sync_expiry');
      if (!expiry || Number(expiry) <= Date.now()) {
        setAutoSyncActive(false);
        localStorage.removeItem('ulogger_auto_sync_expiry');
        return;
      }

      console.log('Auto-Sync: Checking for updates for tracks:', autoSyncIds);
      try {
        const syncedCount = await uloggerService.syncAllPending(session.token, autoSyncIds);
        if (syncedCount > 0) {
          console.log(`Auto-Sync: Synced ${syncedCount} tracks.`);
          onImportComplete();
        }
      } catch (err: any) {
        console.error('Auto-Sync Error:', err);
        if (err.status === 401) {
          logout();
        }
      }
    }, 60000); // 1 minute

    return () => clearInterval(interval);
  }, [autoSyncActive, autoSyncIds, session, logout]);

  const toggleAutoSync = () => {
    if (autoSyncActive) {
      setAutoSyncActive(false);
      localStorage.removeItem('ulogger_auto_sync_expiry');
    } else {
      setUloggerModalMode('autosync');
      setUloggerModalOpen(true);
    }
  };

  const startAutoSync = (ids: number[]) => {
    const numericIds = ids.map(Number);
    setAutoSyncIds(numericIds);
    localStorage.setItem('ulogger_auto_sync_ids', JSON.stringify(numericIds));
    
    if (numericIds.length > 0 && session) {
      setAutoSyncActive(true);
      localStorage.setItem('ulogger_auto_sync_expiry', String(Date.now() + 2 * 60 * 60 * 1000));
      uloggerService.syncAllPending(session.token, numericIds)
        .then(count => {
          if (count > 0) onImportComplete();
        })
        .catch(err => {
          if (err.status === 401) logout();
        });
    } else {
      setAutoSyncActive(false);
      localStorage.removeItem('ulogger_auto_sync_expiry');
    }
  };

  const openManualSync = () => {
    setUloggerModalMode('manual');
    setUloggerModalOpen(true);
  };

  const { explorationPercentage, refreshStats } = useExplorationStats(regionStats, fogRadius);
  const { tooltip } = useMapEvents(map, isMapReady);
  const { streets, isLoading: isLoadingStreets, geoService, refreshVisited } = useStreets(regionStats);
  const { isTracking, centerOnUser } = useUserLocation(map, isMapReady);

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

  const onImportComplete = async () => {
    refreshLayers();
    refreshStats();

    // Auto-center map on dense data area after import
    if (map.current) {
      try {
        const denseCenter = await databaseService.getDenseAreaCenter();
        if (denseCenter) {
          map.current.flyTo({
            center: [denseCenter.lng, denseCenter.lat],
            zoom: 13,
            essential: true,
            duration: 2000
          });
        }
      } catch (err) {
        console.error("Failed to auto-center map:", err);
      }
    }
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

  if (!session) return null; // Should be handled by parent

  return (
    <div className="app-container">
      <div id="map" ref={mapContainer} />

      <button 
        className={`my-location-btn ${isTracking ? 'active' : ''}`}
        onClick={centerOnUser}
        title={isTracking ? "Center on my location" : "Show my location"}
      >
        🎯
      </button>

      <div className="top-left-panel">
        <div style={{ 
          background: 'rgba(33, 150, 243, 0.9)', 
          padding: '8px 12px', 
          borderRadius: '6px', 
          color: 'white', 
          fontSize: '13px', 
          fontWeight: 'bold',
          boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
          borderLeft: '4px solid #fff',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: '15px'
        }}>
          <span>User: {session.username} ({session.role})</span>
          <button 
            onClick={logout}
            style={{ 
              background: 'rgba(255,255,255,0.2)', 
              border: 'none', 
              color: 'white', 
              fontSize: '10px', 
              padding: '4px 8px', 
              borderRadius: '4px', 
              cursor: 'pointer' 
            }}
          >
            Logout
          </button>
        </div>

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
        onUloggerClick={openManualSync}
        loading={loading}
        showGrid={showGrid}
        toggleGrid={toggleGrid}
        autoSyncActive={autoSyncActive}
        onToggleAutoSync={toggleAutoSync}
        isAdmin={session.role === 'admin'}
      />
      
      <UloggerSyncModal 
        isOpen={uloggerModalOpen} 
        onClose={() => setUloggerModalOpen(false)} 
        onImportComplete={onImportComplete}
        mode={uloggerModalMode}
        onStartAutoSync={startAutoSync}
        initialSelectedIds={autoSyncIds}
        isAdmin={session.role === 'admin'}
      />

      <input type="file" accept=".json,.gpx" ref={fileInputRef} onChange={handleFileSelect} style={{ display: 'none' }} />
    </div>
  );
}

/**
 * Auth Gatekeeper
 */
function Gatekeeper({ initError }: { initError: string | null }) {
  const { session } = useAuth();

  if (session === undefined) {
    return (
      <div style={{ height: '100dvh', width: '100vw', display: 'flex', justifyContent: 'center', alignItems: 'center', backgroundColor: '#1a1a1a', color: 'white' }}>
        <div className="loading">Verifying session...</div>
      </div>
    );
  }

  if (session === null) {
    return <LoginScreen />;
  }

  return <AppContent initError={initError} />;
}

/**
 * Main application component.
 */
function App() {
  const [initError, setInitError] = useState<string | null>(null);

  // Initialize database at the very top level so it's ready for login clearing
  useEffect(() => {
    databaseService.init().catch(err => {
      console.error("Critical Database Initialization Failure", err);
      setInitError(err.message || String(err));
    });
  }, []);

  return (
    <AuthProvider>
      <Gatekeeper initError={initError} />
    </AuthProvider>
  );
}

export default App;
