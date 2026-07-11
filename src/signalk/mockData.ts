import type { SignalKDelta } from './types';

// Deliberately messy mock data. Real AIS is noisy and broken in specific ways;
// if the UI is only tested against clean data it will fall over on first contact
// with real bay traffic. Each archetype below reproduces a failure mode seen in
// the wild.
//
// IMPORTANT: values emitted here follow the SignalK v1 spec —
//   speedOverGround: m/s
//   courseOverGroundTrue / headingTrue: radians
//   position: decimal degrees
// All conversion to display units happens in src/utils/units.ts at render time.

type Emit = (delta: SignalKDelta) => void;

// Castine, ME — eastern shore of Penobscot Bay. Chosen so the mock fleet
// overlaps the area covered by NOAA chart cell US5ME23M (built into our
// PMTiles via scripts/build-charts.sh). Move with the rest of the offsets
// below if you rebuild charts for a different region.
const SELF_START = { latitude: 44.395, longitude: -68.79 };

const DEG = (d: number) => (d * Math.PI) / 180;
const KN_TO_MS = 0.514444;

export function startMockStream(emit: Emit): () => void {
  const handles: ReturnType<typeof setInterval>[] = [];
  const timeouts: ReturnType<typeof setTimeout>[] = [];

  timeouts.push(setTimeout(() => emitInitialMetadata(emit), 50));

  handles.push(setInterval(() => emitSelf(emit), 1000));
  handles.push(setInterval(() => emitCleanFreighter(emit), 2000));
  handles.push(setInterval(() => emitAnchoredFisher(emit), 3000));
  handles.push(setInterval(() => emitMMSIOnly(emit), 1500));
  handles.push(setInterval(() => emitFastErratic(emit), 800));
  handles.push(setInterval(() => emitVeryClose(emit), 1200));
  handles.push(setInterval(() => emitVeryFar(emit), 4000));
  handles.push(setInterval(() => emitWildCoords(emit), 5000));

  timeouts.push(setTimeout(() => emitStuckVessel(emit), 200));
  timeouts.push(setTimeout(() => emitPositionlessVessel(emit), 300));

  return () => {
    handles.forEach(clearInterval);
    timeouts.forEach(clearTimeout);
  };
}

// ── Archetypes ──────────────────────────────────────────────────────────────

const selfState = {
  ...SELF_START,
  heading: DEG(90), // east, radians
  sogMs: 4.2 * KN_TO_MS,
};

function emitSelf(emit: Emit) {
  const twoPi = Math.PI * 2;
  selfState.heading = (selfState.heading + (Math.random() - 0.5) * DEG(4) + twoPi) % twoPi;
  selfState.sogMs = Math.max(0, selfState.sogMs + (Math.random() - 0.5) * 0.15);
  const advance = metersToDegrees(selfState.sogMs, selfState.latitude);
  selfState.latitude += advance.lat * Math.cos(selfState.heading);
  selfState.longitude += advance.lon * Math.sin(selfState.heading);

  emit({
    context: 'vessels.self',
    updates: [
      {
        timestamp: new Date().toISOString(),
        values: [
          { path: 'name', value: 'Sisu' },
          {
            path: 'navigation.position',
            value: { latitude: selfState.latitude, longitude: selfState.longitude },
          },
          { path: 'navigation.speedOverGround', value: selfState.sogMs },
          { path: 'navigation.courseOverGroundTrue', value: selfState.heading },
        ],
      },
    ],
  });
}

const freighterState = {
  latitude: 44.47,
  longitude: -68.715,
  cog: DEG(230),
  sogMs: 12.8 * KN_TO_MS,
};

function emitCleanFreighter(emit: Emit) {
  const advance = metersToDegrees(freighterState.sogMs * 2, freighterState.latitude);
  freighterState.latitude += advance.lat * Math.cos(freighterState.cog);
  freighterState.longitude += advance.lon * Math.sin(freighterState.cog);

  emit({
    context: 'vessels.urn:mrn:imo:mmsi:366999712',
    updates: [
      {
        timestamp: new Date().toISOString(),
        values: [
          {
            path: 'navigation.position',
            value: { latitude: freighterState.latitude, longitude: freighterState.longitude },
          },
          {
            path: 'navigation.speedOverGround',
            value: freighterState.sogMs + (Math.random() - 0.5) * 0.2,
          },
          { path: 'navigation.courseOverGroundTrue', value: freighterState.cog },
          { path: 'navigation.state', value: 'underway' },
        ],
      },
    ],
  });
}

function emitAnchoredFisher(emit: Emit) {
  const jitter = (Math.random() - 0.5) * 0.00003;
  emit({
    context: 'vessels.urn:mrn:imo:mmsi:338112233',
    updates: [
      {
        timestamp: new Date().toISOString(),
        values: [
          {
            path: 'navigation.position',
            value: { latitude: 44.388 + jitter, longitude: -68.797 + jitter },
          },
          { path: 'navigation.speedOverGround', value: 0 },
          { path: 'navigation.state', value: 'at anchor' },
          // No COG: real anchored AIS often omits it entirely.
        ],
      },
    ],
  });
}

const mmsiOnlyState = {
  latitude: 44.43,
  longitude: -68.755,
  cog: DEG(45),
  sogMs: 7.5 * KN_TO_MS,
};

function emitMMSIOnly(emit: Emit) {
  const advance = metersToDegrees(mmsiOnlyState.sogMs * 1.5, mmsiOnlyState.latitude);
  mmsiOnlyState.latitude += advance.lat * Math.cos(mmsiOnlyState.cog);
  mmsiOnlyState.longitude += advance.lon * Math.sin(mmsiOnlyState.cog);

  emit({
    context: 'vessels.urn:mrn:imo:mmsi:367000123',
    updates: [
      {
        timestamp: new Date().toISOString(),
        values: [
          {
            path: 'navigation.position',
            value: { latitude: mmsiOnlyState.latitude, longitude: mmsiOnlyState.longitude },
          },
          { path: 'navigation.speedOverGround', value: mmsiOnlyState.sogMs },
          { path: 'navigation.courseOverGroundTrue', value: mmsiOnlyState.cog },
        ],
      },
    ],
  });
}

const fastErraticState = {
  latitude: 44.4,
  longitude: -68.765,
  cog: DEG(120),
  sogMs: 28 * KN_TO_MS,
};

function emitFastErratic(emit: Emit) {
  const twoPi = Math.PI * 2;
  fastErraticState.cog = (fastErraticState.cog + (Math.random() - 0.5) * DEG(40) + twoPi) % twoPi;
  fastErraticState.sogMs = Math.max(0, (25 + (Math.random() - 0.5) * 12) * KN_TO_MS);
  const advance = metersToDegrees(fastErraticState.sogMs * 0.8, fastErraticState.latitude);
  fastErraticState.latitude += advance.lat * Math.cos(fastErraticState.cog);
  fastErraticState.longitude += advance.lon * Math.sin(fastErraticState.cog);

  emit({
    context: 'vessels.urn:mrn:imo:mmsi:338555777',
    updates: [
      {
        timestamp: new Date().toISOString(),
        values: [
          {
            path: 'navigation.position',
            value: { latitude: fastErraticState.latitude, longitude: fastErraticState.longitude },
          },
          { path: 'navigation.speedOverGround', value: fastErraticState.sogMs },
          { path: 'navigation.courseOverGroundTrue', value: fastErraticState.cog },
        ],
      },
    ],
  });
}

function emitVeryClose(emit: Emit) {
  const t = Date.now() / 10000;
  emit({
    context: 'vessels.urn:mrn:imo:mmsi:338444111',
    updates: [
      {
        timestamp: new Date().toISOString(),
        values: [
          {
            path: 'navigation.position',
            value: {
              latitude: selfState.latitude + 0.0018 * Math.cos(t),
              longitude: selfState.longitude + 0.0018 * Math.sin(t),
            },
          },
          { path: 'navigation.speedOverGround', value: 2.1 * KN_TO_MS },
          {
            path: 'navigation.courseOverGroundTrue',
            value: ((Date.now() / 200) % 360) * (Math.PI / 180),
          },
        ],
      },
    ],
  });
}

function emitVeryFar(emit: Emit) {
  emit({
    context: 'vessels.urn:mrn:imo:mmsi:538008192',
    updates: [
      {
        timestamp: new Date().toISOString(),
        values: [
          { path: 'navigation.position', value: { latitude: 44.63, longitude: -68.595 } },
          { path: 'navigation.speedOverGround', value: 14.2 * KN_TO_MS },
          { path: 'navigation.courseOverGroundTrue', value: DEG(190) },
        ],
      },
    ],
  });
}

function emitWildCoords(emit: Emit) {
  // Garbage frame — receiver emitted null-island coords and passed the AIS 511
  // "not available" sentinel through for COG, plus an impossible SOG.
  emit({
    context: 'vessels.urn:mrn:imo:mmsi:111222333',
    updates: [
      {
        timestamp: new Date().toISOString(),
        values: [
          { path: 'navigation.position', value: { latitude: 0, longitude: 0 } },
          { path: 'navigation.speedOverGround', value: 999 },
          { path: 'navigation.courseOverGroundTrue', value: DEG(511) },
        ],
      },
    ],
  });
}

function emitStuckVessel(emit: Emit) {
  const twelveMinAgo = new Date(Date.now() - 12 * 60 * 1000).toISOString();
  emit({
    context: 'vessels.urn:mrn:imo:mmsi:367888999',
    updates: [
      {
        timestamp: twelveMinAgo,
        values: [
          { path: 'navigation.position', value: { latitude: 44.41, longitude: -68.825 } },
          { path: 'navigation.speedOverGround', value: 0.2 * KN_TO_MS },
          { path: 'navigation.courseOverGroundTrue', value: DEG(88) },
        ],
      },
    ],
  });
}

function emitPositionlessVessel(emit: Emit) {
  emit({
    context: 'vessels.urn:mrn:imo:mmsi:319199000',
    updates: [
      {
        timestamp: new Date().toISOString(),
        values: [
          { path: 'name', value: 'M/V GHOST' },
          { path: 'design.aisShipType', value: 70 },
        ],
      },
    ],
  });
}

function emitInitialMetadata(emit: Emit) {
  emit({
    context: 'vessels.urn:mrn:imo:mmsi:366999712',
    updates: [
      {
        values: [
          { path: 'name', value: 'MAERSK GATEWAY' },
          { path: 'design.aisShipType', value: 70 },
        ],
      },
    ],
  });
  emit({
    context: 'vessels.urn:mrn:imo:mmsi:338112233',
    updates: [
      {
        values: [
          { path: 'name', value: 'Miss Carol' },
          { path: 'design.aisShipType', value: 30 },
        ],
      },
    ],
  });
  emit({
    context: 'vessels.urn:mrn:imo:mmsi:338555777',
    updates: [{ values: [{ path: 'name', value: 'Rec Vessel' }] }],
  });
  emit({
    context: 'vessels.urn:mrn:imo:mmsi:338444111',
    updates: [{ values: [{ path: 'name', value: 'Harbor Shuttle' }] }],
  });
  emit({
    context: 'vessels.urn:mrn:imo:mmsi:538008192',
    updates: [
      {
        values: [
          { path: 'name', value: 'STAR ANTARES' },
          { path: 'design.aisShipType', value: 80 },
        ],
      },
    ],
  });
}

// ── helpers ──────────────────────────────────────────────────────────────

function metersToDegrees(meters: number, lat: number) {
  return {
    lat: meters / 111_320,
    lon: meters / (111_320 * Math.cos((lat * Math.PI) / 180)),
  };
}
