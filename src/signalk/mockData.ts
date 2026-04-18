import type { SignalKDelta } from './types';

// Deliberately messy mock data. Real AIS is noisy and broken in specific ways;
// if the UI is only tested against clean data it will fall over on first contact
// with real bay traffic. Each archetype below reproduces a failure mode seen in
// the wild.

type Emit = (delta: SignalKDelta) => void;

const SELF_START = { latitude: 41.505, longitude: -71.315 }; // generic NE coastal

export function startMockStream(emit: Emit): () => void {
  const handles: ReturnType<typeof setInterval>[] = [];
  const timeouts: ReturnType<typeof setTimeout>[] = [];

  // Emit initial "static" info (names, MMSIs, ship types) once, immediately.
  // Position/SOG/COG start flowing on their own intervals below.
  timeouts.push(setTimeout(() => emitInitialMetadata(emit), 50));

  handles.push(setInterval(() => emitSelf(emit), 1000));
  handles.push(setInterval(() => emitCleanFreighter(emit), 2000));
  handles.push(setInterval(() => emitAnchoredFisher(emit), 3000));
  handles.push(setInterval(() => emitMMSIOnly(emit), 1500));
  handles.push(setInterval(() => emitFastErratic(emit), 800));
  handles.push(setInterval(() => emitVeryClose(emit), 1200));
  handles.push(setInterval(() => emitVeryFar(emit), 4000));
  handles.push(setInterval(() => emitWildCoords(emit), 5000));

  // Stuck / stale: reports once, never again. The UI must flag it as stale.
  timeouts.push(setTimeout(() => emitStuckVessel(emit), 200));

  // "Name but no position yet" — never emits position. The UI must not crash
  // when asked to draw a vessel with no coordinates.
  timeouts.push(setTimeout(() => emitPositionlessVessel(emit), 300));

  return () => {
    handles.forEach(clearInterval);
    timeouts.forEach(clearTimeout);
  };
}

// ── Archetypes ──────────────────────────────────────────────────────────────

const selfState = { ...SELF_START, heading: 90, sog: 4.2 };

function emitSelf(emit: Emit) {
  // Wobble: heading drifts, SOG jitters, position advances.
  selfState.heading = (selfState.heading + (Math.random() - 0.5) * 4 + 360) % 360;
  selfState.sog = Math.max(0, selfState.sog + (Math.random() - 0.5) * 0.3);
  const advance = metersToDegrees(selfState.sog * 0.514 * 1, selfState.latitude);
  selfState.latitude += advance.lat * Math.cos(rad(selfState.heading));
  selfState.longitude += advance.lon * Math.sin(rad(selfState.heading));

  emit({
    context: 'vessels.self',
    updates: [
      {
        timestamp: new Date().toISOString(),
        values: [
          { path: 'name', value: 'Sisu' },
          { path: 'navigation.position', value: { latitude: selfState.latitude, longitude: selfState.longitude } },
          { path: 'navigation.speedOverGround', value: selfState.sog },
          { path: 'navigation.courseOverGroundTrue', value: selfState.heading },
        ],
      },
    ],
  });
}

const freighterState = { latitude: 41.58, longitude: -71.24, cog: 230, sog: 12.8 };

function emitCleanFreighter(emit: Emit) {
  const advance = metersToDegrees(freighterState.sog * 0.514 * 2, freighterState.latitude);
  freighterState.latitude += advance.lat * Math.cos(rad(freighterState.cog));
  freighterState.longitude += advance.lon * Math.sin(rad(freighterState.cog));

  emit({
    context: 'vessels.urn:mrn:imo:mmsi:366999712',
    updates: [
      {
        timestamp: new Date().toISOString(),
        values: [
          { path: 'navigation.position', value: { latitude: freighterState.latitude, longitude: freighterState.longitude } },
          { path: 'navigation.speedOverGround', value: freighterState.sog + (Math.random() - 0.5) * 0.4 },
          { path: 'navigation.courseOverGroundTrue', value: freighterState.cog },
          { path: 'navigation.state', value: 'underway' },
        ],
      },
    ],
  });
}

function emitAnchoredFisher(emit: Emit) {
  // Anchored: SOG=0, no COG reported. Position drifts a few meters from swing.
  const jitter = (Math.random() - 0.5) * 0.00003;
  emit({
    context: 'vessels.urn:mrn:imo:mmsi:338112233',
    updates: [
      {
        timestamp: new Date().toISOString(),
        values: [
          { path: 'navigation.position', value: { latitude: 41.498 + jitter, longitude: -71.322 + jitter } },
          { path: 'navigation.speedOverGround', value: 0 },
          { path: 'navigation.state', value: 'at anchor' },
          // No COG: real anchored AIS often omits it entirely.
        ],
      },
    ],
  });
}

const mmsiOnlyState = { latitude: 41.54, longitude: -71.28, cog: 45, sog: 7.5 };

function emitMMSIOnly(emit: Emit) {
  // No name — this vessel never transmitted a static report (or we missed it).
  // Class B units often go minutes before sending static data.
  const advance = metersToDegrees(mmsiOnlyState.sog * 0.514 * 1.5, mmsiOnlyState.latitude);
  mmsiOnlyState.latitude += advance.lat * Math.cos(rad(mmsiOnlyState.cog));
  mmsiOnlyState.longitude += advance.lon * Math.sin(rad(mmsiOnlyState.cog));

  emit({
    context: 'vessels.urn:mrn:imo:mmsi:367000123',
    updates: [
      {
        timestamp: new Date().toISOString(),
        values: [
          { path: 'navigation.position', value: { latitude: mmsiOnlyState.latitude, longitude: mmsiOnlyState.longitude } },
          { path: 'navigation.speedOverGround', value: mmsiOnlyState.sog },
          { path: 'navigation.courseOverGroundTrue', value: mmsiOnlyState.cog },
        ],
      },
    ],
  });
}

const fastErraticState = { latitude: 41.51, longitude: -71.29, cog: 120, sog: 28 };

function emitFastErratic(emit: Emit) {
  // Recreational power boat, bad GPS smoothing: COG jumps around, SOG spikes.
  fastErraticState.cog = (fastErraticState.cog + (Math.random() - 0.5) * 40 + 360) % 360;
  fastErraticState.sog = Math.max(0, 25 + (Math.random() - 0.5) * 12);
  const advance = metersToDegrees(fastErraticState.sog * 0.514 * 0.8, fastErraticState.latitude);
  fastErraticState.latitude += advance.lat * Math.cos(rad(fastErraticState.cog));
  fastErraticState.longitude += advance.lon * Math.sin(rad(fastErraticState.cog));

  emit({
    context: 'vessels.urn:mrn:imo:mmsi:338555777',
    updates: [
      {
        timestamp: new Date().toISOString(),
        values: [
          { path: 'navigation.position', value: { latitude: fastErraticState.latitude, longitude: fastErraticState.longitude } },
          { path: 'navigation.speedOverGround', value: fastErraticState.sog },
          { path: 'navigation.courseOverGroundTrue', value: fastErraticState.cog },
        ],
      },
    ],
  });
}

function emitVeryClose(emit: Emit) {
  // ~200m off our bow — proximity alert territory.
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
          { path: 'navigation.speedOverGround', value: 2.1 },
          { path: 'navigation.courseOverGroundTrue', value: (Date.now() / 200) % 360 },
        ],
      },
    ],
  });
}

function emitVeryFar(emit: Emit) {
  // ~15nm away, at edge of AIS range.
  emit({
    context: 'vessels.urn:mrn:imo:mmsi:538008192',
    updates: [
      {
        timestamp: new Date().toISOString(),
        values: [
          { path: 'navigation.position', value: { latitude: 41.74, longitude: -71.12 } },
          { path: 'navigation.speedOverGround', value: 14.2 },
          { path: 'navigation.courseOverGroundTrue', value: 190 },
        ],
      },
    ],
  });
}

function emitWildCoords(emit: Emit) {
  // Garbage position — sometimes a receiver emits a bogus frame.
  // The UI must filter or flag this rather than placing a dot at 0,0.
  emit({
    context: 'vessels.urn:mrn:imo:mmsi:111222333',
    updates: [
      {
        timestamp: new Date().toISOString(),
        values: [
          { path: 'navigation.position', value: { latitude: 0, longitude: 0 } },
          { path: 'navigation.speedOverGround', value: 999 },
          { path: 'navigation.courseOverGroundTrue', value: 511 }, // 511 = "not available" in AIS
        ],
      },
    ],
  });
}

function emitStuckVessel(emit: Emit) {
  // Reports once, with a timestamp already 12 minutes in the past, then goes silent.
  const twelveMinAgo = new Date(Date.now() - 12 * 60 * 1000).toISOString();
  emit({
    context: 'vessels.urn:mrn:imo:mmsi:367888999',
    updates: [
      {
        timestamp: twelveMinAgo,
        values: [
          { path: 'navigation.position', value: { latitude: 41.52, longitude: -71.35 } },
          { path: 'navigation.speedOverGround', value: 0.2 },
          { path: 'navigation.courseOverGroundTrue', value: 88 },
        ],
      },
    ],
  });
}

function emitPositionlessVessel(emit: Emit) {
  // Static data only — no position ever transmitted. Tests list rendering when
  // we know the vessel exists but can't place it on a chart.
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
    updates: [{ values: [{ path: 'name', value: 'MAERSK GATEWAY' }, { path: 'design.aisShipType', value: 70 }] }],
  });
  emit({
    context: 'vessels.urn:mrn:imo:mmsi:338112233',
    updates: [{ values: [{ path: 'name', value: 'Miss Carol' }, { path: 'design.aisShipType', value: 30 }] }],
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
    updates: [{ values: [{ path: 'name', value: 'STAR ANTARES' }, { path: 'design.aisShipType', value: 80 }] }],
  });
  // 367000123 (MMSI-only) and 111222333 (wild) intentionally get no name.
}

// ── helpers ──────────────────────────────────────────────────────────────

function rad(deg: number) {
  return (deg * Math.PI) / 180;
}

function metersToDegrees(meters: number, lat: number) {
  return {
    lat: meters / 111_320,
    lon: meters / (111_320 * Math.cos(rad(lat))),
  };
}
