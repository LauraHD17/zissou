// S-57 → plain English for navigational aids. The functions here take raw
// feature properties (as they come out of the NOAA ENC PMTiles) and return
// short, helm-readable phrases for the NavaidDetailPanel and on-chart labels.
//
// Every string is written to the project's plain-language rule (WCAG 3.1.5,
// lower-secondary reading level): short sentences, concrete verbs, no
// navigational jargon like "inbound" without a gloss.

export type NavaidKind =
  | 'boylat'
  | 'boysaw'
  | 'boycar'
  | 'boyisd'
  | 'boyspp'
  | 'bcnlat'
  | 'bcnsaw'
  | 'bcncar'
  | 'bcnisd'
  | 'lights'
  | 'wrecks'
  | 'obstrn'
  | 'soundg';

export interface NavaidProperties {
  OBJNAM?: string;
  COLOUR?: string | number;
  COLPAT?: string | number;
  CATLAM?: number;
  CATCAM?: number;
  CATSPM?: number;
  CATOBS?: number;
  CATWRK?: number;
  LITCHR?: number;
  SIGPER?: number;
  VALNMR?: number;
  TOPSHP?: number;
  /** Soundings: depth in meters referenced to mean lower low water. Some
   *  NOAA builds write it as VALSOU, others as DEPTH — both handled. */
  VALSOU?: number;
  DEPTH?: number;
}

export interface NavaidNarrative {
  /** Main heading — "Red buoy, port hand — #7" style. */
  title: string;
  /** One-line kind + guidance — "Lateral mark · keep to your left returning from sea". */
  kind: string;
  /** Light characteristic sentence, if this aid is lit. */
  light?: string;
  /** Visible-range sentence from VALNMR. */
  range?: string;
  /** Formatted lat/lon; caller passes lngLat since it lives on the event, not the feature. */
  position?: string;
}

export interface NavaidInput {
  kind: NavaidKind;
  properties: NavaidProperties;
  lng: number;
  lat: number;
}

export function buildNavaidNarrative(input: NavaidInput): NavaidNarrative {
  const { kind, properties, lng, lat } = input;
  return {
    title: buildTitle(kind, properties),
    kind: buildKindLine(kind, properties),
    light: buildLightLine(properties),
    range: buildRangeLine(properties),
    position: formatLatLon(lat, lng),
  };
}

function buildTitle(kind: NavaidKind, p: NavaidProperties): string {
  const name = p.OBJNAM?.trim();
  const color = colorWord(p.COLOUR);
  const shape = shapeWord(kind);
  const number = name ? ` — ${name}` : '';

  if (kind === 'soundg') {
    // Title is filled in by the panel with the tide-adjusted value — the
    // narrative util doesn't know the current tide height, so we leave a
    // generic placeholder the panel overrides.
    return 'Spot depth';
  }
  if (kind === 'boylat' || kind === 'bcnlat') {
    const side = p.CATLAM === 1 ? 'port hand' : p.CATLAM === 2 ? 'starboard hand' : null;
    if (color && side) return cap(`${color} ${shape}, ${side}${number}`);
    if (color) return cap(`${color} ${shape}${number}`);
    return cap(`${shape}${number}`);
  }
  if (kind === 'boysaw' || kind === 'bcnsaw') {
    return cap(`Safe-water ${shape}${number}`);
  }
  if (kind === 'boycar' || kind === 'bcncar') {
    const card = cardinalWord(p.CATCAM);
    return card ? cap(`${card} cardinal ${shape}${number}`) : cap(`Cardinal ${shape}${number}`);
  }
  if (kind === 'boyisd' || kind === 'bcnisd') {
    return cap(`Isolated danger${number}`);
  }
  if (kind === 'boyspp') {
    return cap(`Special buoy${number}`);
  }
  if (kind === 'lights') {
    return cap(`Light${number}`);
  }
  if (kind === 'wrecks') {
    return cap(`Wreck${number}`);
  }
  return cap(`Obstruction${number}`);
}

function buildKindLine(kind: NavaidKind, p: NavaidProperties): string {
  if (kind === 'soundg') {
    // Kind-line is overridden by the panel with the tide breakdown, since it
    // needs the live tide value. This generic text only shows if a caller
    // uses the narrative util outside the panel.
    return 'Water depth at this spot';
  }
  if (kind === 'boylat' || kind === 'bcnlat') {
    if (p.CATLAM === 1) return 'Lateral mark · keep to your left when returning from sea';
    if (p.CATLAM === 2) return 'Lateral mark · keep to your right when returning from sea';
    return 'Lateral mark';
  }
  if (kind === 'boysaw' || kind === 'bcnsaw') {
    return 'Safe-water mark · mid-channel, safe to pass either side';
  }
  if (kind === 'boycar' || kind === 'bcncar') {
    const card = cardinalWord(p.CATCAM);
    if (card === 'North') return 'Cardinal mark · safe water is to the north';
    if (card === 'South') return 'Cardinal mark · safe water is to the south';
    if (card === 'East') return 'Cardinal mark · safe water is to the east';
    if (card === 'West') return 'Cardinal mark · safe water is to the west';
    return 'Cardinal mark';
  }
  if (kind === 'boyisd' || kind === 'bcnisd') {
    return 'Isolated danger · shallow water or obstruction right here';
  }
  if (kind === 'boyspp') {
    return 'Special mark · anchorage, cable, or recreation area';
  }
  if (kind === 'lights') {
    return 'Navigational light';
  }
  if (kind === 'wrecks') {
    if (p.CATWRK === 2) return 'Dangerous wreck';
    if (p.CATWRK === 3) return 'Wreck · not dangerous';
    return 'Wreck';
  }
  return 'Obstruction';
}

function buildLightLine(p: NavaidProperties): string | undefined {
  if (p.LITCHR == null) return undefined;
  const pattern = litcharWord(p.LITCHR);
  const color = colorWord(p.COLOUR);
  const per = p.SIGPER != null && p.SIGPER > 0 ? ` every ${p.SIGPER} seconds` : '';
  if (color && pattern) return `${pattern} ${color}${per}`;
  if (pattern) return `${pattern}${per}`;
  if (color) return `${cap(color)} light${per}`;
  return undefined;
}

function buildRangeLine(p: NavaidProperties): string | undefined {
  if (p.VALNMR == null || p.VALNMR <= 0) return undefined;
  const n = Math.round(p.VALNMR);
  return `Visible ${n} ${n === 1 ? 'mile' : 'miles'}`;
}

// ── S-57 code → word helpers ───────────────────────────────────────────────

// S-57 attribute COLOUR is a comma-separated list of colour codes. We return
// a human single-word summary based on the first (primary) code.
export function colorWord(raw?: string | number): string | null {
  if (raw == null) return null;
  const first = String(raw).split(',')[0]?.trim();
  if (!first) return null;
  switch (first) {
    case '1':
      return 'white';
    case '2':
      return 'black';
    case '3':
      return 'red';
    case '4':
      return 'green';
    case '5':
      return 'blue';
    case '6':
      return 'yellow';
    case '7':
      return 'grey';
    case '8':
      return 'brown';
    case '9':
      return 'amber';
    case '10':
      return 'violet';
    case '11':
      return 'orange';
    case '12':
      return 'magenta';
    case '13':
      return 'pink';
    default:
      return null;
  }
}

// S-57 LITCHR → plain-language descriptor. Not all codes are used on US charts;
// we cover the ones we actually see on NOAA ENC plus fall back to "Flashing"
// so the panel never shows a bare code.
export function litcharWord(code: number): string {
  switch (code) {
    case 1:
      return 'Steady';
    case 2:
      return 'Flashing';
    case 3:
      return 'Long flash';
    case 4:
      return 'Quick flashing';
    case 5:
      return 'Very quick flashing';
    case 6:
      return 'Ultra quick flashing';
    case 7:
      return 'Equal on and off';
    case 8:
      return 'Occulting'; // mostly on, brief off
    case 9:
      return 'Interrupted';
    case 10:
      return 'Fixed and flashing';
    case 11:
      return 'Group flashing';
    case 12:
      return 'Morse code';
    case 25:
      return 'Alternating colors';
    default:
      return 'Flashing';
  }
}

export function cardinalWord(code?: number): string | null {
  switch (code) {
    case 1:
      return 'North';
    case 2:
      return 'East';
    case 3:
      return 'South';
    case 4:
      return 'West';
    default:
      return null;
  }
}

function shapeWord(kind: NavaidKind): string {
  if (kind.startsWith('bcn')) return 'beacon';
  if (kind === 'lights') return 'light';
  if (kind === 'wrecks') return 'wreck';
  if (kind === 'obstrn') return 'obstruction';
  if (kind === 'soundg') return 'spot depth';
  return 'buoy';
}

/**
 * Feet-at-low-tide → feet-right-now given current tide height. Used in the
 * NavaidDetailPanel to turn a charted sounding into the thing the operator
 * actually wants ("About 16 ft right now"). tideFt is signed — negative on
 * spring lows.
 */
export function soundingNowFeet(valsouMeters: number, tideFt: number): number {
  const ftAtLow = valsouMeters * 3.28084;
  return Math.max(0, ftAtLow + tideFt);
}

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// DD → DDD°MM.mmm′ format matches the project's coordinate readouts.
export function formatLatLon(lat: number, lng: number): string {
  const latAbs = Math.abs(lat);
  const lngAbs = Math.abs(lng);
  const latDeg = Math.floor(latAbs);
  const latMin = (latAbs - latDeg) * 60;
  const lngDeg = Math.floor(lngAbs);
  const lngMin = (lngAbs - lngDeg) * 60;
  const latHem = lat >= 0 ? 'N' : 'S';
  const lngHem = lng >= 0 ? 'E' : 'W';
  return `${latDeg}°${latMin.toFixed(1)}′${latHem} · ${lngDeg}°${lngMin.toFixed(1)}′${lngHem}`;
}
