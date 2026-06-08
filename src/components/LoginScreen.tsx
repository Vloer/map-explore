import { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';

export function LoginScreen() {
  const { login } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      await login(username, password);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Invalid username or password');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      height: '100dvh',
      width: '100vw',
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'center',
      alignItems: 'center',
      backgroundColor: '#1a1a1a',
      color: 'white',
      padding: '20px',
      boxSizing: 'border-box'
    }}>
      <div style={{
        width: '100%',
        maxWidth: '400px',
        padding: '30px',
        borderRadius: '12px',
        backgroundColor: 'rgba(42, 42, 46, 0.95)',
        boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
        border: '1px solid #333'
      }}>
        <h1 style={{ textAlign: 'center', marginBottom: '30px', fontSize: '24px' }}>MapExplorer Login</h1>
        
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {error && (
            <div style={{ 
              padding: '10px', 
              borderRadius: '4px', 
              backgroundColor: 'rgba(244, 67, 54, 0.2)', 
              color: '#f44336', 
              fontSize: '14px',
              textAlign: 'center'
            }}>
              {error}
            </div>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <label style={{ fontSize: '13px', color: '#888' }}>Username</label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Enter your username"
              autoComplete="username"
              required
              style={{
                padding: '12px',
                borderRadius: '6px',
                border: '1px solid #444',
                backgroundColor: '#2a2a2e',
                color: 'white',
                fontSize: '16px'
              }}
            />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <label style={{ fontSize: '13px', color: '#888' }}>Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter your password"
              autoComplete="current-password"
              required
              style={{
                padding: '12px',
                borderRadius: '6px',
                border: '1px solid #444',
                backgroundColor: '#2a2a2e',
                color: 'white',
                fontSize: '16px'
              }}
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            style={{
              padding: '12px',
              borderRadius: '6px',
              border: 'none',
              backgroundColor: '#2196F3',
              color: 'white',
              fontSize: '16px',
              fontWeight: 'bold',
              cursor: loading ? 'default' : 'pointer',
              marginTop: '10px',
              opacity: loading ? 0.7 : 1
            }}
          >
            {loading ? 'Logging in...' : 'Log In'}
          </button>
        </form>
        
        <div style={{ textAlign: 'center', marginTop: '25px', display: 'flex', flexDirection: 'column', gap: '15px' }}>
          <a 
            href="https://github.com/vloer/mapexplorer/blob/master/docs/setup-guide.md" 
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: '#4CAF50', textDecoration: 'none', fontSize: '14px', fontWeight: 'bold' }}
          >
            📖 Read the Setup Guide
          </a>
          <a 
            href="http://62.238.4.160/register.php" 
            style={{ color: '#2196F3', textDecoration: 'none', fontSize: '14px', fontWeight: 'bold' }}
          >
            Don't have an account? Register here
          </a>
          <p style={{ fontSize: '12px', color: '#666', margin: 0 }}>
            Contact the administrator if you need an invite code.
          </p>
        </div>
      </div>
    </div>
  );
}
