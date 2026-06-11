import { useState } from "react";
import { APP_CONFIG } from "../Config";
import { useAuth } from "../contexts/AuthContext";
import "./Controls.css";

interface ControlsProps {
  fogRadius: number;
  onRadiusChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  heatmapEnabled: boolean;
  heatmapStrength: number;
  onHeatmapStrengthChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  toggleHeatmap: () => void;
  onUploadClick: () => void;
  onClearDatabase: () => void;
  onExportDatabase: () => void;
  onUloggerClick: () => void;
  loading: boolean;
  showGrid: boolean;
  toggleGrid: (enabled: boolean) => void;
  minSpeed: number;
  maxSpeed: number;
  onMinSpeedChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onMaxSpeedChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  autoSyncActive: boolean;
  onToggleAutoSync: () => void;
  confirmClear: boolean;
  isAdmin: boolean;
}

/**
 * Bottom control panel for map settings, heatmap toggles, and data management.
 */
export function Controls({
  fogRadius,
  onRadiusChange,
  heatmapEnabled,
  heatmapStrength,
  onHeatmapStrengthChange,
  toggleHeatmap,
  onUploadClick,
  onClearDatabase,
  onExportDatabase,
  onUloggerClick,
  loading,
  showGrid,
  toggleGrid,
  minSpeed,
  maxSpeed,
  onMinSpeedChange,
  onMaxSpeedChange,
  autoSyncActive,
  onToggleAutoSync,
  confirmClear,
  isAdmin,
}: ControlsProps) {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const { logout } = useAuth();

  return (
    <div className={`controls-panel ${isCollapsed ? 'collapsed' : 'expanded'}`}>
      <div className={`controls-header ${!isCollapsed ? 'expanded' : ''}`}>
        <h4>
          {isCollapsed ? "Map Settings & Tools" : "Settings"}
        </h4>
        <div className="controls-header-actions">
          {isCollapsed && (
            <button onClick={logout} className="controls-btn-sm">
              LOGOUT
            </button>
          )}
          <button onClick={() => setIsCollapsed(!isCollapsed)} className="controls-btn-toggle">
            {isCollapsed ? "EXPAND ▲" : "COLLAPSE ▼"}
          </button>
        </div>
      </div>

      {!isCollapsed && (
        <div className="controls-body">
          {isAdmin && (
            <div className="controls-slider-group">
              <div className="controls-slider-header">
                <span>Fog Radius</span>
                <span className="controls-slider-val-blue">{fogRadius}m</span>
              </div>
              <input
                type="range"
                min={APP_CONFIG.MIN_FOG_REVEAL_RADIUS}
                max={APP_CONFIG.MAX_FOG_REVEAL_RADIUS}
                step={APP_CONFIG.RADIUS_SLIDER_STEP}
                value={fogRadius}
                onChange={onRadiusChange}
                style={{ width: "100%", cursor: "pointer" }}
              />
            </div>
          )}

          <div className="controls-slider-group">
            <div className="controls-slider-header">
              <span>Heatmap Sensitivity</span>
              <span className="controls-slider-val-orange">{heatmapStrength}</span>
            </div>
            <input
              type="range"
              min="2"
              max={APP_CONFIG.HEATMAP_MAX_VISITS}
              step="1"
              value={heatmapStrength}
              onChange={onHeatmapStrengthChange}
              disabled={!heatmapEnabled}
              style={{
                width: "100%",
                cursor: "pointer",
                opacity: heatmapEnabled ? 1 : 0.5,
              }}
            />
          </div>

          <div className="controls-actions-group">
            <button
              onClick={toggleHeatmap}
              className={`controls-btn ${heatmapEnabled ? "btn-heatmap-on" : "btn-heatmap-off"}`}
            >
              {heatmapEnabled ? "Hide Heatmap" : "Show Heatmap"}
            </button>

            {isAdmin && (
              <button
                onClick={() => toggleGrid(!showGrid)}
                className={`controls-btn ${showGrid ? "btn-grid-on" : "btn-grid-off"}`}
              >
                {showGrid ? "Hide Grid" : "Show Grid"}
              </button>
            )}

            <button onClick={onUloggerClick} className="controls-btn btn-cyan">
              Retrieve location data
            </button>

            <button
              onClick={onToggleAutoSync}
              className={`controls-btn ${autoSyncActive ? "btn-sync-on" : "btn-sync-off"}`}
            >
              {autoSyncActive ? "Auto-Sync: ON" : "Auto-Sync: OFF"}
            </button>

            <button
              onClick={onUploadClick}
              disabled={loading}
              className="controls-btn btn-blue"
            >
              {loading ? "Processing..." : "Import History"}
            </button>
            
            <div className="controls-filters-group">
              <div className="controls-slider-group">
                <div className="controls-slider-header-sm">
                  <span>Min Speed Filter</span>
                  <span className="controls-slider-val-yellow">{minSpeed} km/h</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="150"
                  step="1"
                  value={minSpeed}
                  onChange={onMinSpeedChange}
                  style={{ width: "100%", cursor: "pointer" }}
                />
              </div>
              <div className="controls-slider-group">
                <div className="controls-slider-header-sm">
                  <span>Max Speed Filter</span>
                  <span className="controls-slider-val-yellow">{maxSpeed} km/h</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="200"
                  step="1"
                  value={maxSpeed}
                  onChange={onMaxSpeedChange}
                  style={{ width: "100%", cursor: "pointer" }}
                />
              </div>
            </div>

            {isAdmin && (
              <>
                <button onClick={onExportDatabase} className="controls-btn btn-outline-green">
                  Export DB
                </button>

                <button
                  onClick={onClearDatabase}
                  className={`controls-btn ${confirmClear ? "btn-solid-red" : "btn-outline-red"}`}
                >
                  {confirmClear ? "CONFIRM RESET" : "Reset Data"}
                </button>
              </>
            )}

            <button onClick={logout} className="controls-btn btn-outline-gray">
              Logout
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
