import React, { useState, useEffect } from 'react';
import { uloggerService, type UloggerTrack } from '../services/UloggerService';
import { databaseService } from '../services/DatabaseService';
import { importService } from '../services/ImportService';
import { useAuth } from '../contexts/AuthContext';
import './UloggerSyncModal.css';

interface UloggerSyncModalProps {
  isOpen: boolean;
  onClose: () => void;
  onImportComplete: () => void;
  mode?: 'manual' | 'autosync';
  onStartAutoSync?: (ids: number[]) => void;
  initialSelectedIds?: number[];
  isAdmin?: boolean;
}

export const UloggerSyncModal: React.FC<UloggerSyncModalProps> = ({ 
  isOpen, 
  onClose, 
  onImportComplete,
  mode = 'manual',
  onStartAutoSync,
  initialSelectedIds = [],
  isAdmin = true
}) => {
  const { session, logout } = useAuth();
  const [tracks, setTracks] = useState<UloggerTrack[]>([]);
  const [syncedTracks, setSyncedTracks] = useState<Map<number, string>>(new Map());
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    if (isOpen && session) {
      loadTracks();
    }
  }, [isOpen, session]);

  const loadTracks = async () => {
    if (!session) return;
    setLoading(true);
    setError(null);
    try {
      const [remoteTracks, localSyncedMap] = await Promise.all([
        uloggerService.listTracks(session.token),
        databaseService.getSyncedUloggerTracks()
      ]);
      
      setTracks(remoteTracks);
      setSyncedTracks(localSyncedMap);
      
      // If manual mode, start empty. If autosync, use provided IDs.
      setSelectedIds(new Set(mode === 'autosync' ? initialSelectedIds : []));
    } catch (err: any) {
      if (err.status === 401) {
        logout();
      } else {
        setError(err instanceof Error ? err.message : String(err));
      }
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
    if (!session) return;
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
      const points = await uloggerService.getPoints(session.token, idsArray);
      
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
    } catch (err: any) {
      if (err.status === 401) {
        logout();
      } else {
        setError(err instanceof Error ? err.message : String(err));
      }
    } finally {
      setSyncing(false);
    }
  };

  const handleSelectAll = () => {
    setSelectedIds(new Set(tracks.map(t => Number(t.id))));
  };

  const handleSelectMine = () => {
    if (!session) return;
    const myTrackIds = tracks
      .filter(t => t.username === session.username)
      .map(t => Number(t.id));
    setSelectedIds(new Set(myTrackIds));
  };

  const handleDeselectAll = () => {
    setSelectedIds(new Set());
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
            <>
              {tracks.length > 0 && (
                <div style={{ display: 'flex', gap: '10px', marginBottom: '10px' }}>
                  <button onClick={handleSelectAll} className="secondary-btn" style={{ padding: '4px 8px', fontSize: '12px' }}>Select All</button>
                  {isAdmin && (
                    <button onClick={handleSelectMine} className="secondary-btn" style={{ padding: '4px 8px', fontSize: '12px' }}>Select Mine</button>
                  )}
                  <button onClick={handleDeselectAll} className="secondary-btn" style={{ padding: '4px 8px', fontSize: '12px' }}>Deselect All</button>
                </div>
              )}
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
                          <td>
                            <div style={{ fontWeight: 'bold' }}>{track.name || `Track ${id}`}</div>
                            {isAdmin && track.username && (
                              <div style={{ fontSize: '0.7rem', color: '#888' }}>User: {track.username}</div>
                            )}
                          </td>
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
            </>
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
