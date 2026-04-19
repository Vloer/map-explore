import { useState } from 'react';
import type { Street } from '../types';

interface StreetListPanelProps {
  streets: Street[];
  onStreetClick: (street: Street) => void;
  isLoading: boolean;
  regionName: string;
  isVisible: boolean;
  onToggle: () => void;
}

/**
 * Sidebar panel that displays a list of streets in the currently selected region.
 * Provides filtering capabilities and allows clicking a street to center it on the map.
 * 
 * @param props Component properties containing street data, loading state, and visibility toggles.
 */
export function StreetListPanel({ streets, onStreetClick, isLoading, regionName, isVisible, onToggle }: StreetListPanelProps) {
  const [filter, setFilter] = useState('');

  const filteredStreets = streets.filter(s => 
    s.name.toLowerCase().includes(filter.toLowerCase())
  );

  if (!isVisible) return null;

  return (
    <div style={{
      backgroundColor: 'rgba(42, 42, 46, 0.95)',
      borderRadius: '8px',
      width: '320px',
      maxHeight: '60vh',
      display: 'flex',
      flexDirection: 'column',
      color: 'white',
      boxShadow: '0 4px 15px rgba(0,0,0,0.3)',
      border: '1px solid #444',
      overflow: 'hidden',
      marginTop: '10px',
      animation: 'slideDown 0.3s ease-out'
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

      <div style={{ padding: '10px' }}>
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
      </div>

      <div style={{ flexGrow: 1, overflowY: 'auto', padding: '0 10px 10px' }}>
        {isLoading ? (
          <div style={{ textAlign: 'center', padding: '20px', color: '#aaa', fontSize: '0.9rem' }}>Loading streets...</div>
        ) : streets.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '20px', color: '#aaa', fontSize: '0.9rem' }}>No streets found.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
            {filteredStreets.map((street, idx) => (
              <div 
                key={`${street.name}-${idx}`}
                onClick={() => onStreetClick(street)}
                style={{
                  padding: '8px 12px',
                  borderRadius: '4px',
                  backgroundColor: 'transparent',
                  cursor: 'pointer',
                  transition: 'background-color 0.2s',
                  fontSize: '0.85rem'
                }}
                onMouseOver={(e) => (e.currentTarget.style.backgroundColor = '#4a4a50')}
                onMouseOut={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
              >
                {street.name}
              </div>
            ))}
          </div>
        )}
      </div>
      
      <div style={{ padding: '8px 12px', borderTop: '1px solid #444', textAlign: 'right', background: '#1a1a1e' }}>
         <span style={{ fontSize: '0.75rem', color: '#888' }}>
           Total: {streets.length}
         </span>
      </div>
    </div>
  );
}
