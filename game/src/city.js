// Coral Bay itself: the road grid, the districts, every building, tree and
// prop, the traffic lights and the named places the story uses. The city is
// generated from the seed, so a seed always builds the same streets. Roads
// run on a grid; east of the last avenue the city gives way to the boardwalk,
// the sand and the water.
import { BEACH, GRID, WORLD } from './config.js';
import { clamp } from './rng.js';

/** District names, used for ground colour and building style. */
export const DISTRICT = {
  DOWNTOWN: 'downtown',
  SUBURBS: 'suburbs',
  INDUSTRIAL: 'industrial',
  PARK: 'park',
  BEACHFRONT: 'beachfront',
  DOCKS: 'docks',
};

const TOWER_COLORS = ['#c8b8a2', '#a8bfce', '#d9c6b0', '#b0a8c0', '#c4cfd6', '#e0cfa8', '#a9c6bb', '#d3a58f'];
const HOUSE_COLORS = ['#e8dcc4', '#dfe8d8', '#f0e0cc', '#e4d4e0', '#d8e4ee', '#f2e6c8'];
const ROOF_COLORS = ['#a34a3a', '#7a6a58', '#5f7a72', '#8a5a44', '#6a6f7a'];

/** The road centre lines: vertical avenues west to east, horizontal streets north to south. */
export function roadLines() {
  const v = [];
  const h = [];
  for (let i = 0; i < GRID.cols; i += 1) v.push(GRID.x0 + i * GRID.pitch);
  for (let j = 0; j < GRID.rows; j += 1) h.push(GRID.y0 + j * GRID.pitch);
  return { v, h };
}

/** The land segments between roads: [start, end] pairs along each axis. */
function segments(lines, limit) {
  const out = [];
  let prev = 0;
  for (const line of lines) {
    out.push([prev, line - GRID.roadW / 2]);
    prev = line + GRID.roadW / 2;
  }
  out.push([prev, limit]);
  return out;
}

/** Which district a block cell belongs to, by its segment indices. */
function districtOf(col, row, cols, rows) {
  if (col === 2 && row === 3) return DISTRICT.PARK;
  if (col === cols - 1) return DISTRICT.BEACHFRONT;
  if (row === rows - 1) return DISTRICT.DOCKS;
  if (row >= rows - 2 && col >= 4) return DISTRICT.INDUSTRIAL;
  if (col >= 3 && col <= 5 && row >= 2 && row <= 4) return DISTRICT.DOWNTOWN;
  if (col <= 1 || row <= 1) return DISTRICT.SUBURBS;
  return DISTRICT.DOWNTOWN;
}

/** Fill one block cell with buildings, leaving a sidewalk rim. Returns nothing; pushes into city. */
function fillBlock(city, rng, block) {
  const { x, y, w, h, district } = block;
  const inset = 17;
  const ix = x + inset;
  const iy = y + inset;
  const iw = w - inset * 2;
  const ih = h - inset * 2;
  if (iw < 60 || ih < 60 || district === DISTRICT.PARK) return;
  const add = (bx, by, bw, bh, color, roof, floors) => {
    city.buildings.push({ x: bx, y: by, w: bw, h: bh, color, roof, floors, district });
  };
  if (district === DISTRICT.DOWNTOWN) {
    if (rng.chance(0.72)) {
      const bw = iw * rng.range(0.62, 0.8);
      const bh = ih * rng.range(0.62, 0.8);
      add(ix + (iw - bw) / 2, iy + (ih - bh) / 2, bw, bh, rng.pick(TOWER_COLORS), rng.pick(ROOF_COLORS), rng.int(6, 14));
    } else {
      const bw = iw * 0.44;
      const bh = ih * 0.44;
      add(ix, iy, bw, bh, rng.pick(TOWER_COLORS), rng.pick(ROOF_COLORS), rng.int(4, 8));
      add(ix + iw - bw, iy + ih - bh, bw, bh, rng.pick(TOWER_COLORS), rng.pick(ROOF_COLORS), rng.int(4, 9));
    }
  } else if (district === DISTRICT.SUBURBS) {
    const bw = iw * 0.4;
    const bh = ih * 0.38;
    for (const [ox, oy] of [[0, 0], [iw - bw, 0], [0, ih - bh], [iw - bw, ih - bh]]) {
      if (rng.chance(0.85)) add(ix + ox, iy + oy, bw, bh, rng.pick(HOUSE_COLORS), rng.pick(ROOF_COLORS), 1);
    }
    for (let t = 0; t < 3; t += 1) {
      city.trees.push({ x: ix + rng.range(6, iw - 6), y: iy + rng.range(6, ih - 6), kind: 'round', r: rng.range(13, 19) });
    }
  } else if (district === DISTRICT.INDUSTRIAL || district === DISTRICT.DOCKS) {
    const bw = iw * rng.range(0.66, 0.84);
    const bh = ih * rng.range(0.5, 0.66);
    add(ix + (iw - bw) / 2, iy + (ih - bh) / 2, bw, bh, '#9aa3a8', '#5c6468', 1);
    for (let c = 0; c < 3; c += 1) {
      const cw = 44;
      const ch = 20;
      const cx = ix + rng.range(0, iw - cw);
      const cy = iy + rng.range(0, ih - ch);
      city.buildings.push({ x: cx, y: cy, w: cw, h: ch, color: rng.pick(['#c65a3a', '#3a7ac6', '#4fae62', '#c6a23a']), roof: null, floors: 0, district, container: true });
    }
  } else if (district === DISTRICT.BEACHFRONT) {
    const bw = iw * 0.52;
    const bh = ih * 0.4;
    add(ix + 4, iy + (ih - bh) / 2, bw, bh, rng.pick(['#f2e3c2', '#e8f0ee', '#f6d9c8']), '#c96f4a', 2);
    city.trees.push({ x: ix + iw - 24, y: iy + 20, kind: 'palm', r: 16 });
    city.trees.push({ x: ix + iw - 24, y: iy + ih - 20, kind: 'palm', r: 16 });
  } else {
    const bw = iw * 0.46;
    const bh = ih * 0.46;
    add(ix, iy, bw, bh, rng.pick(TOWER_COLORS), rng.pick(ROOF_COLORS), rng.int(2, 5));
    if (rng.chance(0.7)) add(ix + iw - bw, iy + ih - bh, bw, bh, rng.pick(TOWER_COLORS), rng.pick(ROOF_COLORS), rng.int(2, 5));
  }
}

/** Build the whole city from the seeded stream. */
export function createCity(rng) {
  const { v, h } = roadLines();
  const city = {
    roadsV: v,
    roadsH: h,
    width: WORLD.width,
    height: WORLD.height,
    buildings: [],
    trees: [],
    blocks: [],
    lights: [],
    locations: {},
  };
  const colSegs = segments(v, BEACH.promX);
  const rowSegs = segments(h, WORLD.height);
  for (let c = 0; c < colSegs.length; c += 1) {
    for (let r = 0; r < rowSegs.length; r += 1) {
      const block = {
        x: colSegs[c][0],
        y: rowSegs[r][0],
        w: colSegs[c][1] - colSegs[c][0],
        h: rowSegs[r][1] - rowSegs[r][0],
        district: districtOf(c, r, colSegs.length, rowSegs.length),
      };
      city.blocks.push(block);
      fillBlock(city, rng, block);
    }
  }
  // The park pond and its trees (the park block itself stays clear of buildings).
  const park = city.blocks.find((b) => b.district === DISTRICT.PARK);
  city.park = { x: park.x, y: park.y, w: park.w, h: park.h, pond: { x: park.x + park.w * 0.30, y: park.y + park.h * 0.32, rx: 62, ry: 40 } };
  for (let t = 0; t < 9; t += 1) {
    city.trees.push({ x: park.x + rng.range(24, park.w - 24), y: park.y + rng.range(24, park.h - 24), kind: 'round', r: rng.range(15, 22) });
  }
  // Palms along the promenade and the beach avenues, lamps along every road.
  for (let y = 140; y < WORLD.height - 80; y += 150) {
    city.trees.push({ x: BEACH.promX + 26, y: y + rng.range(-14, 14), kind: 'palm', r: 17 });
    city.trees.push({ x: BEACH.sandX - 24, y: y + 70, kind: 'palm', r: 15 });
  }
  for (const x of v) {
    for (let y = 190; y < WORLD.height - 60; y += 260) {
      if (h.some((hy) => Math.abs(hy - y) < 90)) continue;
      city.trees.push({ x: x - GRID.roadW / 2 - 13, y, kind: 'lamp', r: 5 });
      city.trees.push({ x: x + GRID.roadW / 2 + 13, y: y + 130, kind: 'lamp', r: 5 });
    }
  }
  for (const x of v) for (const y of h) city.lights.push({ x, y });
  city.locations = {
    cafe: { x: 1096, y: 1562, label: "Marisol's Café Azul", short: 'Café Azul' },
    gunshop: { x: 402, y: 902, label: 'Coral Arms — guns & armor', short: 'Coral Arms' },
    respray: { x: 2470, y: 2566, label: 'Shine & Go Respray', short: 'Respray' },
    hospital: { x: 700, y: 208, label: 'Coral Bay General Hospital', short: 'Hospital' },
    station: { x: 1706, y: 1096, label: 'CBPD Central Station', short: 'Police' },
    docksGate: { x: 2620, y: 2620, label: 'Port of Coral Bay — Gate 3', short: 'Docks' },
    warehouse: { x: 2752, y: 2830, label: 'Warehouse 9', short: 'Warehouse 9' },
    lockup: { x: 2330, y: 2900, label: "Dario's lockup", short: 'Lockup' },
    hideout: { x: 2560, y: 2990, label: 'Old cannery — lay low here', short: 'Cannery' },
    pier: { x: 2870, y: 3060, label: 'South Pier', short: 'South Pier' },
    boardwalk: { x: 3346, y: 1200, label: 'Coral Boardwalk', short: 'Boardwalk' },
  };
  return city;
}

/** The lane centre for a car travelling on a road: axis 'v' along a vertical road, dir -1 north / +1 south. */
export function laneCoord(city, axis, roadIndex, dir) {
  if (axis === 'v') return city.roadsV[roadIndex] + (dir < 0 ? GRID.lane : -GRID.lane);
  return city.roadsH[roadIndex] + (dir > 0 ? GRID.lane : -GRID.lane);
}

/** True when the point is on asphalt (a road or the respray forecourt). */
export function isOnRoad(city, x, y) {
  for (const rx of city.roadsV) if (Math.abs(x - rx) <= GRID.roadW / 2) return true;
  for (const ry of city.roadsH) if (Math.abs(y - ry) <= GRID.roadW / 2) return true;
  return false;
}

/** What surface a point stands on: road, boardwalk, sand, water or land. */
export function surfaceAt(city, x, y) {
  if (x >= BEACH.waterX) return 'water';
  if (x >= BEACH.sandX) return 'sand';
  if (x >= BEACH.promX) return 'boardwalk';
  if (isOnRoad(city, x, y)) return 'road';
  return 'land';
}

/**
 * Traffic light phase at an intersection, from the world clock in seconds:
 * a 14 s cycle, north-south green, amber, east-west green, amber, staggered
 * by intersection so the whole city does not change at once.
 */
export function lightPhase(city, ix, iy, time) {
  const stagger = ((ix * 7 + iy * 13) % 5) * 1.7;
  const t = (time + stagger) % 14;
  if (t < 5.6) return 'ns';
  if (t < 6.6) return 'ns-amber';
  if (t < 12.2) return 'ew';
  return 'ew-amber';
}

/** May a car travelling on `axis` ('v' = north-south, 'h' = east-west) go through this light now? */
export function lightAllows(city, ix, iy, axis, time) {
  const phase = lightPhase(city, ix, iy, time);
  if (axis === 'v') return phase === 'ns';
  return phase === 'ew';
}

/**
 * Push a circle (centre x, y, radius r) out of every building and keep it in
 * the world and out of the water. Returns the corrected [x, y]. Buildings are
 * few enough that a plain scan is fine.
 */
export function collideCircle(city, x, y, r) {
  x = clamp(x, r, BEACH.waterX - r);
  y = clamp(y, r, city.height - r);
  for (const b of city.buildings) {
    const nx = clamp(x, b.x, b.x + b.w);
    const ny = clamp(y, b.y, b.y + b.h);
    const dx = x - nx;
    const dy = y - ny;
    const d2 = dx * dx + dy * dy;
    if (d2 >= r * r) continue;
    if (d2 > 0.0001) {
      const d = Math.sqrt(d2);
      x = nx + (dx / d) * r;
      y = ny + (dy / d) * r;
    } else {
      // Centre inside the box: leave by the shortest side.
      const left = x - b.x;
      const right = b.x + b.w - x;
      const top = y - b.y;
      const bottom = b.y + b.h - y;
      const min = Math.min(left, right, top, bottom);
      if (min === left) x = b.x - r;
      else if (min === right) x = b.x + b.w + r;
      else if (min === top) y = b.y - r;
      else y = b.y + b.h + r;
    }
  }
  return [x, y];
}

/** Is the circle at (x, y, r) overlapping any building? Used by spawn checks. */
export function circleHitsBuilding(city, x, y, r) {
  for (const b of city.buildings) {
    const nx = clamp(x, b.x, b.x + b.w);
    const ny = clamp(y, b.y, b.y + b.h);
    const dx = x - nx;
    const dy = y - ny;
    if (dx * dx + dy * dy < r * r) return true;
  }
  return false;
}

/** A random point on a random road, for spawning traffic and parked cars. */
export function randomRoadPoint(rng, city) {
  if (rng.chance(0.5)) {
    const ri = rng.int(0, city.roadsV.length - 1);
    const dir = rng.chance(0.5) ? -1 : 1;
    return { x: laneCoord(city, 'v', ri, dir), y: rng.range(80, city.height - 80), axis: 'v', road: ri, dir };
  }
  const ri = rng.int(0, city.roadsH.length - 1);
  const dir = rng.chance(0.5) ? -1 : 1;
  return { x: rng.range(80, BEACH.promX - 40), y: laneCoord(city, 'h', ri, dir), axis: 'h', road: ri, dir };
}
