'use client';

import { useEffect, useState } from 'react';

interface NoSSRProps {
  children: React.ReactNode;
}

export default function NoSSR({ children }: NoSSRProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      if (typeof window.global === 'undefined') {
        window.global = window;
      }
      if (typeof window.Buffer === 'undefined') {
        import('buffer').then(({ Buffer }) => {
          window.Buffer = Buffer;
        });
      }
    }
    
    setMounted(true);
  }, []);

  if (!mounted) {
    return null;
  }

  return <>{children}</>;
} 