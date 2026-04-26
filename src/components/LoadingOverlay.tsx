interface LoadingOverlayProps {
  message: string;
  subMessage?: string;
  isError?: boolean;
  onReset?: () => void;
}

/**
 * Full-screen loading overlay with a CSS spinner.
 * Used during data imports and heavy database operations.
 * Also serves as an error screen with a reset option for database corruption.
 * 
 * @param props Component properties containing the message to display.
 */
export function LoadingOverlay({ message, subMessage, isError, onReset }: LoadingOverlayProps) {
  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: isError ? 'rgba(60, 0, 0, 0.9)' : 'rgba(0, 0, 0, 0.85)',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 3000,
      color: 'white',
      padding: '20px',
      textAlign: 'center',
      backdropFilter: 'blur(8px)'
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
          .reset-btn {
            margin-top: 30px;
            padding: 12px 24px;
            background-color: #f44336;
            color: white;
            border: none;
            border-radius: 4px;
            cursor: pointer;
            font-weight: bold;
            font-size: 1rem;
            transition: background-color 0.2s;
          }
          .reset-btn:hover {
            background-color: #d32f2f;
          }
          @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
          }
        `}
      </style>
      
      {!isError && <div className="spinner" />}
      
      <h2 style={{ 
        margin: '0 0 10px 0', 
        fontSize: '1.4rem', 
        fontWeight: 'bold',
        color: isError ? '#ff5252' : 'white'
      }}>
        {message}
      </h2>
      
      {subMessage && (
        <p style={{ 
          margin: 0, 
          maxWidth: '600px',
          fontSize: '1rem', 
          lineHeight: '1.5',
          color: isError ? '#ffcdd2' : '#aaa' 
        }}>
          {subMessage}
        </p>
      )}

      {isError && onReset && (
        <button className="reset-btn" onClick={onReset}>
          Emergency Database Reset
        </button>
      )}
    </div>
  );
}
