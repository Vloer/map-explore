import { useState } from 'react';
import { APP_CONFIG } from '../Config';

interface ControlsProps {
  fogRadius: number;
  onRadiusChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  heatmapEnabled: boolean;
  heatmapStrength: number;
  onHeatmapStrengthChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  toggleHeatmap: () => void;
  onUploadClick: () => void;
  onClearDatabase: () => void;
  onExportDatabase: () => void;
  onUloggerClick: () => void;
  loading: boolean;
  showGrid: boolean;
  toggleGrid: (enabled: boolean) => void;
  autoSyncActive: boolean;
  onToggleAutoSync: () => void;
}

/**
 * Bottom control panel for map settings, heatmap toggles, and data management.
 * 
 * @param props Component properties for controlling various map features.
 */
export function Controls({ 
  fogRadius, 
  onRadiusChange, 
  heatmapEnabled, 
  heatmapStrength, 
  onHeatmapStrengthChange, 
  toggleHeatmap,
  onUploadClick,
  onClearDatabase,
  onExportDatabase,
  onUloggerClick,
  loading,
  showGrid,
  toggleGrid,
  autoSyncActive,
  onToggleAutoSync
}: ControlsProps) {
  const [isCollapsed, setIsCollapsed] = useState(false);

  return (
    <div style={{
      position: 'absolute',
      bottom: 'calc(20px + env(safe-area-inset-bottom, 0px))',
      left: 'calc(10px + env(safe-area-inset-left, 0px))',
      right: 'calc(10px + env(safe-area-inset-right, 0px))',
      backgroundColor: 'rgba(26, 26, 26, 0.95)',
      padding: isCollapsed ? '10px 20px' : '20px',
      paddingBottom: isCollapsed ? '10px' : 'calc(20px + env(safe-area-inset-bottom, 0px))',
      borderRadius: '12px',
      color: 'white',
      display: 'flex',
      flexDirection: 'column',
      gap: isCollapsed ? '0' : '20px',
      zIndex: 10,
      border: '1px solid #333',
      boxShadow: '0 4px 20px rgba(0,0,0,0.4)',
      transition: 'all 0.3s ease-in-out',
      maxHeight: isCollapsed ? '50px' : '70vh',
      overflow: 'hidden'
    }}>
      <div style={{ 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'center',
        width: '100%',
        paddingBottom: isCollapsed ? '0' : '10px'
      }}>
        <h4 style={{ margin: 0, fontSize: '14px', color: '#888' }}>
          {isCollapsed ? 'Map Settings & Tools' : 'Settings'}
        </h4>
        <button 
          onClick={() => setIsCollapsed(!isCollapsed)}
          style={{
            background: 'none',
            border: 'none',
            color: '#2196F3',
            cursor: 'pointer',
            fontSize: '12px',
            fontWeight: 'bold',
            padding: '5px'
          }}
        >
          {isCollapsed ? 'EXPAND ▲' : 'COLLAPSE ▼'}
        </button>
      </div>

      {!isCollapsed && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '30px' }}>
          <div style={{ flex: '1 1 200px' }}>
            <div style={{ marginBottom: '8px', display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
              <span>Fog Radius</span>
              <span style={{ color: '#2196F3', fontWeight: 'bold' }}>{fogRadius}m</span>
            </div>
            <input 
              type="range" 
              min={APP_CONFIG.MIN_FOG_REVEAL_RADIUS} 
              max={APP_CONFIG.MAX_FOG_REVEAL_RADIUS} 
              step={APP_CONFIG.RADIUS_SLIDER_STEP} 
              value={fogRadius} 
              onChange={onRadiusChange}
              style={{ width: '100%', cursor: 'pointer' }}
            />
          </div>

          <div style={{ flex: '1 1 200px' }}>
            <div style={{ marginBottom: '8px', display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
              <span>Heatmap Sensitivity</span>
              <span style={{ color: '#FF5722', fontWeight: 'bold' }}>{heatmapStrength}</span>
            </div>
            <input 
              type="range" 
              min="2" 
              max={APP_CONFIG.HEATMAP_MAX_VISITS} 
              step="1" 
              value={heatmapStrength} 
              onChange={onHeatmapStrengthChange}
              disabled={!heatmapEnabled}
              style={{ width: '100%', cursor: 'pointer', opacity: heatmapEnabled ? 1 : 0.5 }}
            />
          </div>

          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '10px', width: '100%' }}>
            <button 
              onClick={toggleHeatmap}
              style={{
                backgroundColor: heatmapEnabled ? '#FF5722' : '#444',
                color: 'white',
                border: 'none',
                borderRadius: '6px',
                padding: '8px 16px',
                cursor: 'pointer',
                fontSize: '13px',
                fontWeight: '600',
                transition: 'all 0.2s',
                flex: '1 1 auto'
              }}
            >
              {heatmapEnabled ? 'Hide Heatmap' : 'Show Heatmap'}
            </button>

            <button 
              onClick={() => toggleGrid(!showGrid)}
              style={{
                backgroundColor: showGrid ? '#9C27B0' : '#444',
                color: 'white',
                border: 'none',
                borderRadius: '6px',
                padding: '8px 16px',
                cursor: 'pointer',
                fontSize: '13px',
                fontWeight: '600',
                transition: 'all 0.2s',
                flex: '1 1 auto'
              }}
            >
              {showGrid ? 'Hide Grid' : 'Show Grid'}
            </button>

            <button 
              onClick={onUloggerClick}
              style={{
                backgroundColor: '#00e5ff',
                color: '#000',
                border: 'none',
                borderRadius: '6px',
                padding: '8px 16px',
                cursor: 'pointer',
                fontSize: '13px',
                fontWeight: '600',
                flex: '1 1 auto'
              }}
            >
              Sync Ulogger
            </button>

            <button 
              onClick={onToggleAutoSync}
              style={{
                backgroundColor: autoSyncActive ? '#4CAF50' : '#444',
                color: 'white',
                border: 'none',
                borderRadius: '6px',
                padding: '8px 16px',
                cursor: 'pointer',
                fontSize: '13px',
                fontWeight: '600',
                flex: '1 1 auto'
              }}
            >
              {autoSyncActive ? 'Auto-Sync: ON' : 'Auto-Sync: OFF'}
            </button>

            <button 
              onClick={onUploadClick}
              disabled={loading}
              style={{
                backgroundColor: '#2196F3',
                color: 'white',
                border: 'none',
                borderRadius: '6px',
                padding: '8px 16px',
                cursor: 'pointer',
                fontSize: '13px',
                fontWeight: '600',
                opacity: loading ? 0.6 : 1,
                flex: '1 1 auto'
              }}
            >
              {loading ? 'Processing...' : 'Import History'}
            </button>

            <button 
              onClick={onExportDatabase}
              style={{
                backgroundColor: 'transparent',
                color: '#4CAF50',
                border: '1px solid #4CAF50',
                borderRadius: '6px',
                padding: '8px 16px',
                cursor: 'pointer',
                fontSize: '13px',
                fontWeight: '600',
                flex: '1 1 auto'
              }}
            >
              Export DB
            </button>

            <button 
              onClick={onClearDatabase}
              style={{
                backgroundColor: 'transparent',
                color: '#f44336',
                border: '1px solid #f44336',
                borderRadius: '6px',
                padding: '8px 16px',
                cursor: 'pointer',
                fontSize: '13px',
                fontWeight: '600',
                flex: '1 1 auto'
              }}
            >
              Reset Data
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
