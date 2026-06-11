import { useState } from "react";
import { APP_CONFIG } from "../Config";
import { useAuth } from "../contexts/AuthContext";

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
    <div
      style={{
        position: "absolute",
        bottom: "10px",
        left: "calc(10px + env(safe-area-inset-left, 0px))",
        right: "calc(10px + env(safe-area-inset-right, 0px))",
        backgroundColor: "rgba(26, 26, 26, 0.95)",
        padding: isCollapsed ? "10px 20px" : "15px 20px",
        borderRadius: "12px",
        color: "white",
        display: "flex",
        flexDirection: "column",
        gap: isCollapsed ? "0" : "15px",
        zIndex: 10,
        border: "1px solid #333",
        boxShadow: "0 4px 20px rgba(0,0,0,0.4)",
        transition: "all 0.3s ease-in-out",
        maxHeight: isCollapsed ? "50px" : "85vh",
        overflowY: "auto",
        marginBottom: "env(safe-area-inset-bottom, 0px)",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          width: "100%",
          paddingBottom: isCollapsed ? "0" : "10px",
        }}
      >
        <h4 style={{ margin: 0, fontSize: "14px", color: "#888" }}>
          {isCollapsed ? "Map Settings & Tools" : "Settings"}
        </h4>
        <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
          {isCollapsed && (
            <button
              onClick={logout}
              style={{
                background: "none",
                border: "1px solid #444",
                color: "#888",
                cursor: "pointer",
                fontSize: "10px",
                padding: "2px 8px",
                borderRadius: "4px",
              }}
            >
              LOGOUT
            </button>
          )}
          <button
            onClick={() => setIsCollapsed(!isCollapsed)}
            style={{
              background: "none",
              border: "none",
              color: "#2196F3",
              cursor: "pointer",
              fontSize: "12px",
              fontWeight: "bold",
              padding: "5px",
            }}
          >
            {isCollapsed ? "EXPAND ▲" : "COLLAPSE ▼"}
          </button>
        </div>
      </div>

      {!isCollapsed && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: "30px" }}>
          {isAdmin && (
            <div style={{ flex: "1 1 200px" }}>
              <div
                style={{
                  marginBottom: "8px",
                  display: "flex",
                  justifyContent: "space-between",
                  fontSize: "13px",
                }}
              >
                <span>Fog Radius</span>
                <span style={{ color: "#2196F3", fontWeight: "bold" }}>
                  {fogRadius}m
                </span>
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

          <div style={{ flex: "1 1 200px" }}>
            <div
              style={{
                marginBottom: "8px",
                display: "flex",
                justifyContent: "space-between",
                fontSize: "13px",
              }}
            >
              <span>Heatmap Sensitivity</span>
              <span style={{ color: "#FF5722", fontWeight: "bold" }}>
                {heatmapStrength}
              </span>
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

          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              alignItems: "center",
              gap: "10px",
              width: "100%",
            }}
          >
            <button
              onClick={toggleHeatmap}
              style={{
                backgroundColor: heatmapEnabled ? "#FF5722" : "#444",
                color: "white",
                border: "none",
                borderRadius: "6px",
                padding: "8px 16px",
                cursor: "pointer",
                fontSize: "13px",
                fontWeight: "600",
                transition: "all 0.2s",
                flex: "1 1 auto",
              }}
            >
              {heatmapEnabled ? "Hide Heatmap" : "Show Heatmap"}
            </button>

            {isAdmin && (
              <button
                onClick={() => toggleGrid(!showGrid)}
                style={{
                  backgroundColor: showGrid ? "#9C27B0" : "#444",
                  color: "white",
                  border: "none",
                  borderRadius: "6px",
                  padding: "8px 16px",
                  cursor: "pointer",
                  fontSize: "13px",
                  fontWeight: "600",
                  transition: "all 0.2s",
                  flex: "1 1 auto",
                }}
              >
                {showGrid ? "Hide Grid" : "Show Grid"}
              </button>
            )}

            <button
              onClick={onUloggerClick}
              style={{
                backgroundColor: "#00e5ff",
                color: "#000",
                border: "none",
                borderRadius: "6px",
                padding: "8px 16px",
                cursor: "pointer",
                fontSize: "13px",
                fontWeight: "600",
                flex: "1 1 auto",
              }}
            >
              Retrieve location data
            </button>

            <button
              onClick={onToggleAutoSync}
              style={{
                backgroundColor: autoSyncActive ? "#4CAF50" : "#444",
                color: "white",
                border: "none",
                borderRadius: "6px",
                padding: "8px 16px",
                cursor: "pointer",
                fontSize: "13px",
                fontWeight: "600",
                flex: "1 1 auto",
              }}
            >
              {autoSyncActive ? "Auto-Sync: ON" : "Auto-Sync: OFF"}
            </button>

            <button
              onClick={onUploadClick}
              disabled={loading}
              style={{
                backgroundColor: "#2196F3",
                color: "white",
                border: "none",
                borderRadius: "6px",
                padding: "8px 16px",
                cursor: "pointer",
                fontSize: "13px",
                fontWeight: "600",
                opacity: loading ? 0.6 : 1,
                flex: "1 1 auto",
              }}
            >
              {loading ? "Processing..." : "Import History"}
            </button>
            
            <div style={{ width: "100%", display: "flex", flexWrap: "wrap", gap: "20px", padding: "10px 0", borderTop: "1px solid #333", borderBottom: "1px solid #333", marginTop: "10px" }}>
              <div style={{ flex: "1 1 200px" }}>
                <div style={{ marginBottom: "8px", display: "flex", justifyContent: "space-between", fontSize: "12px", color: "#aaa" }}>
                  <span>Min Speed Filter</span>
                  <span style={{ color: "#FFEB3B", fontWeight: "bold" }}>{minSpeed} km/h</span>
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
              <div style={{ flex: "1 1 200px" }}>
                <div style={{ marginBottom: "8px", display: "flex", justifyContent: "space-between", fontSize: "12px", color: "#aaa" }}>
                  <span>Max Speed Filter</span>
                  <span style={{ color: "#FFEB3B", fontWeight: "bold" }}>{maxSpeed} km/h</span>
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
                <button
                  onClick={onExportDatabase}
                  style={{
                    backgroundColor: "transparent",
                    color: "#4CAF50",
                    border: "1px solid #4CAF50",
                    borderRadius: "6px",
                    padding: "8px 16px",
                    cursor: "pointer",
                    fontSize: "13px",
                    fontWeight: "600",
                    flex: "1 1 auto",
                  }}
                >
                  Export DB
                </button>

                <button
                  onClick={() => {
                    console.log('[DEBUG] Reset Data button clicked in UI. confirmClear:', confirmClear);
                    onClearDatabase();
                  }}
                  style={{
                    backgroundColor: confirmClear ? "#f44336" : "transparent",
                    color: confirmClear ? "#fff" : "#f44336",
                    border: "1px solid #f44336",
                    borderRadius: "6px",
                    padding: "8px 16px",
                    cursor: "pointer",
                    fontSize: "13px",
                    fontWeight: "bold",
                    flex: "1 1 auto",
                    transition: "all 0.2s"
                  }}
                >
                  {confirmClear ? "CONFIRM RESET" : "Reset Data"}
                </button>
              </>
            )}

            <button
              onClick={logout}
              style={{
                backgroundColor: "rgba(255,255,255,0.1)",
                color: "#aaa",
                border: "1px solid #444",
                borderRadius: "6px",
                padding: "8px 16px",
                cursor: "pointer",
                fontSize: "13px",
                fontWeight: "600",
                flex: "1 1 auto",
              }}
            >
              Logout
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
