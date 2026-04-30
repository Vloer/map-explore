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
  loading: boolean;
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
  loading
}: ControlsProps) {
  return (
    <div style={{
      position: 'absolute',
      bottom: '30px',
      left: '20px',
      right: '20px',
      backgroundColor: 'rgba(26, 26, 26, 0.9)',
      padding: '20px',
      borderRadius: '12px',
      color: 'white',
      display: 'flex',
      flexWrap: 'wrap',
      gap: '30px',
      zIndex: 10,
      border: '1px solid #333',
      boxShadow: '0 4px 20px rgba(0,0,0,0.4)'
    }}>
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

      <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
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
            transition: 'all 0.2s'
          }}
        >
          {heatmapEnabled ? 'Hide Heatmap' : 'Show Heatmap'}
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
            opacity: loading ? 0.6 : 1
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
            fontWeight: '600'
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
            fontWeight: '600'
          }}
        >
          Reset Data
        </button>
      </div>
    </div>
  );
}
