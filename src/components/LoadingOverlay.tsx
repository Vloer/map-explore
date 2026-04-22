interface LoadingOverlayProps {
  message: string;
  subMessage?: string;
}

/**
 * Full-screen loading overlay with a CSS spinner.
 * Used during data imports and heavy database operations.
 * 
 * @param props Component properties containing the message to display.
 */
export function LoadingOverlay({ message, subMessage }: LoadingOverlayProps) {
  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(0, 0, 0, 0.85)',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 2000,
      color: 'white',
      backdropFilter: 'blur(4px)'
    }}>
      <style>
        {`
          .spinner {
            width: 50px;
            height: 50px;
            border: 5px solid rgba(255, 255, 255, 0.1);
            border-top: 5px solid #2196F3;
            border-radius: 50%;
            animation: spin 1s linear infinite;
            margin-bottom: 20px;
          }
          @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
          }
        `}
      </style>
      <div className="spinner" />
      <h2 style={{ margin: '0 0 10px 0', fontSize: '1.2rem', fontWeight: '500' }}>{message}</h2>
      {subMessage && (
        <p style={{ margin: 0, fontSize: '0.9rem', color: '#aaa' }}>{subMessage}</p>
      )}
    </div>
  );
}
