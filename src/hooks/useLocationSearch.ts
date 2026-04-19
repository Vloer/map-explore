import { useState } from 'react';
import maplibregl from 'maplibre-gl';
import type { RegionStats } from '../types';
import { PLACE_TYPES } from '../Config';

export function useLocationSearch(map: React.MutableRefObject<maplibregl.Map | null>) {
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [regionStats, setRegionStats] = useState<RegionStats | null>(null);

  const handleSearch = async (e?: React.FormEvent, overrideQuery?: string) => {
    e?.preventDefault();
    const query = overrideQuery || searchQuery;
    if (!query.trim() || !map.current) return;

    setIsSearching(true);
    try {
      const response = await fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&addressdetails=1&limit=10&polygon_geojson=1`);
      const results = await response.json();

      if (results && results.length > 0) {
        // Sort results by weight (lower = more detailed)
        const sortedResults = results.sort((a: any, b: any) => {
          const weightA = PLACE_TYPES[a.addresstype] || PLACE_TYPES[a.type] || 100;
          const weightB = PLACE_TYPES[b.addresstype] || PLACE_TYPES[b.type] || 100;
          return weightA - weightB;
        });

        const place = sortedResults[0];
        const [minLat, maxLat, minLng, maxLng] = place.boundingbox.map(Number);

        map.current.fitBounds([minLng, minLat, maxLng, maxLat], { padding: 50 });

        setRegionStats({
          name: place.display_name.split(',')[0],
          type: place.addresstype || place.type || place.class,
          geojson: place.geojson,
          bounds: [minLat, maxLat, minLng, maxLng]
        });

      } else {
        if (!overrideQuery) alert("Location not found");
      }
    } catch (err) {
      console.error("Search error:", err);
    } finally {
      setIsSearching(false);
    }
  };

  const reverseGeocode = async (lat: number, lng: number) => {
    setIsSearching(true);
    try {
      // Fetch address details but no polygon yet (we'll search for the polygon of the parent place)
      const response = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&addressdetails=1`);
      const result = await response.json();

      if (result && result.address) {
        const addr = result.address;
        
        // Find the best (smallest weight) place type in the address
        let bestWeight = 100;
        let bestName = '';

        for (const [key, name] of Object.entries(addr)) {
          const weight = PLACE_TYPES[key];
          if (weight !== undefined && weight < bestWeight) {
            bestWeight = weight;
            bestName = name as string;
          }
        }

        // If we found a relevant place type (like a village/town/city), search for it to get the full polygon
        if (bestName) {
          const searchParts = [bestName];
          if (addr.state) searchParts.push(addr.state);
          if (addr.country) searchParts.push(addr.country);
          
          const newQuery = searchParts.join(', ');
          setSearchQuery(newQuery);
          await handleSearch(undefined, newQuery);
          return;
        }

        // Fallback to the original result if no weighted place was found
        setRegionStats({
          name: result.display_name.split(',')[0],
          type: result.addresstype || result.type || result.class,
          geojson: result.geojson,
          bounds: result.boundingbox.map(Number)
        });
      }
    } catch (err) {
      console.error("Reverse geocode error:", err);
    } finally {
      setIsSearching(false);
    }
  };

  return { 
    searchQuery, 
    setSearchQuery, 
    isSearching, 
    regionStats, 
    setRegionStats,
    handleSearch,
    reverseGeocode
  };
}
