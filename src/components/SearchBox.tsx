import React from 'react';

interface SearchBoxProps {
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  handleSearch: (e: React.FormEvent) => void;
  isSearching: boolean;
}

/**
 * Input field for searching geographic locations.
 * Uses Nominatim (OSM) for geocoding through the useLocationSearch hook.
 * 
 * @param props Component properties containing search state and handlers.
 */
export function SearchBox({ searchQuery, setSearchQuery, handleSearch, isSearching }: SearchBoxProps) {
  return (
    <form onSubmit={handleSearch} style={{ display: 'flex', gap: '5px' }}>
      <input
        type="text"
        placeholder="Search location..."
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
        style={{ padding: '8px 12px', borderRadius: '4px', border: 'none', boxShadow: '0 2px 5px rgba(0,0,0,0.2)', width: '200px' }}
      />
      <button type="submit" disabled={isSearching} style={{ padding: '8px 12px', background: '#2196F3', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}>
        {isSearching ? '...' : 'Search'}
      </button>
    </form>
  );
}
