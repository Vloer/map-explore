import { useState, useMemo } from 'react';
import type { Street } from '../types';

interface StreetListPanelProps {
  streets: Street[];
  onStreetClick: (street: Street) => void;
  isLoading: boolean;
  regionName: string;
  isVisible: boolean;
  onToggle: () => void;
}

const INITIAL_PAGE_SIZE = 100;
const PAGE_INCREMENT = 100;

/**
 * Sidebar panel that displays a list of streets in the currently selected region.
 * Provides filtering capabilities and allows clicking a street to center it on the map.
 * Uses incremental loading to prevent UI freezes with large street lists.
 * 
 * @param props Component properties containing street data, loading state, and visibility toggles.
 */
export function StreetListPanel({ streets, onStreetClick, isLoading, regionName, isVisible, onToggle }: StreetListPanelProps) {
  const [filter, setFilter] = useState('');
  const [showOnlyUnvisited, setShowOnlyUnvisited] = useState(false);
  const [visibleCount, setVisibleCount] = useState(INITIAL_PAGE_SIZE);

  const filteredStreets = useMemo(() => {
    const lowerFilter = filter.toLowerCase();
    return streets
      .filter(s => {
        const matchesFilter = s.name.toLowerCase().includes(lowerFilter);
        const matchesVisited = showOnlyUnvisited ? !s.visited : true;
        return matchesFilter && matchesVisited;
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [streets, filter, showOnlyUnvisited]);

  if (!isVisible) return null;

  const displayStreets = filteredStreets.slice(0, visibleCount);
  const hasMore = visibleCount < filteredStreets.length;

  return (
    <div style={{
      backgroundColor: 'rgba(42, 42, 46, 0.95)',
      borderRadius: '8px',
      width: '100%',
      maxWidth: '320px',
      maxHeight: '50vh',
      display: 'flex',
      flexDirection: 'column',
      color: 'white',
      boxShadow: '0 4px 15px rgba(0,0,0,0.3)',
      border: '1px solid #444',
      overflow: 'hidden',
      marginTop: '10px',
      animation: 'slideDown 0.3s ease-out',
      boxSizing: 'border-box'
    }}>
      <div style={{ padding: '12px 15px', borderBottom: '1px solid #444', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#3a3a40' }}>
        <h3 style={{ margin: 0, fontSize: '0.9rem' }}>Streets in {regionName}</h3>
        <button onClick={onToggle} style={{ 
          background: 'none', 
          border: 'none', 
          color: '#aaa', 
          fontSize: '1.2rem', 
          cursor: 'pointer',
          padding: '0 5px'
        }}>&times;</button>
      </div>

      <div style={{ padding: '10px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
        <input 
          type="text" 
          placeholder="Search streets..." 
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          style={{
            width: '100%',
            padding: '8px 12px',
            borderRadius: '4px',
            border: '1px solid #444',
            backgroundColor: '#1a1a1e',
            color: 'white',
            fontSize: '0.9rem',
            boxSizing: 'border-box'
          }}
        />
        <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.8rem', color: '#ccc', cursor: 'pointer' }}>
          <input 
            type="checkbox" 
            checked={showOnlyUnvisited} 
            onChange={(e) => setShowOnlyUnvisited(e.target.checked)}
            style={{ cursor: 'pointer' }}
          />
          Only show unvisited streets
        </label>
      </div>

      <div style={{ flexGrow: 1, overflowY: 'auto', padding: '0 10px 10px' }}>
        {isLoading ? (
          <div style={{ textAlign: 'center', padding: '20px', color: '#aaa', fontSize: '0.9rem' }}>Loading streets...</div>
        ) : filteredStreets.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '20px', color: '#aaa', fontSize: '0.9rem' }}>No streets found.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
            {displayStreets.map((street, idx) => (
              <div 
                key={`${street.name}-${idx}`}
                onClick={() => onStreetClick(street)}
                style={{
                  padding: '8px 12px',
                  borderRadius: '4px',
                  backgroundColor: 'transparent',
                  cursor: 'pointer',
                  transition: 'background-color 0.2s',
                  fontSize: '0.85rem',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center'
                }}
                onMouseOver={(e) => (e.currentTarget.style.backgroundColor = '#4a4a50')}
                onMouseOut={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
              >
                <span style={{ 
                  textDecoration: street.visited ? 'none' : 'none',
                  color: street.visited ? '#4CAF50' : 'white'
                }}>
                  {street.name}
                </span>
                {street.visited && <span style={{ color: '#4CAF50', fontWeight: 'bold' }}>✓</span>}
              </div>
            ))}
            
            {hasMore && (
              <button 
                onClick={() => setVisibleCount(prev => prev + PAGE_INCREMENT)}
                style={{
                  padding: '10px',
                  marginTop: '5px',
                  backgroundColor: '#3a3a40',
                  color: '#2196F3',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontSize: '0.8rem',
                  fontWeight: 'bold'
                }}
              >
                Load more ({filteredStreets.length - visibleCount} remaining)
              </button>
            )}
          </div>
        )}
      </div>
      
      <div style={{ padding: '8px 12px', borderTop: '1px solid #444', textAlign: 'right', background: '#1a1a1e' }}>
         <span style={{ fontSize: '0.75rem', color: '#888' }}>
           {filteredStreets.length} streets found
         </span>
      </div>
    </div>
  );
}
