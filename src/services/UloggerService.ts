import { APP_CONFIG } from '../Config';

export interface UloggerTrack {
  id: number;
  name: string;
  time: string;
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
}

export const uloggerService = new UloggerService();
