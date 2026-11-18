// The world state and its heartbeat: the city, the player, every car, walker,
// pickup and particle, the clock and the camera. createWorld builds a fresh
// Coral Bay from a seed; updateWorld advances one fixed step by handing the
// state to the vehicle, pedestrian, player and wanted updates in turn.
// Nothing here draws; rendering reads the same state.
import { CAR, CAR_COLORS, CAR_TYPES, CLOCK, ECONOMY, PLAYER } from './config.js';
import { createCity, laneCoord, randomRoadPoint } from './city.js';
import { createRandom, clamp, distance } from './rng.js';
import { createAudio } from './audio.js';
import { updateVehicles } from './vehicles.js';
import { updatePeds } from './peds.js';
import { updatePlayer } from './player.js';
import { updateWanted } from './wanted.js';

let nextId = 1;

/** Build a fresh world: city, player at the café, parked cars, first traffic and walkers. */
export function createWorld(seed) {
  const rng = createRandom(seed);
  const city = createCity(rng);
  const cafe = city.locations.cafe;
  const world = {
    rng,
    city,
    audio: createAudio(),
    time: 0,
    clockMinutes: CLOCK.startMinutes,
    camera: { x: cafe.x, y: cafe.y, shake: 0 },
    player: {
      x: cafe.x,
      y: cafe.y + 26,
      angle: -Math.PI / 2,
      hp: PLAYER.health,
      armor: 0,
      cash: ECONOMY.startCash,
      car: null,
      hasPistol: false,
      weapon: 'fists',
      ammoInMag: 0,
      reserve: 0,
      reloadT: 0,
      fireCd: 0,
      punchCd: 0,
      hurtT: 0,
      bustedT: 0,
      walkCycle: 0,
      moving: false,
    },
    cars: [],
    peds: [],
    pickups: [],
    particles: [],
    tracers: [],
    skids: [],
    wanted: { heat: 0, stars: 0, unseen: 0, roadblockCd: 0 },
    messages: [],
    mission: null,
    dialogue: null,
    shop: null,
    taxi: null,
    storyDone: false,
    stats: { earned: 0, fares: 0, carsStolen: 0 },
    over: null, // set when the player dies or is busted: { kind, timer }
  };
  for (let i = 0; i < 46; i += 1) spawnParkedCar(world);
  for (let i = 0; i < 11; i += 1) spawnTrafficCar(world, true);
  for (let i = 0; i < 24; i += 1) spawnPed(world);
  return world;
}

/** Push a transient line into the message feed (newest last, at most five kept). */
export function addMessage(world, text, color = '#f4f1e6') {
  world.messages.push({ text, color, t: world.time });
  if (world.messages.length > 5) world.messages.shift();
}

/** A car object with the shared shape every system reads. */
export function makeCar(world, x, y, angle, typeKey, mode) {
  const spec = CAR_TYPES[typeKey];
  const car = {
    id: nextId++,
    type: typeKey,
    name: spec.name,
    color: typeKey === 'police' ? '#e8ecf0' : typeKey === 'taxi' ? '#f2b63c' : world.rng.pick(CAR_COLORS),
    x,
    y,
    angle,
    speed: 0,
    health: spec.health,
    maxHealth: spec.health,
    mode,
    driver: null,
    axis: 'v',
    road: 0,
    dir: 1,
    lastCross: '',
    honkCd: 0,
    stuckT: 0,
    fleeT: 0,
    smokeT: 0,
    mission: false,
    dead: false,
  };
  world.cars.push(car);
  return car;
}

/** Park a car along a random road edge, clear of junctions and other cars. */
export function spawnParkedCar(world) {
  const { rng, city } = world;
  for (let tries = 0; tries < 12; tries += 1) {
    const vertical = rng.chance(0.55);
    const lines = vertical ? city.roadsV : city.roadsH;
    const cross = vertical ? city.roadsH : city.roadsV;
    const line = rng.pick(lines);
    const along = rng.range(120, (vertical ? city.height : 3300) - 120);
    if (cross.some((c) => Math.abs(c - along) < 105)) continue;
    const side = rng.chance(0.5) ? -1 : 1;
    const off = side * (62 - 15);
    const x = vertical ? line + off : along;
    const y = vertical ? along : line + off;
    if (world.cars.some((c) => distance(c.x, c.y, x, y) < 66)) continue;
    const angle = vertical ? (side < 0 ? -Math.PI / 2 : Math.PI / 2) : (side < 0 ? Math.PI : 0);
    const type = rng.pick(['sedan', 'sedan', 'compact', 'compact', 'van', 'muscle', 'taxi', 'sport']);
    const car = makeCar(world, x, y, angle, type, 'parked');
    if (rng.chance(0.45)) {
      car.driver = spawnPed(world, x + 20, y + 10, { nearCar: car });
      car.driver.state = 'driver';
      car.driver.car = car;
    }
    return car;
  }
  return null;
}

/** Bring a traffic car onto a road, ideally out of the player's sight. */
export function spawnTrafficCar(world, anywhere = false) {
  const { rng, city, player } = world;
  for (let tries = 0; tries < 10; tries += 1) {
    const spot = randomRoadPoint(rng, city);
    const d = distance(spot.x, spot.y, player.x, player.y);
    if (!anywhere && (d < 560 || d > 1250)) continue;
    if (world.cars.some((c) => distance(c.x, c.y, spot.x, spot.y) < 80)) continue;
    const type = rng.pick(['sedan', 'sedan', 'compact', 'van', 'muscle', 'taxi']);
    const car = makeCar(world, spot.x, spot.y, spot.axis === 'v' ? (spot.dir < 0 ? -Math.PI / 2 : Math.PI / 2) : (spot.dir > 0 ? 0 : Math.PI), type, 'traffic');
    car.axis = spot.axis;
    car.road = spot.road;
    car.dir = spot.dir;
    car.speed = rng.range(90, 130);
    const driver = spawnPed(world, spot.x, spot.y, {});
    driver.state = 'driver';
    driver.car = car;
    car.driver = driver;
    return car;
  }
  return null;
}

/** A pedestrian at a point (or a fresh sidewalk point near the player when x is null). */
export function spawnPed(world, x = null, y = null, opts = {}) {
  const { rng, city } = world;
  if (x === null) {
    const block = rng.pick(city.blocks.filter((b) => b.district !== 'park'));
    x = block.x + rng.range(10, block.w - 10);
    y = block.y + 10;
  }
  const ped = {
    id: nextId++,
    x,
    y,
    angle: rng.range(0, Math.PI * 2),
    speed: 0,
    hp: 30,
    state: opts.state ?? 'walk',
    shirt: rng.pick(['#d95f43', '#4378d9', '#e8c33c', '#53b06a', '#e6e3da', '#c94f7c', '#39b8c4', '#8a6fd0']),
    pants: rng.pick(['#33404f', '#5a4a3a', '#2e2e38', '#6a7076', '#40343a']),
    wp: null,
    corner: rng.int(0, 3),
    block: null,
    waitT: 0,
    fleeFrom: null,
    fleeT: 0,
    fireCd: rng.range(0.4, 1.2),
    car: opts.nearCar ?? null,
    fare: null,
    downT: 0,
  };
  world.peds.push(ped);
  return ped;
}

/** A cash or story pickup lying in the street. */
export function spawnPickup(world, x, y, kind, amount = 0, label = '') {
  world.pickups.push({ x, y, kind, amount, label, born: world.time });
}

/** A burst of particles: sparks, dust, smoke, muzzle smoke, cash sparkle. */
export function addParticles(world, x, y, count, opts) {
  for (let i = 0; i < count; i += 1) {
    if (world.particles.length > 420) world.particles.shift();
    const a = world.rng.range(0, Math.PI * 2);
    const sp = world.rng.range(opts.speedMin, opts.speedMax);
    world.particles.push({
      x,
      y,
      vx: Math.cos(a) * sp,
      vy: Math.sin(a) * sp,
      life: 0,
      maxLife: world.rng.range(opts.lifeMin, opts.lifeMax),
      size: world.rng.range(opts.sizeMin, opts.sizeMax),
      color: world.rng.pick(opts.colors),
      gravity: opts.gravity ?? 0,
      drag: opts.drag ?? 2.2,
      rise: opts.rise ?? 0,
    });
  }
}

/** A gun tracer line that fades in a tenth of a second. */
export function addTracer(world, x1, y1, x2, y2, color = '#ffd98a') {
  world.tracers.push({ x1, y1, x2, y2, life: 0, maxLife: 0.09, color });
}

/** Keep traffic and walkers flowing around the player; remove the far ones. */
function maintainPopulation(world, dt) {
  const p = world.player;
  world.cars = world.cars.filter((car) => {
    if (car.mode === 'parked' || car.mode === 'player' || car.mission || car.mode === 'block') return true;
    if (car.mode === 'police') return true;
    return distance(car.x, car.y, p.x, p.y) < 1500;
  });
  const traffic = world.cars.filter((c) => c.mode === 'traffic').length;
  if (traffic < 12 && world.rng.chance(dt * 1.4)) spawnTrafficCar(world);
  world.peds = world.peds.filter((ped) => ped.state === 'driver' || ped.state === 'passenger' || distance(ped.x, ped.y, p.x, p.y) < 1250 || ped.state === 'hostile' || ped.fare);
  const walkers = world.peds.filter((ped) => ped.state === 'walk' || ped.state === 'flee').length;
  if (walkers < 24 && world.rng.chance(dt * 2)) {
    const a = world.rng.range(0, Math.PI * 2);
    const d = world.rng.range(620, 900);
    const block = nearestBlock(world, p.x + Math.cos(a) * d, p.y + Math.sin(a) * d);
    if (block) spawnPed(world, block.x + world.rng.range(10, block.w - 10), block.y + 10);
  }
}

function nearestBlock(world, x, y) {
  let best = null;
  let bestD = Infinity;
  for (const b of world.city.blocks) {
    const d = distance(x, y, b.x + b.w / 2, b.y + b.h / 2);
    if (d < bestD) {
      bestD = d;
      best = b;
    }
  }
  return best;
}

/** Advance pickups, particles, tracers, skids and the message feed. */
function updateAmbient(world, dt) {
  const p = world.player;
  world.pickups = world.pickups.filter((pickup) => {
    const collectR = p.car ? 44 : 27;
    if (distance(pickup.x, pickup.y, p.x, p.y) < collectR && pickup.kind === 'cash') {
      p.cash += pickup.amount;
      world.stats.earned += pickup.amount;
      world.audio.sounds.cash();
      addParticles(world, pickup.x, pickup.y, 7, { speedMin: 20, speedMax: 80, lifeMin: 0.3, lifeMax: 0.6, sizeMin: 2, sizeMax: 3.4, colors: ['#ffe066', '#fff3b0'] });
      addMessage(world, `+$${pickup.amount}`, '#ffe066');
      return false;
    }
    return true;
  });
  for (const pt of world.particles) {
    pt.life += dt;
    pt.x += pt.vx * dt;
    pt.y += pt.vy * dt - pt.rise * dt;
    pt.vy += pt.gravity * dt;
    const dragK = Math.max(0, 1 - pt.drag * dt);
    pt.vx *= dragK;
    pt.vy *= dragK;
  }
  world.particles = world.particles.filter((pt) => pt.life < pt.maxLife);
  for (const t of world.tracers) t.life += dt;
  world.tracers = world.tracers.filter((t) => t.life < t.maxLife);
  for (const s of world.skids) s.life += dt;
  world.skids = world.skids.filter((s) => s.life < 7);
  world.messages = world.messages.filter((m) => world.time - m.t < 4.5);
}

/** Move the camera toward the player, leading a driven car, with impact shake. */
function updateCamera(world, dt) {
  const p = world.player;
  let tx = p.x;
  let ty = p.y;
  if (p.car) {
    tx += Math.cos(p.car.angle) * clamp(p.car.speed * 0.42, -130, 130);
    ty += Math.sin(p.car.angle) * clamp(p.car.speed * 0.42, -130, 130);
  }
  const k = Math.min(1, dt * 5.5);
  world.camera.x += (tx - world.camera.x) * k;
  world.camera.y += (ty - world.camera.y) * k;
  world.camera.shake = Math.max(0, world.camera.shake - dt * 26);
}

/** One fixed step of the whole simulation. */
export function updateWorld(world, input, dt) {
  world.time += dt;
  world.clockMinutes = (world.clockMinutes + dt * CLOCK.minutesPerSecond) % 1440;
  maintainPopulation(world, dt);
  updateVehicles(world, dt);
  updatePeds(world, dt);
  updatePlayer(world, input, dt);
  updateWanted(world, dt);
  updateAmbient(world, dt);
  updateCamera(world, dt);
  // Engine and siren loops follow the action.
  const p = world.player;
  if (p.car) world.audio.engine(true, Math.abs(p.car.speed) / CAR_TYPES[p.car.type].topSpeed, p.car.health < 30);
  else world.audio.engine(false, 0, false);
  const copNear = world.cars.some((c) => c.mode === 'police' && distance(c.x, c.y, p.x, p.y) < 620);
  world.audio.siren(copNear && world.wanted.stars > 0, 1);
}

/** Lane centre x for a vertical road index and direction (used by spawns and roadblocks). */
export function laneX(world, roadIndex, dir) {
  return laneCoord(world.city, 'v', roadIndex, dir);
}
