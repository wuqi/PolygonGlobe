import {
  geoCubic,
  geoDodecahedral,
  geoRhombic,
  geoDeltoidal,
  geoIcosahedral,
  geoAirocean,
  geoTetrahedralLee,
  geoPolyhedralButterfly,
} from 'd3-geo-polygon';

export const STOCK = [
  { key: 'cubic', name: '立方体', create: () => geoCubic() },
  { key: 'dodecahedral', name: '十二面体', create: () => geoDodecahedral() },
  { key: 'rhombic', name: '菱形十二面体', create: () => geoRhombic() },
  { key: 'deltoidal', name: '风筝形', create: () => geoDeltoidal() },
  { key: 'icosahedral', name: '二十面体', create: () => geoIcosahedral() },
  { key: 'airocean', name: 'Airocean', create: () => geoAirocean() },
  { key: 'lee', name: 'Lee四面体', create: () => geoTetrahedralLee() },
  { key: 'butterfly', name: '蝴蝶形', create: () => geoPolyhedralButterfly() },
];

export function createProjection(key) {
  const item = STOCK.find((s) => s.key === key);
  if (!item) throw new Error(`unknown projection: ${key}`);
  return item.create();
}
