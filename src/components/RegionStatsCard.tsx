import type { RegionStats } from '../types';

interface RegionStatsCardProps {
  stats: RegionStats;
  percentage: number;
  onShowStreets: () => void;
}

export function RegionStatsCard({ stats, percentage, onShowStreets }: RegionStatsCardProps) {
  return (
    <div style={{
      background: 'rgba(255, 255, 255, 0.95)', padding: '15px',
      borderRadius: '8px', boxShadow: '0 2px 10px rgba(0,0,0,0.2)',
      minWidth: '250px'
    }}>
      <div style={{ fontSize: '16px', fontWeight: 'bold', color: '#333' }}>{stats.name}</div>
      <div style={{ fontSize: '12px', color: '#666', marginBottom: '10px', textTransform: 'capitalize' }}>{stats.type} exploration</div>
      <div style={{ height: '8px', width: '100%', background: '#eee', borderRadius: '4px', overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${percentage}%`, background: '#4CAF50', transition: 'width 0.8s ease' }} />
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '6px' }}>
        <button 
          onClick={onShowStreets}
          style={{
            background: '#2196F3',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            padding: '4px 8px',
            fontSize: '11px',
            cursor: 'pointer',
            fontWeight: 'bold'
          }}
        >
          Show Streets
        </button>
        <div style={{ fontSize: '12px', textAlign: 'right', fontWeight: 'bold' }}>
          {percentage.toFixed(2)}%
        </div>
      </div>
    </div>
  );
}
