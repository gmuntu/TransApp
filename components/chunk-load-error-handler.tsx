'use client';

import { useEffect } from 'react';

export function ChunkLoadErrorHandler() {
  useEffect(() => {
    const handleError = (e: ErrorEvent) => {
      if (
        e?.message?.includes('ChunkLoadError') ||
        e?.message?.includes('Loading chunk') ||
        e?.message?.includes('Failed to fetch dynamically imported module')
      ) {
        window.location.reload();
      }
    };
    window.addEventListener('error', handleError);
    return () => window.removeEventListener('error', handleError);
  }, []);

  return null;
}
