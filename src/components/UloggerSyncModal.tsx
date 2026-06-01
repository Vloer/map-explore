import React, { useState, useEffect } from 'react';
import { uloggerService, type UloggerTrack } from '../services/UloggerService';
import { databaseService } from '../services/DatabaseService';
import { importService } from '../services/ImportService';
import './UloggerSyncModal.css';

interface UloggerSyncModalProps {
  isOpen: boolean;
  onClose: () => void;
  onImportComplete: () => void;
}

export const UloggerSyncModal: React.FC<UloggerSyncModalProps> = ({ isOpen, onClose, onImportComplete }) => {
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
      
      // Filter to only show new or updated tracks
      const updateableTracks = remoteTracks.filter(t => {
        const id = Number(t.id); // Remote IDs might be strings from PHP
        const lastSynced = localSyncedMap.get(id);
        const needsUpdate = !lastSynced || new Date(t.last_update) > new Date(lastSynced);
        return needsUpdate;
      });

      setTracks(remoteTracks);
      setSyncedTracks(localSyncedMap);
      
      // Auto-select updateable tracks
      setSelectedIds(new Set(updateableTracks.map(t => Number(t.id))));
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

  const handleSync = async () => {
    if (selectedIds.size === 0) return;
    
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
        onImportComplete();
        onClose();
      } else {
        setError("No points found in selected tracks.");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSyncing(false);
    }
  };

  if (!isOpen) return null;

  const displayTracks = tracks.filter(t => {
    const id = Number(t.id);
    const lastSynced = syncedTracks.get(id);
    return !lastSynced || new Date(t.last_update) > new Date(lastSynced);
  });

  return (
    <div className="modal-overlay">
      <div className="modal-content ulogger-modal">
        <div className="modal-header">
          <h2>Ulogger Sync</h2>
          <button className="close-button" onClick={onClose}>&times;</button>
        </div>

        <div className="modal-body">
          {loading ? (
            <div className="sync-status">Fetching tracks from server...</div>
          ) : error ? (
            <div className="sync-error">{error}</div>
          ) : (
            <div className="track-list">
              {tracks.length === 0 ? (
                <p>No tracks found on server.</p>
              ) : displayTracks.length === 0 ? (
                <p style={{ padding: '20px', textAlign: 'center', color: '#888' }}>
                  All tracks on server have already been synced.
                </p>
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
                    {displayTracks.map(track => {
                      const id = Number(track.id);
                      const isNew = !syncedTracks.has(id);
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
                            <span style={{ 
                              fontSize: '0.8rem', 
                              padding: '2px 6px', 
                              borderRadius: '4px',
                              background: isNew ? 'rgba(0, 229, 255, 0.2)' : 'rgba(255, 152, 0, 0.2)',
                              color: isNew ? '#00e5ff' : '#ff9800'
                            }}>
                              {isNew ? 'New' : 'Update'}
                            </span>
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
            onClick={handleSync} 
            disabled={syncing || selectedIds.size === 0 || loading}
          >
            {syncing ? 'Syncing...' : `Import ${selectedIds.size} track${selectedIds.size > 1 ? 's' : ''}`}
          </button>
        </div>
      </div>
    </div>
  );
};
