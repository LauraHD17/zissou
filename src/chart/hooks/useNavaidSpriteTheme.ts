// Day/night sprite swap for NOAA navaid icons. PNG sprites bake their fills
// at build time, so CSS-variable overrides don't shift the on-chart glyphs
// when the app flips to night mode. This hook watches [data-theme] on the
// document element and, on transition, fetches the appropriate sprite JSON
// + PNG and re-registers every icon via map.removeImage + map.addImage.
//
// The sprite PNGs are shipped under public/sprites/ by `npm run build:sprites`.
// Icon-image names in the style are bare ('lateral-port-buoy', 'cardinal-north',
// etc.) — the IMAGE behind each name swaps with the theme.

import { useEffect, useState } from 'react';
import type { RefObject } from 'react';
import type maplibregl from 'maplibre-gl';

type Theme = 'day' | 'night';

interface SpriteJson {
  [iconName: string]: {
    width: number;
    height: number;
    x: number;
    y: number;
    pixelRatio: number;
  };
}

const SPRITE_BASE: Record<Theme, string> = {
  day: '/sprites/navaid',
  night: '/sprites/navaid-night',
};

export function useNavaidSpriteTheme(mapRef: RefObject<maplibregl.Map | null>): void {
  const theme = useResolvedTheme();

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    let cancelled = false;

    // Use `style.load` (one-shot on full style reload — Marine/Harbor mode
    // swap) rather than `styledata` (fires on every addImage/setLayoutProperty,
    // which creates a re-register → styledata → re-register infinite loop).
    const reload = () => {
      if (!cancelled) load();
    };

    const load = async () => {
      // Prefer @2x on high-DPI; MapLibre's retina resolution is independent
      // from `devicePixelRatio` in some browsers, so check both.
      const retina = typeof window !== 'undefined' && window.devicePixelRatio > 1;
      const base = SPRITE_BASE[theme];
      const jsonUrl = retina ? `${base}@2x.json` : `${base}.json`;
      const pngUrl = retina ? `${base}@2x.png` : `${base}.png`;

      let json: SpriteJson;
      try {
        const res = await fetch(jsonUrl);
        if (!res.ok) return; // sprite not built yet — style falls back to circles
        json = (await res.json()) as SpriteJson;
      } catch {
        return;
      }
      if (cancelled) return;

      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.src = pngUrl;
      await img.decode().catch(() => undefined);
      if (cancelled) return;
      if (img.naturalWidth === 0) return;

      const pixelRatio = retina ? 2 : 1;
      // Pull each sub-image out of the sprite sheet onto its own canvas so
      // we can register each as a named image. MapLibre's addImage accepts
      // an ImageData-like object with width/height/data.
      for (const [name, meta] of Object.entries(json)) {
        const canvas = document.createElement('canvas');
        canvas.width = meta.width;
        canvas.height = meta.height;
        const ctx = canvas.getContext('2d');
        if (!ctx) continue;
        ctx.drawImage(img, meta.x, meta.y, meta.width, meta.height, 0, 0, meta.width, meta.height);
        const data = ctx.getImageData(0, 0, meta.width, meta.height);
        if (map.hasImage(name)) map.removeImage(name);
        map.addImage(
          name,
          { width: data.width, height: data.height, data: data.data },
          { pixelRatio },
        );
      }
      // Nudge the map to re-render symbol layers that now have their images.
      map.triggerRepaint();
    };

    load();
    map.on('style.load', reload);
    return () => {
      cancelled = true;
      map.off('style.load', reload);
    };
  }, [mapRef, theme]);
}

// Read the active theme from the document's data-theme attribute. The
// existing useApplyTheme hook writes this; we mirror into React state
// with a MutationObserver so sprite swaps happen automatically on dusk/dawn
// auto-switches or manual toggle.
function useResolvedTheme(): Theme {
  const [theme, setTheme] = useState<Theme>(() => readTheme());

  useEffect(() => {
    if (typeof document === 'undefined') return;
    const el = document.documentElement;
    const update = () => setTheme(readTheme());
    const observer = new MutationObserver(update);
    observer.observe(el, { attributes: true, attributeFilter: ['data-theme'] });
    update();
    return () => observer.disconnect();
  }, []);

  return theme;
}

function readTheme(): Theme {
  if (typeof document === 'undefined') return 'day';
  return document.documentElement.dataset.theme === 'night' ? 'night' : 'day';
}
