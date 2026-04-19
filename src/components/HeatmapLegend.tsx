import React from 'react';

interface HeatmapLegendProps {
  heatmapStrength: number;
}

export function HeatmapLegend({ heatmapStrength }: HeatmapLegendProps) {
  return (
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
  );
}
