import { describe, expect, it } from 'vitest';
import {
  buildNavaidNarrative,
  cardinalWord,
  colorWord,
  formatLatLon,
  litcharWord,
} from './navaidNarrative';

describe('colorWord', () => {
  it('maps primary S-57 codes to English', () => {
    expect(colorWord(3)).toBe('red');
    expect(colorWord(4)).toBe('green');
    expect(colorWord(6)).toBe('yellow');
    expect(colorWord(1)).toBe('white');
    expect(colorWord(2)).toBe('black');
  });
  it('handles comma-separated COLOUR by taking the first code', () => {
    expect(colorWord('3,1')).toBe('red');
    expect(colorWord('4,1,4')).toBe('green');
  });
  it('returns null for unknown or missing', () => {
    expect(colorWord(undefined)).toBeNull();
    expect(colorWord(99)).toBeNull();
    expect(colorWord('')).toBeNull();
  });
});

describe('litcharWord', () => {
  it('covers the common US-waters characteristics', () => {
    expect(litcharWord(2)).toBe('Flashing');
    expect(litcharWord(8)).toBe('Occulting');
    expect(litcharWord(4)).toBe('Quick flashing');
    expect(litcharWord(7)).toBe('Equal on and off');
  });
  it('falls back to Flashing for unrecognised codes so the UI never shows a raw number', () => {
    expect(litcharWord(999)).toBe('Flashing');
  });
});

describe('cardinalWord', () => {
  it('maps the four quadrants', () => {
    expect(cardinalWord(1)).toBe('North');
    expect(cardinalWord(2)).toBe('East');
    expect(cardinalWord(3)).toBe('South');
    expect(cardinalWord(4)).toBe('West');
    expect(cardinalWord(undefined)).toBeNull();
  });
});

describe('buildNavaidNarrative', () => {
  const lngLat = { lat: 44.1, lng: -68.8 };

  it('renders a lateral port buoy with buoy number', () => {
    const n = buildNavaidNarrative({
      kind: 'boylat',
      properties: { OBJNAM: '7', COLOUR: 3, CATLAM: 1, LITCHR: 2, SIGPER: 4, VALNMR: 5 },
      ...lngLat,
    });
    expect(n.title).toBe('Red buoy, port hand — 7');
    expect(n.kind).toContain('keep to your left');
    expect(n.light).toBe('Flashing red every 4 seconds');
    expect(n.range).toBe('Visible 5 miles');
  });

  it('renders starboard hand guidance', () => {
    const n = buildNavaidNarrative({
      kind: 'boylat',
      properties: { COLOUR: 4, CATLAM: 2 },
      ...lngLat,
    });
    expect(n.title).toBe('Green buoy, starboard hand');
    expect(n.kind).toContain('keep to your right');
  });

  it('renders a cardinal buoy with direction', () => {
    const n = buildNavaidNarrative({
      kind: 'boycar',
      properties: { CATCAM: 2, OBJNAM: 'East Rockland' },
      ...lngLat,
    });
    expect(n.title).toBe('East cardinal buoy — East Rockland');
    expect(n.kind).toBe('Cardinal mark · safe water is to the east');
  });

  it('renders isolated danger with its danger-line guidance', () => {
    const n = buildNavaidNarrative({
      kind: 'boyisd',
      properties: {},
      ...lngLat,
    });
    expect(n.title).toBe('Isolated danger');
    expect(n.kind).toContain('obstruction right here');
  });

  it('renders wreck with CATWRK-based severity', () => {
    const dangerous = buildNavaidNarrative({
      kind: 'wrecks',
      properties: { CATWRK: 2 },
      ...lngLat,
    });
    expect(dangerous.kind).toBe('Dangerous wreck');
    const harmless = buildNavaidNarrative({
      kind: 'wrecks',
      properties: { CATWRK: 3 },
      ...lngLat,
    });
    expect(harmless.kind).toBe('Wreck · not dangerous');
  });

  it('omits light when LITCHR is not present', () => {
    const n = buildNavaidNarrative({
      kind: 'boylat',
      properties: { CATLAM: 1 },
      ...lngLat,
    });
    expect(n.light).toBeUndefined();
    expect(n.range).toBeUndefined();
  });

  it('uses plain-language verbs only (quick reading-level sanity check)', () => {
    // "Lateral mark" is the canonical IALA noun and appears on every chart,
    // so it's allowed. What's banned is jargon that assumes the operator
    // already speaks nav-talk: "inbound", "to starboard", etc.
    const n = buildNavaidNarrative({
      kind: 'boylat',
      properties: { CATLAM: 1 },
      ...lngLat,
    });
    const sentence = n.kind;
    const words = sentence.split(/\s+/);
    expect(words.length).toBeLessThan(14);
    expect(sentence).not.toMatch(/inbound/i);
    expect(sentence).not.toMatch(/to starboard/i);
    expect(sentence).toMatch(/your left|your right/i); // plain directional verb
  });
});

describe('formatLatLon', () => {
  it('formats N/W hemispheres', () => {
    expect(formatLatLon(44.1234, -68.5678)).toMatch(/44°7\.4′N · 68°34\.1′W/);
  });
  it('formats S/E hemispheres', () => {
    expect(formatLatLon(-33.5, 151.25)).toMatch(/33°30\.0′S · 151°15\.0′E/);
  });
});
