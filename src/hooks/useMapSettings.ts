import { useState, useCallback } from 'react';
import { APP_CONFIG } from '../Config';

export function useMapSettings(
  updateFogRadiusLayer: (r: number) => void, 
  updateHeatmapStrengthLayer: (s: number) => void, 
  toggleHeatmapLayerRaw: (e: boolean) => void, 
  updateSpeedFilterLayer: (min: number, max: number) => void
) {
  const [fogRadius, setFogRadius] = useState(() => {
    return parseInt(localStorage.getItem('fog_radius') || String(APP_CONFIG.BASE_FOG_REVEAL_RADIUS));
  });
  
  const [heatmapEnabled, setHeatmapEnabled] = useState(() => {
    return localStorage.getItem('heatmap_enabled') === 'true';
  });
  
  const [heatmapStrength, setHeatmapStrength] = useState(() => {
    return parseInt(localStorage.getItem('heatmap_strength') || String(APP_CONFIG.HEATMAP_STARTING_SENSITIVITY));
  });
  
  const [minSpeed, setMinSpeed] = useState(() => {
    const val = localStorage.getItem('min_speed_filter');
    return val !== null ? parseInt(val) : 0;
  });
  
  const [maxSpeed, setMaxSpeed] = useState(() => {
    const val = localStorage.getItem('max_speed_filter');
    return val !== null ? parseInt(val) : 200;
  });

  const handleRadiusChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseInt(e.target.value);
    setFogRadius(val);
    updateFogRadiusLayer(val);
    localStorage.setItem('fog_radius', String(val));
  }, [updateFogRadiusLayer]);

  const handleHeatmapStrengthChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseInt(e.target.value);
    setHeatmapStrength(val);
    updateHeatmapStrengthLayer(val);
    localStorage.setItem('heatmap_strength', String(val));
  }, [updateHeatmapStrengthLayer]);

  const onToggleHeatmap = useCallback(() => {
    const next = !heatmapEnabled;
    setHeatmapEnabled(next);
    toggleHeatmapLayerRaw(next);
    localStorage.setItem('heatmap_enabled', String(next));
  }, [heatmapEnabled, toggleHeatmapLayerRaw]);

  const handleMinSpeedChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseInt(e.target.value);
    setMinSpeed(val);
    updateSpeedFilterLayer(val, maxSpeed);
    localStorage.setItem('min_speed_filter', String(val));
  }, [maxSpeed, updateSpeedFilterLayer]);

  const handleMaxSpeedChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseInt(e.target.value);
    setMaxSpeed(val);
    updateSpeedFilterLayer(minSpeed, val);
    localStorage.setItem('max_speed_filter', String(val));
  }, [minSpeed, updateSpeedFilterLayer]);

  return {
    fogRadius,
    heatmapEnabled,
    heatmapStrength,
    minSpeed,
    maxSpeed,
    handleRadiusChange,
    handleHeatmapStrengthChange,
    onToggleHeatmap,
    handleMinSpeedChange,
    handleMaxSpeedChange
  };
}
