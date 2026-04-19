import React from 'react';
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
  loading: boolean;
  importStatus: string;
}

export function Controls({
  fogRadius,
  onRadiusChange,
  heatmapEnabled,
  heatmapStrength,
  onHeatmapStrengthChange,
  toggleHeatmap,
  onUploadClick,
  onClearDatabase,
  loading,
  importStatus
}: ControlsProps) {
  return (
    <div id="controls" style={{
      position: 'absolute', bottom: '20px', left: '20px', zIndex: 20,
      background: 'white', padding: '15px', borderRadius: '8px',
      boxShadow: '0 2px 10px rgba(0,0,0,0.2)', width: '250px'
    }}>
      <h3 style={{ margin: '0 0 15px 0', fontSize: '18px' }}>World Fog of War</h3>
      <div style={{ marginBottom: '15px' }}>
        <label style={{ fontSize: '14px', display: 'block', marginBottom: '8px', fontWeight: 'bold' }}>Radius: {fogRadius}m</label>
        <input type="range" min={APP_CONFIG.MIN_FOG_REVEAL_RADIUS} max={APP_CONFIG.MAX_FOG_REVEAL_RADIUS} step={APP_CONFIG.RADIUS_SLIDER_STEP} value={fogRadius} onChange={onRadiusChange} style={{ width: '100%', cursor: 'pointer' }} />
      </div>
      {heatmapEnabled && (
        <div style={{ marginBottom: '15px' }}>
          <label style={{ fontSize: '14px', display: 'block', marginBottom: '8px', fontWeight: 'bold' }}>Heatmap sensitivity: {heatmapStrength}{heatmapStrength === APP_CONFIG.HEATMAP_MAX_VISITS ? "+" : ""}</label>
          <input type="range" min="1" max={APP_CONFIG.HEATMAP_MAX_VISITS} step="1" value={heatmapStrength} onChange={onHeatmapStrengthChange} style={{ width: '100%', cursor: 'pointer' }} />
        </div>
      )}
      <button onClick={toggleHeatmap} style={{ width: '100%', padding: '10px', backgroundColor: heatmapEnabled ? '#ff4444' : '#2196F3', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '14px', fontWeight: 'bold', marginBottom: '15px' }}>{heatmapEnabled ? 'Disable Heatmap' : 'Enable Heatmap'}</button>
      <button onClick={onUploadClick} disabled={loading} style={{ width: '100%', padding: '10px', backgroundColor: loading ? '#ccc' : '#4CAF50', color: 'white', border: 'none', borderRadius: '4px', cursor: loading ? 'not-allowed' : 'pointer', fontSize: '14px', fontWeight: 'bold', marginBottom: '10px' }}>{loading ? 'Processing...' : 'Upload Google location data'}</button>
      <button onClick={onClearDatabase} disabled={loading} style={{ width: '100%', padding: '10px', backgroundColor: 'transparent', color: '#ff4444', border: '1px solid #ff4444', borderRadius: '4px', cursor: loading ? 'not-allowed' : 'pointer', fontSize: '13px', fontWeight: 'normal' }}>Clear All Data</button>
      {importStatus && <p style={{ fontSize: '12px', marginTop: '10px', color: '#666', textAlign: 'center' }}>{importStatus}</p>}
    </div>
  );
}
