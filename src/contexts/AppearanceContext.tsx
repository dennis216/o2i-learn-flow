import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { ThemeProvider } from 'next-themes';
import { daylightTheme } from '@/lib/daylightTheme';

type Appearance = 'auto' | 'light' | 'dark';
type Position = { latitude: number; longitude: number };
const AppearanceContext = createContext<{ mode: Appearance; selectMode: (mode: Appearance) => void; solarStatus: 'system' | 'locating' | 'solar' }>({ mode: 'auto', selectMode: () => {}, solarStatus: 'system' });

export function AppearanceProvider({ children }: { children: ReactNode }) {
  const [mode, setMode] = useState<Appearance>(() => {
    try {
      const saved = localStorage.getItem('o2i-appearance') ?? localStorage.getItem('o2i-theme');
      return saved === 'light' || saved === 'dark' ? saved : 'auto';
    } catch { return 'auto'; }
  });
  const [position, setPosition] = useState<Position | null>(null);
  const [locating, setLocating] = useState(false);
  const [now, setNow] = useState(() => new Date());
  const locate = useCallback(() => {
    if (!navigator.geolocation) return;
    setLocating(true);
    navigator.geolocation.getCurrentPosition(({ coords }) => {
      setPosition({ latitude: coords.latitude, longitude: coords.longitude });
      setLocating(false);
    }, () => setLocating(false), { enableHighAccuracy: false, timeout: 10000, maximumAge: 3600000 });
  }, []);
  const selectMode = useCallback((value: Appearance) => {
    setMode(value);
    if (value === 'auto' && !position) locate();
  }, [locate, position]);
  useEffect(() => {
    try { localStorage.setItem('o2i-appearance', mode); } catch { /* visit-only preference */ }
    if (mode !== 'auto') return;
    let active = true;
    // Reuse an existing permission, but only prompt after the visitor selects Auto.
    void navigator.permissions?.query({ name: 'geolocation' }).then(permission => {
      if (active && permission.state === 'granted') locate();
    }).catch(() => {});
    const update = () => setNow(new Date());
    const timer = window.setInterval(update, 60000);
    window.addEventListener('focus', update);
    document.addEventListener('visibilitychange', update);
    return () => { active = false; window.clearInterval(timer); window.removeEventListener('focus', update); document.removeEventListener('visibilitychange', update); };
  }, [mode, locate]);
  const forcedTheme = mode === 'auto' ? position ? daylightTheme(now, position.latitude, position.longitude) : undefined : mode;
  return <AppearanceContext.Provider value={{ mode, selectMode, solarStatus: position ? 'solar' : locating ? 'locating' : 'system' }}>
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem storageKey="o2i-system-theme" forcedTheme={forcedTheme} disableTransitionOnChange>{children}</ThemeProvider>
  </AppearanceContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export const useAppearance = () => useContext(AppearanceContext);
