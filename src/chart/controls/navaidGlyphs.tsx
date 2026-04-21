// Inline SVG glyphs for the NavaidLegend. Visually identical to the
// on-chart sprite silhouettes so the legend row and the map marker look
// like the same object. The shape data below is authored to match the
// SVG files under sprites/navaid/day/ — if you change a silhouette here,
// update the corresponding sprite source and re-run `npm run build:sprites`.
//
// Every glyph renders at 14px (legend default) or any explicit size, with
// fills sourced from CSS custom properties so night-mode tinting is free.

import type { FC, ReactNode } from 'react';

interface GlyphProps {
  size?: number;
  className?: string;
}

const DEFAULT_SIZE = 14;
const DEFAULT_CLASS = 'navaid-legend__glyph';

// Shared SVG wrapper — every glyph is 20×20 viewBox, hidden from ARIA,
// and focusable={false} so it doesn't interfere with keyboard nav.
function Glyph({
  size = DEFAULT_SIZE,
  className = DEFAULT_CLASS,
  children,
}: GlyphProps & { children: ReactNode }) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 20 20"
      aria-hidden="true"
      focusable="false"
    >
      {children}
    </svg>
  );
}

// Each entry is just the inner shape data for its glyph — the wrapper
// <svg> is supplied by <Glyph>. Colors reference CSS vars so night-mode
// is transparent to this file.
export const LateralPortGlyph: FC<GlyphProps> = (props) => (
  <Glyph {...props}>
    <rect x="6" y="4" width="8" height="10" fill="var(--navaid-port)" stroke="var(--bg-navy)" strokeWidth="1" />
    <path d="M4 16 L16 16" stroke="var(--bg-navy)" strokeWidth="1.5" />
  </Glyph>
);

export const LateralStarboardGlyph: FC<GlyphProps> = (props) => (
  <Glyph {...props}>
    <polygon
      points="5,14 15,14 12,4 8,4"
      fill="var(--navaid-starboard)"
      stroke="var(--bg-navy)"
      strokeWidth="1"
    />
    <path d="M4 16 L16 16" stroke="var(--bg-navy)" strokeWidth="1.5" />
  </Glyph>
);

export const SafeWaterGlyph: FC<GlyphProps> = (props) => (
  <Glyph {...props}>
    <circle cx="10" cy="10" r="6" fill="var(--surface-sand)" stroke="var(--bg-navy)" strokeWidth="1" />
    <rect x="9" y="4" width="2" height="12" fill="var(--navaid-safe-water)" />
  </Glyph>
);

// North-cardinal shown as the family representative — buoy shape is
// direction-independent in the compact legend.
export const CardinalGlyph: FC<GlyphProps> = (props) => (
  <Glyph {...props}>
    <polygon points="10,2 8,5 12,5" fill="var(--bg-navy)" />
    <polygon points="10,6 8,9 12,9" fill="var(--bg-navy)" />
    <rect x="7" y="10" width="6" height="3" fill="var(--navaid-cardinal)" />
    <rect x="7" y="13" width="6" height="3" fill="var(--bg-navy)" />
  </Glyph>
);

export const IsolatedDangerGlyph: FC<GlyphProps> = (props) => (
  <Glyph {...props}>
    <circle cx="10" cy="4" r="2" fill="var(--navaid-isolated)" />
    <circle cx="10" cy="9" r="2" fill="var(--navaid-isolated)" />
    <rect x="8" y="12" width="4" height="5" fill="var(--navaid-port)" />
    <rect x="8" y="12" width="4" height="1.5" fill="var(--navaid-isolated)" />
    <rect x="8" y="15.5" width="4" height="1.5" fill="var(--navaid-isolated)" />
  </Glyph>
);

export const SpecialGlyph: FC<GlyphProps> = (props) => (
  <Glyph {...props}>
    <path
      d="M4 4 L16 16 M16 4 L4 16"
      stroke="var(--navaid-special)"
      strokeWidth="3"
      strokeLinecap="round"
    />
  </Glyph>
);

export const LightGlyph: FC<GlyphProps> = (props) => (
  <Glyph {...props}>
    <g stroke="var(--navaid-light-glow)" strokeWidth="1.5" strokeLinecap="round">
      <path d="M10 2 L10 18" />
      <path d="M2 10 L18 10" />
      <path d="M4 4 L16 16" />
      <path d="M16 4 L4 16" />
    </g>
    <circle cx="10" cy="10" r="1.5" fill="var(--navaid-light-glow)" />
  </Glyph>
);

export const WreckGlyph: FC<GlyphProps> = (props) => (
  <Glyph {...props}>
    <path
      d="M4 4 L16 16 M16 4 L4 16"
      stroke="var(--navaid-wreck)"
      strokeWidth="2"
      strokeLinecap="round"
    />
    <circle cx="6" cy="6" r="1" fill="var(--navaid-wreck)" />
    <circle cx="14" cy="6" r="1" fill="var(--navaid-wreck)" />
  </Glyph>
);
