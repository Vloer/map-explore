import { useState, useEffect, useCallback } from 'react';
import { uloggerService } from '../services/UloggerService';
import type { UloggerSession } from '../services/UloggerService';

export function useAutoSync(
  session: UloggerSession | null | undefined, 
  logout: () => void, 
  onImportComplete: () => void,
  setUloggerModalMode: (mode: 'manual' | 'autosync') => void,
  setUloggerModalOpen: (open: boolean) => void
) {
  const [autoSyncActive, setAutoSyncActive] = useState(false);
  const [autoSyncIds, setAutoSyncIds] = useState<number[]>([]);

  // Local effect for UI state on mount
  useEffect(() => {
    // Check for active auto-sync on mount
    const expiry = localStorage.getItem('ulogger_auto_sync_expiry');
    const savedIds = localStorage.getItem('ulogger_auto_sync_ids');
    
    if (savedIds) {
      try {
        setAutoSyncIds(JSON.parse(savedIds));
      } catch (e) {
        console.error("Failed to parse auto-sync IDs", e);
      }
    }

    if (expiry && Number(expiry) > Date.now()) {
      setAutoSyncActive(true);
    }
  }, []);

  // Auto-sync timer logic
  useEffect(() => {
    if (!autoSyncActive || !session) return;

    const interval = setInterval(async () => {
      // Check if expired
      const expiry = localStorage.getItem('ulogger_auto_sync_expiry');
      if (!expiry || Number(expiry) <= Date.now()) {
        setAutoSyncActive(false);
        localStorage.removeItem('ulogger_auto_sync_expiry');
        return;
      }

      try {
        const syncedCount = await uloggerService.syncAllPending(session.token, autoSyncIds);
        if (syncedCount > 0) {
          onImportComplete();
        }
      } catch (err: any) {
        console.error('Auto-Sync Error:', err);
        if (err.status === 401) {
          logout();
        }
      }
    }, 60000); // 1 minute

    return () => clearInterval(interval);
  }, [autoSyncActive, autoSyncIds, session, logout, onImportComplete]);

  const toggleAutoSync = useCallback(() => {
    if (autoSyncActive) {
      setAutoSyncActive(false);
      localStorage.removeItem('ulogger_auto_sync_expiry');
    } else {
      setUloggerModalMode('autosync');
      setUloggerModalOpen(true);
    }
  }, [autoSyncActive, setUloggerModalMode, setUloggerModalOpen]);

  const startAutoSync = useCallback((ids: number[]) => {
    const numericIds = ids.map(Number);
    setAutoSyncIds(numericIds);
    localStorage.setItem('ulogger_auto_sync_ids', JSON.stringify(numericIds));
    
    if (numericIds.length > 0 && session) {
      setAutoSyncActive(true);
      localStorage.setItem('ulogger_auto_sync_expiry', String(Date.now() + 2 * 60 * 60 * 1000));
      uloggerService.syncAllPending(session.token, numericIds)
        .then(count => {
          if (count > 0) onImportComplete();
        })
        .catch(err => {
          if (err.status === 401) logout();
        });
    } else {
      setAutoSyncActive(false);
      localStorage.removeItem('ulogger_auto_sync_expiry');
    }
  }, [session, logout, onImportComplete]);

  return { autoSyncActive, autoSyncIds, toggleAutoSync, startAutoSync };
}
