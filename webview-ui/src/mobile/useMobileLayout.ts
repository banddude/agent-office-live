import { useEffect, useState } from 'react';
import { isBrowserRuntime } from '../runtime.js';
const MEDIA_QUERY = '(max-width: 820px), (max-height: 520px) and (max-width: 1024px)';

function shouldUseMobileLayout(): boolean {
  return typeof window !== 'undefined' && window.matchMedia(MEDIA_QUERY).matches;
}

/** Switch at the actual viewport breakpoint; not tied to an iPhone user-agent. */
export function useMobileLayout(): boolean {
  const [mobile, setMobile] = useState(() => isBrowserRuntime && shouldUseMobileLayout());
  useEffect(() => {
    if (!isBrowserRuntime) return;
    const query = window.matchMedia(MEDIA_QUERY);
    const update = () => setMobile(query.matches);
    update();
    query.addEventListener('change', update);
    window.addEventListener('orientationchange', update);
    window.addEventListener('resize', update);
    return () => {
      query.removeEventListener('change', update);
      window.removeEventListener('orientationchange', update);
      window.removeEventListener('resize', update);
    };
  }, []);
  return mobile;
}
