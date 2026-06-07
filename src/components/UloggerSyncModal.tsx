import React, { useState, useEffect } from 'react';
import { uloggerService, type UloggerTrack } from '../services/UloggerService';
import { databaseService } from '../services/DatabaseService';
import { importService } from '../services/ImportService';
import './UloggerSyncModal.css';

interface UloggerSyncModalProps {
  isOpen: boolean;
  onClose: () => void;
  onImportComplete: () => void;
  mode?: 'manual' | 'autosync';
  onStartAutoSync?: (ids: number[]) => void;
  initialSelectedIds?: number[];
}

export const UloggerSyncModal: React.FC<UloggerSyncModalProps> = ({ 
  isOpen, 
  onClose, 
  onImportComplete,
  mode = 'manual',
  onStartAutoSync,
  initialSelectedIds = []
}) => {
  const [tracks, setTracks] = useState<UloggerTrack[]>([]);
  const [syncedTracks, setSyncedTracks] = useState<Map<number, string>>(new Map());
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    if (isOpen) {
      loadTracks();
    }
  }, [isOpen]);

  const loadTracks = async () => {
    setLoading(true);
    setError(null);
    try {
      const [remoteTracks, localSyncedMap] = await Promise.all([
        uloggerService.listTracks(),
        databaseService.getSyncedUloggerTracks()
      ]);
      
      setTracks(remoteTracks);
      setSyncedTracks(localSyncedMap);
      
      // If manual mode, start empty. If autosync, use provided IDs.
      setSelectedIds(new Set(mode === 'autosync' ? initialSelectedIds : []));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  const toggleTrack = (id: number) => {
    const next = new Set(selectedIds);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    setSelectedIds(next);
  };

  const handleAction = async () => {
    if (selectedIds.size === 0 && mode === 'manual') return;
    
    if (mode === 'autosync' && onStartAutoSync) {
      onStartAutoSync(Array.from(selectedIds));
      onClose();
      return;
    }

    setSyncing(true);
    setError(null);
    try {
      const idsArray = Array.from(selectedIds);
      const points = await uloggerService.getPoints(idsArray);
      
      if (points.length > 0) {
        await importService.bulkImportPoints(points);
        
        // Prepare sync markers with latest timestamps
        const syncMarkers = tracks
          .filter(t => selectedIds.has(Number(t.id)))
          .map(t => ({ id: Number(t.id), lastUpdate: t.last_update }));
          
        await databaseService.markTracksAsSynced(syncMarkers);
      }
      
      onImportComplete();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSyncing(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="modal-overlay">
      <div className="modal-content ulogger-modal">
        <div className="modal-header">
          <h2>{mode === 'autosync' ? 'Auto-Sync Setup' : 'Ulogger Sync'}</h2>
          <button className="close-button" onClick={onClose}>&times;</button>
        </div>

        <div className="modal-body">
          {mode === 'autosync' && (
            <p style={{ fontSize: '0.85rem', color: '#aaa', marginBottom: '15px' }}>
              Select the tracks you want to automatically monitor and sync every minute.
            </p>
          )}

          {loading ? (
            <div className="sync-status">Fetching tracks from server...</div>
          ) : error ? (
            <div className="sync-error">{error}</div>
          ) : (
            <div className="track-list">
              {tracks.length === 0 ? (
                <p>No tracks found on server.</p>
              ) : (
                <table>
                  <thead>
                    <tr>
                      <th>Select</th>
                      <th>Track Name</th>
                      <th>Status</th>
                      <th>Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tracks.map(track => {
                      const id = Number(track.id);
                      const lastSynced = syncedTracks.get(id);
                      const isNew = !lastSynced;
                      const needsUpdate = !isNew && new Date(track.last_update) > new Date(lastSynced!);
                      const dateStr = track.time ? new Date(track.time).toLocaleDateString() : 'Unknown';

                      return (
                        <tr key={id}>
                          <td>
                            <input 
                              type="checkbox" 
                              checked={selectedIds.has(id)}
                              onChange={() => toggleTrack(id)}
                            />
                          </td>
                          <td>{track.name || `Track ${id}`}</td>
                          <td>
                            {isNew ? (
                              <span style={{ fontSize: '0.75rem', padding: '2px 6px', borderRadius: '4px', background: 'rgba(0, 229, 255, 0.2)', color: '#00e5ff' }}>New</span>
                            ) : needsUpdate ? (
                              <span style={{ fontSize: '0.75rem', padding: '2px 6px', borderRadius: '4px', background: 'rgba(255, 152, 0, 0.2)', color: '#ff9800' }}>Update</span>
                            ) : (
                              <span style={{ fontSize: '0.75rem', padding: '2px 6px', borderRadius: '4px', background: 'rgba(76, 175, 80, 0.2)', color: '#4caf50' }}>Synced</span>
                            )}
                          </td>
                          <td>{dateStr}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          )}
        </div>

        <div className="modal-footer">
          <button className="secondary-btn" onClick={onClose} disabled={syncing}>Cancel</button>
          <button 
            className="primary-btn" 
            onClick={handleAction} 
            disabled={syncing || (mode === 'manual' && selectedIds.size === 0) || loading}
          >
            {syncing ? 'Syncing...' : mode === 'autosync' ? 'Start Auto-Sync' : `Import ${selectedIds.size} track${selectedIds.size !== 1 ? 's' : ''}`}
          </button>
        </div>
      </div>
    </div>
  );
};
