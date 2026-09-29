import { geoArea } from 'd3-geo';
import world from '@surbowl/world-geo-json-zh';

function fixRing(ring) {
  const area = geoArea({ type: 'Polygon', coordinates: [ring] });
  if (area > 2 * Math.PI) return [...ring].reverse();
  return ring;
}

function fixFeature(feature) {
  const g = feature.geometry;
  if (g.type === 'Polygon') {
    g.coordinates = g.coordinates.map(fixRing);
  } else if (g.type === 'MultiPolygon') {
    g.coordinates = g.coordinates.map((polygon) => polygon.map(fixRing));
  }
  return feature;
}

export const worldFeatures = world.features.map(fixFeature);

export const chinaFeature = worldFeatures.find((f) => f.properties.iso_a2 === 'CN');

export const sphere = { type: 'Sphere' };
