import { useState } from 'react';
import type { RegionStats } from '../types';

interface RegionStatsCardProps {
  stats: RegionStats;
  percentage: number;
  visitedStreetsCount: number;
  totalStreetsCount: number;
  onShowStreets: () => void;
  onRefreshStreets: () => void;
  isRefreshing?: boolean;
}

/**
 * Information card for a specific geographic region (e.g., city, neighborhood).
 * Displays exploration progress percentage and provides access to the street list.
 * 
 * @param props Component properties containing stats, exploration percentage, and callbacks.
 */
export function RegionStatsCard({ stats, percentage, visitedStreetsCount, totalStreetsCount, onShowStreets, onRefreshStreets, isRefreshing }: RegionStatsCardProps) {
  const [isCollapsed, setIsCollapsed] = useState(false);

  const getProgressColor = (percent: number) => {
    // Map 0-100 to 0-120 hue (Red to Green in HSL)
    const hue = Math.min(120, Math.max(0, percent * 1.2));
    return `hsl(${hue}, 75%, 45%)`;
  };

  const streetPercentage = totalStreetsCount > 0 ? (visitedStreetsCount / totalStreetsCount) * 100 : 0;

  return (
    <div style={{
      background: 'rgba(255, 255, 255, 0.95)', 
      padding: isCollapsed ? '10px 15px' : '15px',
      borderRadius: '8px', 
      boxShadow: '0 2px 10px rgba(0,0,0,0.2)',
      width: '100%',
      maxWidth: '300px',
      boxSizing: 'border-box'
    }}>
      <style>
        {`
          @keyframes spin {
            from { transform: rotate(0deg); }
            to { transform: rotate(360deg); }
          }
        `}
      </style>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ cursor: 'pointer', flexGrow: 1 }} onClick={() => setIsCollapsed(!isCollapsed)}>
          <div style={{ fontSize: '15px', fontWeight: 'bold', color: '#333' }}>{stats.name}</div>
          {isCollapsed && (
            <div style={{ fontSize: '11px', color: getProgressColor(percentage), fontWeight: 'bold' }}>
              {percentage.toFixed(1)}% explored
            </div>
          )}
        </div>
        <div style={{ display: 'flex', gap: '5px' }}>
          <button 
            onClick={onRefreshStreets}
            disabled={isRefreshing}
            title="Recalculate visited streets"
            style={{
              background: 'none',
              border: 'none',
              cursor: isRefreshing ? 'default' : 'pointer',
              padding: '4px',
              color: '#2196F3',
              fontSize: '14px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              opacity: isRefreshing ? 0.5 : 1,
              animation: isRefreshing ? 'spin 1s linear infinite' : 'none'
            }}
          >
            🔄
          </button>
          <button 
            onClick={() => setIsCollapsed(!isCollapsed)}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              padding: '4px',
              color: '#666',
              fontSize: '12px',
            }}
          >
            {isCollapsed ? '▼' : '▲'}
          </button>
        </div>
      </div>
      
      {!isCollapsed && (
        <div style={{ marginTop: '10px' }}>
          <div style={{ fontSize: '11px', color: '#666', marginBottom: '10px', textTransform: 'capitalize' }}>
            {stats.type} exploration
          </div>

          <div style={{ marginBottom: '12px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: '#666', marginBottom: '4px' }}>
              <span>Exploration Progress</span>
              <span style={{ fontWeight: 'bold', color: getProgressColor(percentage) }}>{percentage.toFixed(2)}%</span>
            </div>
            <div style={{ height: '8px', width: '100%', background: '#eee', borderRadius: '4px', overflow: 'hidden' }}>
              <div style={{ 
                height: '100%', 
                width: `${percentage}%`, 
                background: getProgressColor(percentage), 
                transition: 'width 0.8s ease, background-color 0.8s ease' 
              }} />
            </div>
          </div>

          <div style={{ marginBottom: '15px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: '#666', marginBottom: '4px' }}>
              <span>Streets Visited</span>
              <span style={{ fontWeight: 'bold', color: getProgressColor(streetPercentage) }}>{visitedStreetsCount} / {totalStreetsCount}</span>
            </div>
            <div style={{ height: '8px', width: '100%', background: '#eee', borderRadius: '4px', overflow: 'hidden' }}>
              <div style={{ 
                height: '100%', 
                width: `${streetPercentage}%`, 
                background: getProgressColor(streetPercentage), 
                transition: 'width 0.8s ease, background-color 0.8s ease' 
              }} />
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-start', alignItems: 'center' }}>
            <button 
              onClick={onShowStreets}
              style={{
                background: '#2196F3',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                padding: '8px 12px',
                fontSize: '11px',
                cursor: 'pointer',
                fontWeight: 'bold',
                width: '100%'
              }}
            >
              View Street List
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
