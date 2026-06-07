import { createContext, useContext, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { uloggerService } from '../services/UloggerService';
import type { UloggerSession } from '../services/UloggerService';
import { databaseService } from '../services/DatabaseService';

const STORAGE_KEY = 'ulogger_session';

interface AuthContextType {
  session: UloggerSession | null | undefined;
  login: (username: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  // undefined = loading, null = unauthenticated, UloggerSession = authenticated
  const [session, setSession] = useState<UloggerSession | null | undefined>(undefined);

  // On mount: restore session from localStorage and verify it
  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) {
      setSession(null);
      return;
    }

    let parsed: UloggerSession;
    try { 
      parsed = JSON.parse(stored); 
    } catch { 
      setSession(null); 
      return; 
    }

    // Verify token against the server (catches expiry)
    uloggerService.whoami(parsed.token)
      .then(() => {
        setSession(parsed);
      })
      .catch((err) => {
        console.warn('AuthContext: Session verification failed', err);
        localStorage.removeItem(STORAGE_KEY);
        setSession(null);
      });
  }, []);

  async function login(username: string, password: string) {
    const data = await uloggerService.login(username, password);
    
    // Clear all existing data before starting new session
    localStorage.clear(); 
    await databaseService.clearDatabase();
    
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    setSession(data);
  }

  function logout() {
    localStorage.removeItem(STORAGE_KEY);
    setSession(null);
  }

  return (
    <AuthContext.Provider value={{ session, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
