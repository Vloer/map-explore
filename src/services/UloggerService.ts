import { APP_CONFIG } from '../Config';
import { databaseService } from './DatabaseService';
import { importService } from './ImportService';

export interface UloggerTrack {
  id: number;
  name: string;
  time: string;
  last_update: string;
  username?: string;
}

export interface UloggerPoint {
  latitude: number;
  longitude: number;
  time: string;
}

export interface UloggerSession {
  token: string;
  username: string;
  role: 'user' | 'admin';
  expires_at: number;
}

export class UloggerService {
  private baseUrl: string;
  private authUrl: string;

  constructor() {
    this.baseUrl = APP_CONFIG.ULOGGER_CONFIG.BRIDGE_URL;
    this.authUrl = APP_CONFIG.ULOGGER_CONFIG.AUTH_URL;
  }

  /**
   * POST auth.php with credentials.
   */
  async login(username: string, password: string): Promise<UloggerSession> {
    const res = await fetch(this.authUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });

    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.error || 'Login failed');
    }

    return data;
  }

  /**
   * Generic fetch helper for bridge.php
   */
  private async bridgeFetch(token: string, action: string, params: Record<string, string> = {}): Promise<any> {
    const url = new URL(this.baseUrl);
    url.searchParams.set('action', action);
    Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));

    const res = await fetch(url.toString(), {
      headers: { 'Authorization': `Bearer ${token}` },
    });

    if (res.status === 401) {
      const err = new Error('Session expired') as any;
      err.status = 401;
      throw err;
    }

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || `Request failed (${res.status})`);
    }

    return res.json();
  }

  async listTracks(token: string): Promise<UloggerTrack[]> {
    return this.bridgeFetch(token, 'list');
  }

  async getPoints(token: string, trackIds: number[]): Promise<UloggerPoint[]> {
    return this.bridgeFetch(token, 'get_points', { 
      track_ids: trackIds.join(',') 
    });
  }

  async whoami(token: string): Promise<{ username: string, role: string }> {
    return this.bridgeFetch(token, 'whoami');
  }

  /**
   * Syncs tracks that have new data since the last sync.
   * @param {string} token The session token.
   * @param {number[]} targetIds Optional list of track IDs to sync.
   * @returns {Promise<number>} The number of tracks synced.
   */
  async syncAllPending(token: string, targetIds?: number[]): Promise<number> {
    const remoteTracks = await this.listTracks(token);
    const localSyncedMap = await databaseService.getSyncedUloggerTracks();

    const updateableTracks = remoteTracks.filter(t => {
      const id = Number(t.id);
      
      if (targetIds && targetIds.length > 0) {
        const isTarget = targetIds.map(Number).includes(id);
        if (!isTarget) return false;
      }

      const lastSynced = localSyncedMap.get(id);
      return !lastSynced || new Date(t.last_update) > new Date(lastSynced);
    });

    if (updateableTracks.length === 0) return 0;

    const idsArray = updateableTracks.map(t => Number(t.id));
    const points = await this.getPoints(token, idsArray);

    if (points.length > 0) {
      await importService.bulkImportPoints(points);
      const syncMarkers = updateableTracks.map(t => ({
        id: Number(t.id),
        lastUpdate: t.last_update
      }));
      await databaseService.markTracksAsSynced(syncMarkers);
    }
    
    return updateableTracks.length;
  }
}

export const uloggerService = new UloggerService();
