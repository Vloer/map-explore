import React from 'react';
import type { ImportOptions } from '../types';

interface ImportModalProps {
  onStart: (options: ImportOptions) => void;
  onCancel: () => void;
}

export function ImportModal({ onStart, onCancel }: ImportModalProps) {
  return (
    <div style={{
      position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
      backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex',
      alignItems: 'center', justifyContent: 'center', zIndex: 1000
    }}>
      <div style={{ background: 'white', padding: '25px', borderRadius: '12px', maxWidth: '400px', width: '90%', boxShadow: '0 4px 20px rgba(0,0,0,0.3)' }}>
        <h3 style={{ margin: '0 0 15px 0' }}>Import Options</h3>
        <p style={{ fontSize: '14px', color: '#444', marginBottom: '20px' }}>How much detail do you want to import from your timeline?</p>
        <button onClick={() => onStart({ includeRawSignals: true, includeSemanticSegments: true })} style={{ width: '100%', padding: '12px', marginBottom: '10px', backgroundColor: '#4CAF50', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}>Full Detail (Raw + Semantic)</button>
        <button onClick={() => onStart({ includeRawSignals: false, includeSemanticSegments: true })} style={{ width: '100%', padding: '12px', marginBottom: '15px', backgroundColor: '#2196F3', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}>Semantic Segments Only (Cleaner)</button>
        <button onClick={onCancel} style={{ width: '100%', padding: '8px', backgroundColor: 'transparent', color: '#666', border: 'none', cursor: 'pointer', fontSize: '13px' }}>Cancel</button>
      </div>
    </div>
  );
}
