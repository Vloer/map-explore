import { useState, useEffect, useRef } from 'react';
import maplibregl from 'maplibre-gl';

/**
 * Hook to manage the user's geolocation and display a marker on the map.
 */
export function useUserLocation(map: React.RefObject<maplibregl.Map | null>, isMapReady: boolean) {
  const [isTracking, setIsTracking] = useState(false);
  const markerRef = useRef<maplibregl.Marker | null>(null);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    if (!isMapReady || !map.current) return;

    // Initialize custom HTML marker for the user's location
    const el = document.createElement('div');
    el.className = 'user-location-marker';
    markerRef.current = new maplibregl.Marker({ element: el });

    return () => {
      markerRef.current?.remove();
      if (timerRef.current) window.clearInterval(timerRef.current);
    };
  }, [isMapReady, map]);

  const updateLocation = (centerMap: boolean = false) => {
    if (!navigator.geolocation) {
      alert("Geolocation is not supported by your browser");
      setIsTracking(false);
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const lngLat: [number, number] = [position.coords.longitude, position.coords.latitude];
        
        if (markerRef.current && map.current) {
          // Always update coordinates
          markerRef.current.setLngLat(lngLat);
          
          // Ensure it's on the map
          if (!markerRef.current.getElement().parentNode) {
            markerRef.current.addTo(map.current);
          }
          
          if (centerMap) {
            map.current.flyTo({ center: lngLat, zoom: 16, essential: true, duration: 1000 });
          }
        }
      },
      (error) => {
        console.error("Error getting location", error);
        if (error.code === error.PERMISSION_DENIED) {
          alert("Location permission denied. Please enable it in your browser settings.");
        } else {
          console.warn("Location check failed, retrying on next tick...");
        }
        // Don't turn off tracking on timeout or temporary errors, only on explicit denial
        if (error.code === error.PERMISSION_DENIED) {
          setIsTracking(false);
        }
      },
      { enableHighAccuracy: true, timeout: 5000, maximumAge: 0 }
    );
  };

  useEffect(() => {
    if (isTracking) {
      // Fetch immediately and center the map
      updateLocation(true);
      // Then fetch every 10 seconds without forcing the map center
      timerRef.current = window.setInterval(() => updateLocation(false), 10000);
    } else {
      if (timerRef.current) {
        window.clearInterval(timerRef.current);
        timerRef.current = null;
      }
      // Remove marker from map when tracking is off
      markerRef.current?.remove();
    }

    return () => {
      if (timerRef.current) window.clearInterval(timerRef.current);
    };
  }, [isTracking]);

  const toggleTracking = () => {
    setIsTracking(!isTracking);
  };

  const centerOnUser = () => {
    if (isTracking) {
      updateLocation(true); // Force a recenter if already tracking
    } else {
      setIsTracking(true); // Turns on tracking, which triggers the effect
    }
  };

  return { isTracking, toggleTracking, centerOnUser };
}
