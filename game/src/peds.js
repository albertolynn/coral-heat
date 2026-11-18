// Pedestrians: they stroll the block sidewalks, cross at the corners, run
// from gunfire and crashes, drop cash when they go down, and — in one
// warehouse in the docks — shoot back. Drivers and passengers are not
// simulated here; they ride with their car.
import { collideCircle } from './city.js';
import { clamp, distance } from './rng.js';
import { addParticles, addTracer, spawnPickup } from './world.js';
import { reportCrime } from './wanted.js';
import { hurtPlayer } from './vehicles.js';

const WALK_SPEED = 62;
const FLEE_SPEED = 196;

/** The four sidewalk corners of a block, inset from its edges. */
function cornersOf(block) {
  const i = 9;
  return [
    { x: block.x + i, y: block.y + i },
    { x: block.x + block.w - i, y: block.y + i },
    { x: block.x + block.w - i, y: block.y + block.h - i },
    { x: block.x + i, y: block.y + block.h - i },
  ];
}

/** The block whose rim this pedestrian walks; the nearest one wins. */
function adoptBlock(world, ped) {
  let best = null;
  let bestD = Infinity;
  for (const b of world.city.blocks) {
    const cx = clamp(ped.x, b.x, b.x + b.w);
    const cy = clamp(ped.y, b.y, b.y + b.h);
    const d = distance(ped.x, ped.y, cx, cy);
    if (d < bestD) {
      bestD = d;
      best = b;
    }
  }
  ped.block = best;
  const corners = cornersOf(best);
  let ci = 0;
  let cd = Infinity;
  corners.forEach((c, i) => {
    const d = distance(ped.x, ped.y, c.x, c.y);
    if (d < cd) {
      cd = d;
      ci = i;
    }
  });
  ped.corner = ci;
  ped.wp = corners[ci];
}

/** The block directly across the road in a compass direction, if there is one. */
function blockAcross(world, block, dx, dy) {
  let best = null;
  let bestD = Infinity;
  for (const b of world.city.blocks) {
    if (b === block) continue;
    const cx = b.x + b.w / 2 - (block.x + block.w / 2);
    const cy = b.y + b.h / 2 - (block.y + block.h / 2);
    if (dx !== 0 && Math.sign(cx) !== dx) continue;
    if (dy !== 0 && Math.sign(cy) !== dy) continue;
    if (dx !== 0 && Math.abs(cy) > 40) continue;
    if (dy !== 0 && Math.abs(cx) > 40) continue;
    const d = Math.abs(cx) + Math.abs(cy);
    if (d < bestD) {
      bestD = d;
      best = b;
    }
  }
  return best;
}

/** Damage a pedestrian; death drops cash and, if the player did it, heat. */
export function damagePed(world, ped, amount, byPlayer, lethalKind) {
  if (ped.state === 'down') return;
  ped.hp -= amount;
  addParticles(world, ped.x, ped.y, 4, {
    speedMin: 20, speedMax: 90, lifeMin: 0.2, lifeMax: 0.45, sizeMin: 1.6, sizeMax: 3, colors: ['#c94f4f', '#a83a3a'],
  });
  if (ped.hp <= 0) {
    ped.state = 'down';
    ped.downT = 0;
    if (world.rng.chance(0.55)) spawnPickup(world, ped.x + world.rng.range(-8, 8), ped.y + world.rng.range(-8, 8), 'cash', world.rng.int(5, 42));
    if (byPlayer) reportCrime(world, lethalKind ?? 'pedKill', ped.x, ped.y);
  } else {
    ped.state = 'flee';
    ped.fleeFrom = { x: world.player.x, y: world.player.y };
    ped.fleeT = world.rng.range(1.6, 3);
    if (byPlayer) reportCrime(world, 'assault', ped.x, ped.y);
  }
}

/** A car strikes a pedestrian: knockback, damage, panic in the crowd. */
export function hitPed(world, ped, amount, byPlayer, car) {
  ped.x += Math.cos(car.angle) * 16;
  ped.y += Math.sin(car.angle) * 16;
  damagePed(world, ped, amount, byPlayer, 'pedKill');
  if (ped.state !== 'down') {
    ped.state = 'flee';
    ped.fleeFrom = { x: car.x, y: car.y };
    ped.fleeT = 3;
  }
  panicNearby(world, car.x, car.y, 190);
  if (byPlayer) world.audio.sounds.crash(false);
}

/** Everyone within radius of (x, y) runs from it. */
export function panicNearby(world, x, y, radius) {
  for (const ped of world.peds) {
    if (ped.state !== 'walk') continue;
    if (distance(ped.x, ped.y, x, y) < radius) {
      ped.state = 'flee';
      ped.fleeFrom = { x, y };
      ped.fleeT = world.rng.range(1.4, 2.8);
    }
  }
  for (const car of world.cars) {
    if (car.mode === 'traffic' && distance(car.x, car.y, x, y) < radius + 60) car.fleeT = Math.max(car.fleeT, 1.6);
  }
}

/** Move a pedestrian toward a point at a speed; returns true on arrival. */
function walkToward(world, ped, tx, ty, speed, dt) {
  const dx = tx - ped.x;
  const dy = ty - ped.y;
  const d = Math.sqrt(dx * dx + dy * dy);
  if (d < 7) return true;
  ped.angle = Math.atan2(dy, dx);
  ped.speed = speed;
  const nx = ped.x + (dx / d) * speed * dt;
  const ny = ped.y + (dy / d) * speed * dt;
  const [cx, cy] = collideCircle(world.city, nx, ny, 11);
  ped.x = cx;
  ped.y = cy;
  ped.walkCycle = (ped.walkCycle ?? 0) + dt * speed * 0.09;
  return false;
}

function updateWalker(world, ped, dt) {
  if (!ped.block) adoptBlock(world, ped);
  if (ped.waitT > 0) {
    ped.waitT -= dt;
    ped.speed = 0;
    return;
  }
  if (!ped.wp) {
    const corners = cornersOf(ped.block);
    ped.wp = corners[ped.corner];
  }
  if (walkToward(world, ped, ped.wp.x, ped.wp.y, WALK_SPEED * (ped.gait ?? 1), dt)) {
    // At a corner: mostly walk on around the block, sometimes cross the road.
    if (world.rng.chance(0.2)) {
      const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
      const [dx, dy] = dirs[world.rng.int(0, 3)];
      const across = blockAcross(world, ped.block, dx, dy);
      if (across) {
        ped.block = across;
        const corners = cornersOf(across);
        let ci = 0;
        let cd = Infinity;
        corners.forEach((c, i) => {
          const d = distance(ped.x, ped.y, c.x, c.y);
          if (d < cd) {
            cd = d;
            ci = i;
          }
        });
        ped.corner = ci;
        ped.wp = corners[ci];
        return;
      }
    }
    ped.corner = (ped.corner + 1) % 4;
    ped.wp = cornersOf(ped.block)[ped.corner];
    if (world.rng.chance(0.14)) ped.waitT = world.rng.range(0.6, 2.2);
  }
}

function updateHostile(world, ped, dt) {
  const p = world.player;
  const d = distance(ped.x, ped.y, p.x, p.y);
  if (ped.post && d > 520) {
    walkToward(world, ped, ped.post.x, ped.post.y, WALK_SPEED, dt);
    return;
  }
  if (d > 250) {
    walkToward(world, ped, p.x, p.y, FLEE_SPEED * 0.72, dt);
  } else if (d < 130) {
    walkToward(world, ped, ped.x + (ped.x - p.x), ped.y + (ped.y - p.y), WALK_SPEED, dt);
  } else {
    ped.angle = Math.atan2(p.y - ped.y, p.x - ped.x);
    ped.speed = 0;
  }
  ped.fireCd -= dt;
  if (d < 330 && ped.fireCd <= 0 && !world.over) {
    ped.fireCd = world.rng.range(0.7, 1.3);
    world.audio.sounds.gunshot();
    const a = Math.atan2(p.y - ped.y, p.x - ped.x) + world.rng.range(-0.07, 0.07);
    const hx = ped.x + Math.cos(a) * d;
    const hy = ped.y + Math.sin(a) * d;
    addTracer(world, ped.x, ped.y, hx, hy, '#ffb37a');
    if (world.rng.chance(0.3)) {
      if (p.car) hurtPlayer(world, 2.5);
      else hurtPlayer(world, 7);
    }
  }
}

/** Advance every pedestrian by one step. */
export function updatePeds(world, dt) {
  const p = world.player;
  for (const ped of world.peds) {
    if (ped.gait === undefined) ped.gait = world.rng.range(0.8, 1.25);
    switch (ped.state) {
      case 'driver':
      case 'passenger': {
        if (ped.car && world.cars.includes(ped.car)) {
          ped.x = ped.car.x;
          ped.y = ped.car.y;
          ped.angle = ped.car.angle;
        } else {
          ped.car = null;
          ped.state = 'walk';
          ped.block = null;
        }
        break;
      }
      case 'down': {
        ped.downT += dt;
        ped.speed = 0;
        break;
      }
      case 'flee': {
        ped.fleeT -= dt;
        const from = ped.fleeFrom ?? p;
        const away = Math.atan2(ped.y - from.y, ped.x - from.x);
        walkToward(world, ped, ped.x + Math.cos(away) * 120, ped.y + Math.sin(away) * 120, FLEE_SPEED, dt);
        if (ped.fleeT <= 0) {
          ped.state = 'walk';
          ped.block = null;
        }
        break;
      }
      case 'hostile': {
        updateHostile(world, ped, dt);
        break;
      }
      case 'fare-wait': {
        ped.speed = 0;
        ped.angle += Math.sin(world.time * 1.4 + ped.id) * dt * 0.4;
        break;
      }
      default: {
        updateWalker(world, ped, dt);
      }
    }
  }
  world.peds = world.peds.filter((ped) => !(ped.state === 'down' && ped.downT > 24) && ped.state !== 'gone');
}
