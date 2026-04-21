// Inline SVG glyphs for the NavaidLegend — visually identical to the
// on-chart sprite silhouettes so the legend row and the map marker look
// like the same object. The same path data is used to author the sprite
// SVGs under sprites/navaid/day/; if you change a silhouette here, update
// the corresponding sprite source and re-run `npm run build:sprites`.
//
// All glyphs are 20×20 viewBox, designed to render crisply at both 14px
// (legend) and 28-32px (chart). Fills reference CSS custom properties so
// the legend tints correctly in night mode (sprites for the chart are
// swapped wholesale by useNavaidSpriteTheme).

import type { FC } from 'react';

interface GlyphProps {
  size?: number;
  className?: string;
}

const defaults = {
  size: 14,
  className: 'navaid-legend__glyph',
};

function withDefaults({ size, className }: GlyphProps = {}) {
  return {
    size: size ?? defaults.size,
    className: className ?? defaults.className,
  };
}

// 1. Lateral port buoy — flat-topped red can on a short waterline tick.
export const LateralPortGlyph: FC<GlyphProps> = (props) => {
  const { size, className } = withDefaults(props);
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 20 20"
      aria-hidden="true"
      focusable="false"
    >
      <rect x="6" y="4" width="8" height="10" fill="var(--navaid-port)" stroke="var(--bg-navy)" strokeWidth="1" />
      <path d="M4 16 L16 16" stroke="var(--bg-navy)" strokeWidth="1.5" />
    </svg>
  );
};

// 2. Lateral starboard buoy — inverted trapezoid (nun) on a short waterline.
export const LateralStarboardGlyph: FC<GlyphProps> = (props) => {
  const { size, className } = withDefaults(props);
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 20 20"
      aria-hidden="true"
      focusable="false"
    >
      <polygon
        points="5,14 15,14 12,4 8,4"
        fill="var(--navaid-starboard)"
        stroke="var(--bg-navy)"
        strokeWidth="1"
      />
      <path d="M4 16 L16 16" stroke="var(--bg-navy)" strokeWidth="1.5" />
    </svg>
  );
};

// 3. Safe-water buoy — white sphere with a vertical red stripe.
export const SafeWaterGlyph: FC<GlyphProps> = (props) => {
  const { size, className } = withDefaults(props);
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 20 20"
      aria-hidden="true"
      focusable="false"
    >
      <circle cx="10" cy="10" r="6" fill="var(--surface-sand)" stroke="var(--bg-navy)" strokeWidth="1" />
      <rect x="9" y="4" width="2" height="12" fill="var(--navaid-safe-water)" />
    </svg>
  );
};

// 4. Cardinal buoy — double-cone topmark stack over a yellow/black banded pillar.
//    North shown (cones both pointing up); other directions flip cone orientation
//    but the legend uses the North icon as the family representative.
export const CardinalGlyph: FC<GlyphProps> = (props) => {
  const { size, className } = withDefaults(props);
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 20 20"
      aria-hidden="true"
      focusable="false"
    >
      {/* Two small triangles (topmark) */}
      <polygon points="10,2 8,5 12,5" fill="var(--bg-navy)" />
      <polygon points="10,6 8,9 12,9" fill="var(--bg-navy)" />
      {/* Banded pillar */}
      <rect x="7" y="10" width="6" height="3" fill="var(--navaid-cardinal)" />
      <rect x="7" y="13" width="6" height="3" fill="var(--bg-navy)" />
    </svg>
  );
};

// 5. Isolated danger — two stacked black spheres on a black/red/black banded pillar.
export const IsolatedDangerGlyph: FC<GlyphProps> = (props) => {
  const { size, className } = withDefaults(props);
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 20 20"
      aria-hidden="true"
      focusable="false"
    >
      <circle cx="10" cy="4" r="2" fill="var(--navaid-isolated)" />
      <circle cx="10" cy="9" r="2" fill="var(--navaid-isolated)" />
      <rect x="8" y="12" width="4" height="5" fill="var(--navaid-port)" />
      <rect x="8" y="12" width="4" height="1.5" fill="var(--navaid-isolated)" />
      <rect x="8" y="15.5" width="4" height="1.5" fill="var(--navaid-isolated)" />
    </svg>
  );
};

// 6. Special buoy — yellow saltire (X).
export const SpecialGlyph: FC<GlyphProps> = (props) => {
  const { size, className } = withDefaults(props);
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 20 20"
      aria-hidden="true"
      focusable="false"
    >
      <path
        d="M4 4 L16 16 M16 4 L4 16"
        stroke="var(--navaid-special)"
        strokeWidth="3"
        strokeLinecap="round"
      />
    </svg>
  );
};

// 7. Light — 8-ray radiant asterisk in magenta.
export const LightGlyph: FC<GlyphProps> = (props) => {
  const { size, className } = withDefaults(props);
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 20 20"
      aria-hidden="true"
      focusable="false"
    >
      <g stroke="var(--navaid-light-glow)" strokeWidth="1.5" strokeLinecap="round">
        <path d="M10 2 L10 18" />
        <path d="M2 10 L18 10" />
        <path d="M4 4 L16 16" />
        <path d="M16 4 L4 16" />
      </g>
      <circle cx="10" cy="10" r="1.5" fill="var(--navaid-light-glow)" />
    </svg>
  );
};

// 8. Wreck — bare X with two mast dots.
export const WreckGlyph: FC<GlyphProps> = (props) => {
  const { size, className } = withDefaults(props);
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 20 20"
      aria-hidden="true"
      focusable="false"
    >
      <path
        d="M4 4 L16 16 M16 4 L4 16"
        stroke="var(--navaid-wreck)"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <circle cx="6" cy="6" r="1" fill="var(--navaid-wreck)" />
      <circle cx="14" cy="6" r="1" fill="var(--navaid-wreck)" />
    </svg>
  );
};
