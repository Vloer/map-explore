import { APP_CONFIG } from '../Config';
import { databaseService } from './DatabaseService';
import { importService } from './ImportService';

export interface UloggerTrack {
  id: number;
  name: string;
  time: string;
  last_update: string;
}

export interface UloggerPoint {
  latitude: number;
  longitude: number;
  time: string;
}

export class UloggerService {
  private baseUrl: string;
  private token: string;

  constructor() {
    this.baseUrl = APP_CONFIG.ULOGGER_CONFIG.BRIDGE_URL;
    this.token = APP_CONFIG.ULOGGER_CONFIG.TOKEN;
  }

  async listTracks(): Promise<UloggerTrack[]> {
    if (!this.baseUrl || !this.token) {
      throw new Error('Ulogger configuration missing (BRIDGE_URL or TOKEN)');
    }

    const url = new URL(this.baseUrl);
    url.searchParams.append('action', 'list');

    const response = await fetch(url.toString(), {
      headers: {
        'X-Ulogger-Token': this.token
      }
    });
    if (!response.ok) {
      throw new Error(`Failed to fetch tracks: ${response.statusText}`);
    }

    return response.json();
  }

  async getPoints(trackIds: number[]): Promise<UloggerPoint[]> {
    if (!this.baseUrl || !this.token) {
      throw new Error('Ulogger configuration missing');
    }

    const url = new URL(this.baseUrl);
    url.searchParams.append('action', 'get_points');
    url.searchParams.append('track_ids', trackIds.join(','));

    const response = await fetch(url.toString(), {
      headers: {
        'X-Ulogger-Token': this.token
      }
    });
    if (!response.ok) {
      throw new Error(`Failed to fetch points: ${response.statusText}`);
    }

    return response.json();
  }

  /**
   * Syncs tracks that have new data since the last sync.
   * @param {number[]} targetIds Optional list of track IDs to sync. If omitted, syncs all pending tracks.
   * @returns {Promise<number>} The number of tracks synced.
   */
  async syncAllPending(targetIds?: number[]): Promise<number> {
    const remoteTracks = await this.listTracks();
    const localSyncedMap = await databaseService.getSyncedUloggerTracks();

    console.log('UloggerService: syncAllPending called with targetIds:', targetIds);

    const updateableTracks = remoteTracks.filter(t => {
      const id = Number(t.id);
      
      // Ensure targetIds are numbers for correct comparison
      if (targetIds && targetIds.length > 0) {
        const isTarget = targetIds.map(Number).includes(id);
        if (!isTarget) return false;
      }

      const lastSynced = localSyncedMap.get(id);
      const needsUpdate = !lastSynced || new Date(t.last_update) > new Date(lastSynced);
      
      console.log(`Track ${id}: isTarget=true, needsUpdate=${needsUpdate}`);
      return needsUpdate;
    });

    console.log('UloggerService: updateableTracks found:', updateableTracks.map(t => t.id));

    if (updateableTracks.length === 0) return 0;

    const idsArray = updateableTracks.map(t => Number(t.id));
    const points = await this.getPoints(idsArray);

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
