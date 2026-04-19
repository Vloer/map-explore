import { useState } from 'react';
import type { Street } from '../types';

interface StreetListModalProps {
  streets: Street[];
  onStreetClick: (street: Street) => void;
  onClose: () => void;
  isLoading: boolean;
  regionName: string;
}

export function StreetListModal({ streets, onStreetClick, onClose, isLoading, regionName }: StreetListModalProps) {
  const [filter, setFilter] = useState('');

  const filteredStreets = streets.filter(s => 
    s.name.toLowerCase().includes(filter.toLowerCase())
  );

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(0,0,0,0.7)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1000,
      padding: '20px'
    }}>
      <div style={{
        backgroundColor: '#2a2a2e',
        borderRadius: '12px',
        width: '100%',
        maxWidth: '500px',
        maxHeight: '80vh',
        display: 'flex',
        flexDirection: 'column',
        color: 'white',
        boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
        border: '1px solid #444'
      }}>
        <div style={{ padding: '20px', borderBottom: '1px solid #444', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={{ margin: 0, fontSize: '1.2rem' }}>Streets in {regionName}</h2>
          <button onClick={onClose} style={{ 
            background: 'none', 
            border: 'none', 
            color: '#aaa', 
            fontSize: '1.5rem', 
            cursor: 'pointer',
            padding: '0 5px'
          }}>&times;</button>
        </div>

        <div style={{ padding: '15px' }}>
          <input 
            type="text" 
            placeholder="Search streets..." 
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            style={{
              width: '100%',
              padding: '10px 15px',
              borderRadius: '6px',
              border: '1px solid #444',
              backgroundColor: '#1a1a1e',
              color: 'white',
              fontSize: '1rem',
              boxSizing: 'border-box'
            }}
          />
        </div>

        <div style={{ flexGrow: 1, overflowY: 'auto', padding: '0 15px 15px' }}>
          {isLoading ? (
            <div style={{ textAlign: 'center', padding: '20px', color: '#aaa' }}>Loading streets...</div>
          ) : streets.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '20px', color: '#aaa' }}>No streets found.</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
              {filteredStreets.map((street, idx) => (
                <div 
                  key={`${street.name}-${idx}`}
                  onClick={() => onStreetClick(street)}
                  style={{
                    padding: '12px 15px',
                    borderRadius: '6px',
                    backgroundColor: '#3a3a40',
                    cursor: 'pointer',
                    transition: 'background-color 0.2s',
                    fontSize: '0.95rem'
                  }}
                  onMouseOver={(e) => (e.currentTarget.style.backgroundColor = '#4a4a50')}
                  onMouseOut={(e) => (e.currentTarget.style.backgroundColor = '#3a3a40')}
                >
                  {street.name}
                  <div style={{ fontSize: '0.75rem', color: '#888', marginTop: '2px' }}>
                    {street.street_type}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
        
        <div style={{ padding: '15px', borderTop: '1px solid #444', textAlign: 'right' }}>
           <span style={{ fontSize: '0.8rem', color: '#888' }}>
             Total: {streets.length} streets
           </span>
        </div>
      </div>
    </div>
  );
}
