import { describe, expect, it } from 'vitest';
import { composeDepthStory } from './depthStory';

// 4 ft ≈ 1.2192 m; 18 ft ≈ 5.4864 m.
const FT4_M = 1.2192;
const FT18_M = 5.4864;

describe('composeDepthStory', () => {
  it('sounding + live tide: computed "now" depth with the charted breakdown', () => {
    const story = composeDepthStory({
      chartedMeters: FT4_M,
      source: 'sounding',
      tideFt: 8.2,
      tideIsEstimate: false,
    });
    expect(story.headline).toBe('About 12 ft here now');
    expect(story.detail).toBe('Charted 4 ft at low water + 8.2 ft of tide');
  });

  it('sounding + estimated tide: NEVER fabricates a live depth', () => {
    const story = composeDepthStory({
      chartedMeters: FT4_M,
      source: 'sounding',
      tideFt: 8.2,
      tideIsEstimate: true,
    });
    expect(story.headline).toBe('Tide unknown');
    expect(story.detail).toBe('Charted 4 ft at low water — live depth unavailable');
    expect(story.headline + story.detail).not.toMatch(/12/);
  });

  it('contour + live tide: names the depth line and the computed depth', () => {
    const story = composeDepthStory({
      chartedMeters: FT18_M,
      source: 'contour',
      tideFt: 8.2,
      tideIsEstimate: false,
    });
    expect(story.headline).toBe('Near the 18-ft depth line');
    expect(story.detail).toBe('Charted 18 ft at low water + 8.2 ft of tide ≈ 26 ft now');
  });

  it('contour + estimated tide: charted only', () => {
    const story = composeDepthStory({
      chartedMeters: FT18_M,
      source: 'contour',
      tideFt: 8.2,
      tideIsEstimate: true,
    });
    expect(story.headline).toBe('Near the 18-ft depth line');
    expect(story.detail).toBe('Charted 18 ft at low water — tide unknown');
  });

  it('negative (spring-low) tide subtracts and floors at 0', () => {
    const story = composeDepthStory({
      chartedMeters: FT4_M,
      source: 'sounding',
      tideFt: -0.8,
      tideIsEstimate: false,
    });
    expect(story.headline).toBe('About 3 ft here now');
    expect(story.detail).toBe('Charted 4 ft at low water − 0.8 ft of tide (below low water)');

    const dried = composeDepthStory({
      chartedMeters: 0.3, // ~1 ft charted
      source: 'sounding',
      tideFt: -2,
      tideIsEstimate: false,
    });
    expect(dried.headline).toBe('About 0 ft here now'); // soundingNowFeet floors at 0
  });

  it('formats clean feet without decimals and messy feet with one', () => {
    const story = composeDepthStory({
      chartedMeters: 2.5, // 8.2 ft
      source: 'sounding',
      tideFt: 3,
      tideIsEstimate: false,
    });
    expect(story.detail).toBe('Charted 8.2 ft at low water + 3 ft of tide');
  });
});
