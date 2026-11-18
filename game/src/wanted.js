// The wanted system: crimes add heat when someone sees them — a pedestrian
// nearby, a driver, or the police themselves. Heat crosses thresholds to
// become stars; stars decide how many police cars hunt and whether they
// shoot and set roadblocks. Stay unseen and the heat cools off.
import { WANTED } from './config.js';
import { randomRoadPoint } from './city.js';
import { distance } from './rng.js';
import { makeCar, addMessage } from './world.js';

/** How many stars a heat value is worth. */
export function starsForHeat(heat) {
  let stars = 0;
  for (const threshold of WANTED.thresholds) if (heat >= threshold) stars += 1;
  return stars;
}

/** Was anyone close enough to see the crime at (x, y)? Police always count. */
function witnessed(world, x, y) {
  for (const ped of world.peds) {
    if (ped.state === 'down') continue;
    if (distance(ped.x, ped.y, x, y) < 250) return true;
  }
  for (const car of world.cars) {
    if (car.mode === 'police') {
      if (distance(car.x, car.y, x, y) < WANTED.seenRange + 120) return true;
    } else if (car.driver && distance(car.x, car.y, x, y) < 230) {
      return true;
    }
  }
  return false;
}

/**
 * Report a crime by kind (a key of WANTED.crime). Unwitnessed crimes in a
 * quiet street add nothing — unless the police are already watching.
 */
export function reportCrime(world, kind, x, y) {
  const amount = WANTED.crime[kind];
  if (amount === undefined) return;
  const w = world.wanted;
  if (world.over) return;
  if (!witnessed(world, x, y) && w.stars === 0) return;
  const before = w.stars;
  w.heat += amount;
  w.stars = starsForHeat(w.heat);
  w.unseen = 0;
  if (w.stars > before) {
    addMessage(world, w.stars >= 4 ? `WANTED LEVEL ${w.stars} — they're bringing everything.` : `Wanted level ${w.stars}`, '#ff8a7a');
    world.audio.sounds.phone();
  }
}

/** Clear all heat at once (respray, hospital, busted, a mission script). */
export function clearWanted(world) {
  world.wanted.heat = 0;
  world.wanted.stars = 0;
  world.wanted.unseen = 0;
  for (const car of world.cars) {
    if (car.mode === 'police') car.mode = 'traffic';
    if (car.mode === 'block') car.mode = 'parked';
  }
}

/** Spawn a police interceptor on a road, out of sight but closing in. */
function spawnPolice(world) {
  const { rng, city, player } = world;
  for (let tries = 0; tries < 10; tries += 1) {
    const spot = randomRoadPoint(rng, city);
    const d = distance(spot.x, spot.y, player.x, player.y);
    if (d < 620 || d > 1150) continue;
    const car = makeCar(world, spot.x, spot.y, spot.axis === 'v' ? (spot.dir < 0 ? -Math.PI / 2 : Math.PI / 2) : (spot.dir > 0 ? 0 : Math.PI), 'police', 'police');
    car.axis = spot.axis;
    car.road = spot.road;
    car.dir = spot.dir;
    car.speed = 150;
    return car;
  }
  return null;
}

/** At 3+ stars, park two interceptors across the road ahead of the player. */
function setRoadblock(world) {
  const p = world.player;
  if (!p.car) return;
  const city = world.city;
  const heading = p.car.angle;
  const ax = p.x + Math.cos(heading) * 560;
  const ay = p.y + Math.sin(heading) * 560;
  // Find the road the player is heading toward and block it across both lanes.
  let bestRoad = -1;
  let bestD = Infinity;
  for (let i = 0; i < city.roadsV.length; i += 1) {
    const d = Math.abs(city.roadsV[i] - ax);
    if (d < bestD) {
      bestD = d;
      bestRoad = i;
    }
  }
  let bestRoadH = -1;
  let bestDH = Infinity;
  for (let j = 0; j < city.roadsH.length; j += 1) {
    const d = Math.abs(city.roadsH[j] - ay);
    if (d < bestDH) {
      bestDH = d;
      bestRoadH = j;
    }
  }
  if (bestD < bestDH && bestRoad >= 0) {
    const rx = city.roadsV[bestRoad];
    for (const off of [-26, 26]) {
      const car = makeCar(world, rx + off * 0.4, ay + off, Math.PI / 2, 'police', 'block');
      car.angle = Math.PI / 2 + (off > 0 ? 0.25 : -0.25);
    }
  } else if (bestRoadH >= 0) {
    const ry = city.roadsH[bestRoadH];
    for (const off of [-26, 26]) {
      const car = makeCar(world, ax + off, ry + off * 0.4, 0, 'police', 'block');
      car.angle = off > 0 ? 0.25 : -0.25;
    }
  }
  addMessage(world, 'Roadblock ahead!', '#ff8a7a');
}

/** One step: track who sees the player, cool the heat, feed the hunt. */
export function updateWanted(world, dt) {
  const w = world.wanted;
  const p = world.player;
  if (w.stars <= 0) {
    w.heat = Math.max(0, w.heat - dt * 0.3);
    return;
  }
  let seen = false;
  for (const car of world.cars) {
    if (car.mode !== 'police' || car.dead) continue;
    if (distance(car.x, car.y, p.x, p.y) < WANTED.seenRange) {
      seen = true;
      break;
    }
  }
  if (seen) {
    w.unseen = 0;
  } else {
    w.unseen += dt;
    if (w.unseen > WANTED.decayDelay) {
      w.heat -= WANTED.decayPerSecond * dt * (w.unseen > WANTED.decayDelay + 6 ? 2 : 1);
      if (w.heat < 0) w.heat = 0;
      const stars = starsForHeat(w.heat);
      if (stars < w.stars) {
        w.stars = stars;
        if (stars === 0) {
          addMessage(world, 'You lost the heat. Lay low a while.', '#3fb68b');
          // The hunt is over: hunters peel off and become traffic.
          for (const car of world.cars) if (car.mode === 'police') car.mode = 'traffic';
        } else {
          addMessage(world, `Wanted level down to ${stars}`, '#ffd166');
        }
      }
    }
  }
  // Keep the hunting pack at the size the stars demand.
  const want = w.stars + 1;
  const hunting = world.cars.filter((c) => c.mode === 'police' && !c.dead);
  if (hunting.length < want && world.rng.chance(dt * 1.6)) spawnPolice(world);
  for (const car of world.cars) {
    if (car.mode === 'police' && distance(car.x, car.y, p.x, p.y) > 1750) car.mode = 'traffic';
  }
  // Roadblocks once the chase is hot and the player is driving.
  w.roadblockCd -= dt;
  if (w.stars >= 3 && p.car && w.roadblockCd <= 0) {
    w.roadblockCd = 26;
    setRoadblock(world);
  }
}
