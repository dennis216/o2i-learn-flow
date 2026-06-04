import React, { useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';

interface GeoGebraViewerProps {
  embedUrl: string; // full embed or share URL
  title?: string;
  className?: string;
}

// Helper: normalize to GeoGebra iframe/embed id or fallback to original URL
function extractGeoGebraId(url: string): string | null {
  // matches: https://www.geogebra.org/m/<id> or /material/iframe/id/<id> or plain id
  const m1 = url.match(/geogebra\.org\/m\/([A-Za-z0-9_-]+)/);
  if (m1) return m1[1];
  const m2 = url.match(/iframe\/id\/([A-Za-z0-9_-]+)/);
  if (m2) return m2[1];
  const m3 = url.match(/geogebra\.org\/classic\/([A-Za-z0-9_-]+)/);
  if (m3) return m3[1];
  // If user passed only id
  if (/^[A-Za-z0-9_-]+$/.test(url)) return url;
  return null;
}

// Load external script helper
function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) return resolve();
    const s = document.createElement('script');
    s.src = src;
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('Failed to load ' + src));
    document.body.appendChild(s);
  });
}

export default function GeoGebraViewer({ embedUrl, title, className }: GeoGebraViewerProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const innerIdRef = useRef<string | null>(null);
  const appletInstanceRef = useRef<any>(null);
  const [inView, setInView] = useState(false);
  const [initialized, setInitialized] = useState(false);
  const [fallbackToIframe, setFallbackToIframe] = useState(false);
  const location = useLocation();

  // Only initialize GeoGebra when the element enters viewport
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const obs = new IntersectionObserver((entries) => {
      for (const e of entries) {
        if (e.isIntersecting) {
          setInView(true);
          obs.disconnect();
          break;
        }
      }
    }, { rootMargin: '300px' });
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  // When inView, load Geogebra script and inject applet. Keep this isolated and guarded
  useEffect(() => {
    if (!inView || initialized) return;

    let mounted = true;

    (async () => {
      const id = extractGeoGebraId(embedUrl);
      // GeoGebra deploy script (official)
      const ggbScript = 'https://www.geogebra.org/apps/deployggb.js';
      try {
        await loadScript(ggbScript);

        if (!mounted) return;

        // safe-guard: window.GGBApplet may not be available immediately even after script load
        const GGB = (window as any).GGBApplet;
        if (typeof GGB !== 'function') {
          // fallback to iframe if GeoGebra API isn't available
          setFallbackToIframe(true);
          setInitialized(true);
          return;
        }

        // prepare unique container id
        const containerId = `ggb-container-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
        innerIdRef.current = containerId;

        // create placeholder node for injection
        if (containerRef.current) {
          const mount = document.createElement('div');
          mount.id = containerId;
          mount.style.width = '100%';
          mount.style.height = '100%';
          containerRef.current.appendChild(mount);
        }

        // Applet parameters: keep minimal to reduce overhead; user can extend if needed
        const params: any = {
          id: `ggb-applet-${id || 'anon'}`,
          appName: 'classic',
          width: '100%',
          height: '100%',
          showToolbar: false,
          showMenuBar: false,
          material_id: id || undefined,
        };

        // create and inject applet
        const applet = new (window as any).GGBApplet(params, true);
        appletInstanceRef.current = applet;
        // inject into the created mount element
        applet.inject(innerIdRef.current);

        setInitialized(true);
      } catch (err) {
        console.error('GeoGebra init error:', err);
        // If anything fails, gracefully fallback to iframe embed (much safer)
        setFallbackToIframe(true);
        setInitialized(true);
      }
    })();

    return () => { mounted = false; };
  }, [inView, initialized, embedUrl]);

  // Cleanup GeoGebra instance when route changes or component unmounts
  useEffect(() => {
    return () => {
      try {
        // Try to destroy applet instance
        if (appletInstanceRef.current && typeof appletInstanceRef.current.remove === 'function') {
          appletInstanceRef.current.remove();
        }
        appletInstanceRef.current = null;

        // Clear the container DOM
        if (innerIdRef.current && containerRef.current) {
          const mount = document.getElementById(innerIdRef.current);
          if (mount && mount.parentNode) {
            mount.parentNode.removeChild(mount);
          }
        }
      } catch (err) {
        console.warn('GeoGebra cleanup error:', err);
      }
    };
  }, [location.pathname]);

  // If not yet in view, render a lightweight skeleton placeholder
  return (
    <div ref={containerRef} className={className || 'w-full h-full bg-slate-50'} aria-label={title || 'GeoGebra viewer'}>
      {!inView && (
        <div className="w-full h-full aspect-video bg-muted rounded-lg animate-pulse" />
      )}

      {inView && !initialized && (
        // While script is loading
        <div className="w-full h-full aspect-video bg-muted rounded-lg flex items-center justify-center">
          <span className="text-sm text-muted-foreground">Loading interactive…</span>
        </div>
      )}

      {inView && initialized && fallbackToIframe && (
        // Fallback: simple iframe embed to avoid heavy JS initialization
        <iframe
          src={embedUrl}
          title={title || 'GeoGebra embed'}
          className="w-full h-full border-0 rounded-lg"
          allowFullScreen
        />
      )}

      {/* When initialized with GGBApplet, the applet will be injected into the container div we appended */}
    </div>
  );
}
