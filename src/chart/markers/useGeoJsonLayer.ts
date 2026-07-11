// Shared plumbing for the chart's GeoJSON overlay layers (heading vector,
// go-to route line, anchor watch circle). Each of those is the same two-part
// pattern: (1) add an empty geojson source + its paint layers to a freshly
// loaded style, idempotently; (2) push fresh feature data into the source when
// inputs change AND re-push after every style.load (a Marine/Harbor swap clears
// layer state, so the source comes back empty until the next push).

import type { Map as MapLibreMap, GeoJSONSource, LayerSpecification } from 'maplibre-gl';

const EMPTY: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [] };

/**
 * Add an empty geojson `source` and its `layers` to the style if not already
 * present. Idempotent — safe to call after every style.load (the getSource /
 * getLayer guards skip anything already there).
 */
export function ensureGeoJsonLayers(
  map: MapLibreMap,
  sourceId: string,
  layers: LayerSpecification[],
): void {
  if (!map.getSource(sourceId)) {
    map.addSource(sourceId, { type: 'geojson', data: EMPTY });
  }
  for (const layer of layers) {
    if (!map.getLayer(layer.id)) map.addLayer(layer);
  }
}

/**
 * Push `buildData()` into `sourceId` now, then again on every style.load, and
 * return an unsubscribe. Call from inside a marker's useEffect:
 *
 *   useEffect(() => {
 *     const map = mapRef.current;
 *     if (!map) return;
 *     return subscribeGeoJsonSource(map, SOURCE_ID, () => buildFeature(self));
 *   }, [mapRef, ...primitiveDeps]);
 *
 * The build closure and its deps stay in the caller so eslint's exhaustive-deps
 * still sees the real dependency list.
 */
export function subscribeGeoJsonSource(
  map: MapLibreMap,
  sourceId: string,
  buildData: () => GeoJSON.GeoJSON,
): () => void {
  const update = () => {
    const source = map.getSource(sourceId) as GeoJSONSource | undefined;
    if (!source) return;
    source.setData(buildData());
  };
  update();
  map.on('style.load', update);
  return () => {
    map.off('style.load', update);
  };
}
