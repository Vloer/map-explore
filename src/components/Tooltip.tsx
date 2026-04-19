import React from 'react';
import { APP_CONFIG } from '../Config';
import type { TooltipData } from '../types';

interface TooltipProps {
  data: TooltipData;
}

export function Tooltip({ data }: TooltipProps) {
  return (
    <div style={{
      position: 'absolute',
      left: data.x + APP_CONFIG.TOOLTIP_OFFSET,
      top: data.y + APP_CONFIG.TOOLTIP_OFFSET,
      backgroundColor: 'rgba(0, 0, 0, 0.8)',
      color: 'white',
      padding: '8px 12px',
      borderRadius: '4px',
      pointerEvents: 'none',
      zIndex: 100,
      fontSize: '12px',
      whiteSpace: 'pre-line',
      border: '1px solid rgba(255,255,255,0.2)'
    }}>
      {data.text}
    </div>
  );
}
