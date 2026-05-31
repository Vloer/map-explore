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
  const [syncedIds, setSyncedIds] = useState<Set<number>>(new Set());
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
      const [remoteTracks, localSynced] = await Promise.all([
        uloggerService.listTracks(),
        databaseService.getSyncedUloggerTracks()
      ]);
      setTracks(remoteTracks);
      setSyncedIds(localSynced);
      
      // Auto-select new tracks
      const newIds = remoteTracks
        .filter(t => !localSynced.has(t.id))
        .map(t => t.id);
      setSelectedIds(new Set(newIds));
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
        await databaseService.markTracksAsSynced(idsArray);
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
              ) : (
                <table>
                  <thead>
                    <tr>
                      <th>Select</th>
                      <th>Track Name</th>
                      <th>Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tracks.map(track => {
                      const isSynced = syncedIds.has(track.id);
                      const dateStr = track.time ? new Date(track.time).toLocaleDateString() : 'Unknown';

                      return (
                        <tr key={track.id} className={isSynced ? 'synced' : ''}>
                          <td>
                            <input 
                              type="checkbox" 
                              checked={selectedIds.has(track.id)}
                              onChange={() => toggleTrack(track.id)}
                            />
                          </td>
                          <td>{track.name || `Track ${track.id}`}</td>
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
            {syncing ? 'Syncing...' : `Import ${selectedIds.size} Tracks`}
          </button>
        </div>
      </div>
    </div>
  );
};
