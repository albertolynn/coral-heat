// Cars: the shared arcade physics every driver uses, the traffic AI that
// follows lanes and obeys lights, and the police AI that hunts the player.
// The player drives through the same stepCarPhysics as the AI, so a stolen
// car feels the same whoever is at the wheel.
import { CAR, CAR_TYPES } from './config.js';
import { collideCircle, laneCoord, lightAllows } from './city.js';
import { angleDelta, clamp, distance } from './rng.js';
import { addParticles } from './world.js';
import { hitPed } from './peds.js';
import { reportCrime } from './wanted.js';

/**
 * Advance one car by dt under a control input: throttle -1..1, steer -1..1,
 * handbrake true/false. Handles building collision, impact damage, smoke
 * and skid marks. Returns the impact speed of any crash this step (0 = none).
 */
export function stepCarPhysics(world, car, control, dt) {
  const spec = CAR_TYPES[car.type];
  let { throttle, steer } = control;
  if (car.dead) {
    throttle = 0;
    steer = 0;
  }
  if (throttle > 0) {
    car.speed += spec.accel * throttle * dt * (1 - Math.max(0, car.speed) / spec.topSpeed);
  } else if (throttle < 0) {
    if (car.speed > 5) car.speed -= CAR.brake * dt;
    else car.speed = Math.max(-CAR.reverseMax, car.speed - spec.accel * 0.55 * dt);
  }
  const dragK = control.handbrake ? 0.9 : 0.42;
  car.speed -= car.speed * dragK * dt;
  if (Math.abs(car.speed) < 2 && throttle === 0) car.speed = 0;

  const speedRatio = clamp(car.speed / 130, -1, 1);
  const highSpeedLoss = 1 - Math.min(0.42, Math.abs(car.speed) / spec.topSpeed) * 0.5;
  const turnRate = spec.turn * highSpeedLoss * (control.handbrake ? 1.45 : 1);
  car.angle += steer * turnRate * speedRatio * dt * (car.speed < 0 ? -1 : 1);

  const nx = car.x + Math.cos(car.angle) * car.speed * dt;
  const ny = car.y + Math.sin(car.angle) * car.speed * dt;
  const [cx, cy] = collideCircle(world.city, nx, ny, CAR.radius - 3);
  let impact = 0;
  const push = distance(nx, ny, cx, cy);
  if (push > 2.5 && Math.abs(car.speed) > 55) {
    impact = Math.abs(car.speed);
    const damage = (impact - 45) * 0.075;
    damageCar(world, car, damage, cx, cy);
    car.speed *= -0.22;
  } else if (push > 2.5) {
    car.speed *= 0.4;
  }
  car.x = cx;
  car.y = cy;

  // Skid marks when drifting or braking hard at speed.
  const drifting = (control.handbrake && Math.abs(car.speed) > 110) || (Math.abs(steer) > 0.85 && Math.abs(car.speed) > 235);
  if (drifting && world.skids.length < 500) {
    const back = CAR.length / 2 - 6;
    const side = CAR.width / 2 - 3;
    for (const s of [-1, 1]) {
      world.skids.push({
        x: car.x - Math.cos(car.angle) * back + Math.cos(car.angle + Math.PI / 2) * side * s,
        y: car.y - Math.sin(car.angle) * back + Math.sin(car.angle + Math.PI / 2) * side * s,
        angle: car.angle,
        life: 0,
      });
    }
  }
  // A hurt engine smokes; a dying one smokes hard.
  if (car.health < 55 && !car.dead) {
    car.smokeT -= dt;
    if (car.smokeT <= 0) {
      car.smokeT = car.health < 25 ? 0.05 : 0.16;
      addParticles(world, car.x + Math.cos(car.angle) * 22, car.y + Math.sin(car.angle) * 22, 1, {
        speedMin: 4, speedMax: 16, lifeMin: 0.5, lifeMax: 1, sizeMin: 4, sizeMax: 8,
        colors: car.health < 25 ? ['#3a3a3a', '#565656'] : ['#9aa0a3', '#c9ced1'], rise: 26, drag: 0.6,
      });
    }
  }
  car.throttleVis = throttle;
  return impact;
}

/** Damage a car; at zero health the engine dies and the driver bails out. */
export function damageCar(world, car, amount, x, y) {
  if (amount <= 0) return;
  car.health -= amount;
  addParticles(world, x ?? car.x, y ?? car.y, Math.min(10, 3 + amount), {
    speedMin: 40, speedMax: 170, lifeMin: 0.2, lifeMax: 0.55, sizeMin: 1.6, sizeMax: 3,
    colors: ['#ffd166', '#ff9f43', '#e8ecf0'], gravity: 130,
  });
  if (car.health <= 0 && !car.dead) {
    car.dead = true;
    car.health = 0;
    addParticles(world, car.x, car.y, 16, {
      speedMin: 20, speedMax: 90, lifeMin: 0.6, lifeMax: 1.3, sizeMin: 5, sizeMax: 11,
      colors: ['#3a3a3a', '#6b6b6b'], rise: 34, drag: 0.7,
    });
    if (car.driver && car.mode === 'traffic') {
      const ped = car.driver;
      car.driver = null;
      ped.car = null;
      ped.state = 'flee';
      ped.fleeFrom = { x: car.x, y: car.y };
      ped.fleeT = 2.5;
      ped.x = car.x + Math.cos(car.angle + Math.PI / 2) * 30;
      ped.y = car.y + Math.sin(car.angle + Math.PI / 2) * 30;
    }
  }
}

/** Car-against-car bumps: push apart, trade damage, report cop hits. */
function collideCars(world) {
  const cars = world.cars;
  for (let i = 0; i < cars.length; i += 1) {
    const a = cars[i];
    for (let j = i + 1; j < cars.length; j += 1) {
      const b = cars[j];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const d2 = dx * dx + dy * dy;
      const min = CAR.radius * 2 - 6;
      if (d2 >= min * min || d2 === 0) continue;
      const d = Math.sqrt(d2);
      const ux = dx / d;
      const uy = dy / d;
      const overlap = (min - d) / 2;
      const aMovable = a.mode !== 'parked' && a.mode !== 'block';
      const bMovable = b.mode !== 'parked' && b.mode !== 'block';
      if (aMovable) { a.x -= ux * overlap; a.y -= uy * overlap; }
      if (bMovable) { b.x += ux * overlap; b.y += uy * overlap; }
      const relSpeed = Math.abs((a.speed * Math.cos(a.angle) - b.speed * Math.cos(b.angle)) * ux + (a.speed * Math.sin(a.angle) - b.speed * Math.sin(b.angle)) * uy);
      if (relSpeed > 62) {
        const dmg = (relSpeed - 50) * 0.055;
        damageCar(world, a, dmg, a.x + ux * 20, a.y + uy * 20);
        damageCar(world, b, dmg, b.x - ux * 20, b.y - uy * 20);
        const playerCar = world.player.car;
        if (playerCar && (a === playerCar || b === playerCar)) {
          world.camera.shake = Math.min(16, relSpeed * 0.05);
          world.audio.sounds.crash(relSpeed > 170);
          const other = a === playerCar ? b : a;
          if (other.mode === 'police') reportCrime(world, 'copCarHit', other.x, other.y);
          hurtPlayerInCar(world, (relSpeed - 55) * 0.045);
        } else if (distance(a.x, a.y, world.player.x, world.player.y) < 420) {
          world.audio.sounds.crash(relSpeed > 190);
        }
        a.speed *= 0.55;
        b.speed *= 0.55;
      } else {
        a.speed *= 0.86;
        b.speed *= 0.86;
      }
    }
  }
}

/** The player takes a share of any big hit while driving (armor soaks first). */
export function hurtPlayerInCar(world, amount) {
  const p = world.player;
  if (amount <= 0 || p.hurtT > 0) return;
  hurtPlayer(world, amount);
}

/** Shared player damage: armor absorbs 60%, then health; death handled by player update. */
export function hurtPlayer(world, amount) {
  const p = world.player;
  if (world.over || amount <= 0) return;
  const absorbed = Math.min(p.armor, amount * 0.6);
  p.armor -= absorbed;
  p.hp -= amount - absorbed;
  p.hurtT = 0.25;
  world.audio.sounds.hurt();
  world.camera.shake = Math.min(14, 4 + amount * 0.3);
}

/** Cars running over pedestrians: any fast car checks the walkers around it. */
function collideCarsWithPeds(world) {
  for (const car of world.cars) {
    if (Math.abs(car.speed) < 34 || car.mode === 'parked') continue;
    for (const ped of world.peds) {
      if (ped.state === 'driver' || ped.state === 'passenger' || ped.state === 'down') continue;
      if (distance(car.x, car.y, ped.x, ped.y) < CAR.radius + 12) {
        hitPed(world, ped, Math.abs(car.speed) * 0.32, car === world.player.car, car);
      }
    }
  }
}

// ---------------------------------------------------------------- traffic

/** The next intersection ahead of a traffic car on its axis, and its distance. */
function nextCrossing(world, car) {
  const lines = car.axis === 'v' ? world.city.roadsH : world.city.roadsV;
  const pos = car.axis === 'v' ? car.y : car.x;
  let best = null;
  let bestDist = Infinity;
  let bestIndex = -1;
  for (let i = 0; i < lines.length; i += 1) {
    const d = (lines[i] - pos) * car.dir;
    if (d > -6 && d < bestDist) {
      bestDist = d;
      best = lines[i];
      bestIndex = i;
    }
  }
  return { line: best, dist: bestDist, index: bestIndex };
}

/** Is another car close ahead of this one, in its lane? */
function carAhead(world, car, range) {
  const fx = Math.cos(car.angle);
  const fy = Math.sin(car.angle);
  for (const other of world.cars) {
    if (other === car) continue;
    const dx = other.x - car.x;
    const dy = other.y - car.y;
    const ahead = dx * fx + dy * fy;
    if (ahead < 4 || ahead > range) continue;
    const lateral = Math.abs(-dx * fy + dy * fx);
    if (lateral < 27) return other;
  }
  return null;
}

/** Is a walker on the road just ahead? */
function pedAhead(world, car, range) {
  const fx = Math.cos(car.angle);
  const fy = Math.sin(car.angle);
  for (const ped of world.peds) {
    if (ped.state === 'driver' || ped.state === 'passenger' || ped.state === 'down') continue;
    const dx = ped.x - car.x;
    const dy = ped.y - car.y;
    const ahead = dx * fx + dy * fy;
    if (ahead < 2 || ahead > range) continue;
    if (Math.abs(-dx * fy + dy * fx) < 24) return ped;
  }
  return null;
}

/** Traffic: follow the lane, mind the lights, keep off the car in front. */
function updateTrafficCar(world, car, dt) {
  const city = world.city;
  const spec = CAR_TYPES[car.type];
  const cross = nextCrossing(world, car);
  const crossKey = `${car.axis}:${cross.index}`;
  // Decide a turn as the car reaches a junction it has not yet judged.
  if (cross.line !== null && cross.dist < 34 && car.lastCross !== crossKey) {
    car.lastCross = crossKey;
    if (world.rng.chance(0.38)) {
      const oldRoad = car.road;
      car.axis = car.axis === 'v' ? 'h' : 'v';
      car.road = cross.index;
      car.dir = world.rng.chance(0.5) ? -1 : 1;
      // The junction just used is also "judged" on the new axis, so the car
      // commits to its turn instead of re-deciding in the middle of it.
      car.lastCross = `${car.axis}:${oldRoad}`;
    }
  }
  const lanePos = laneCoord(city, car.axis, car.road, car.dir);
  let tx;
  let ty;
  if (car.axis === 'v') {
    tx = lanePos;
    ty = car.y + car.dir * 300;
  } else {
    tx = car.x + car.dir * 300;
    ty = lanePos;
  }
  let targetSpeed = spec.topSpeed * 0.52;
  if (car.fleeT > 0) {
    car.fleeT -= dt;
    targetSpeed = spec.topSpeed * 0.86;
  } else {
    // Red light ahead: stop at the line unless already in the junction.
    const lightIx = car.axis === 'v' ? car.road : cross.index;
    const lightIy = car.axis === 'v' ? cross.index : car.road;
    if (cross.line !== null && cross.dist > 26 && cross.dist < 128 && !lightAllows(city, lightIx, lightIy, car.axis, world.time)) {
      targetSpeed = 0;
    }
    const ahead = carAhead(world, car, 92);
    if (ahead) {
      targetSpeed = Math.min(targetSpeed, ahead.speed * 0.9);
      if (car.speed < 12) {
        car.stuckT += dt;
        if (car.stuckT > 1.4 && car.honkCd <= 0) {
          car.honkCd = world.rng.range(3, 7);
          if (distance(car.x, car.y, world.player.x, world.player.y) < 480) world.audio.sounds.honk();
        }
      }
    } else {
      car.stuckT = 0;
    }
    const walker = pedAhead(world, car, 74);
    if (walker) targetSpeed = 0;
  }
  car.honkCd -= dt;
  const desired = Math.atan2(ty - car.y, tx - car.x);
  const steer = clamp(angleDelta(car.angle, desired) * 2.4, -1, 1);
  let throttle = 0;
  if (car.speed < targetSpeed - 6) throttle = 1;
  else if (car.speed > targetSpeed + 6) throttle = -0.7;
  stepCarPhysics(world, car, { throttle, steer, handbrake: false }, dt);
}

// ---------------------------------------------------------------- police

/** Police pursuit: run the player down, ram, and at 3+ stars shoot. */
function updatePoliceCar(world, car, dt) {
  const p = world.player;
  const spec = CAR_TYPES.police;
  if (car.dead) {
    stepCarPhysics(world, car, { throttle: 0, steer: 0, handbrake: false }, dt);
    return;
  }
  let tx = p.x;
  let ty = p.y;
  if (p.car) {
    tx += Math.cos(p.car.angle) * p.car.speed * 0.45;
    ty += Math.sin(p.car.angle) * p.car.speed * 0.45;
  }
  const d = distance(car.x, car.y, p.x, p.y);
  let targetSpeed = spec.topSpeed * 0.97;
  if (world.over) targetSpeed = 0;
  else if (!p.car && d < 90) targetSpeed = spec.topSpeed * 0.3; // circle a foot suspect, don't just mow them
  else if (d < 46) targetSpeed = Math.abs(p.car ? p.car.speed : 0) * 0.8;
  const desired = Math.atan2(ty - car.y, tx - car.x);
  const steer = clamp(angleDelta(car.angle, desired) * 2.6, -1, 1);
  let throttle = 0;
  if (car.speed < targetSpeed - 6) throttle = 1;
  else if (car.speed > targetSpeed + 6) throttle = -0.8;
  stepCarPhysics(world, car, { throttle, steer, handbrake: false }, dt);

  // Shooting from the car at three stars and up.
  car.fireCd = (car.fireCd ?? 0) - dt;
  if (world.wanted.stars >= 3 && !world.over && d < 320 && d > 30 && car.fireCd <= 0) {
    car.fireCd = world.rng.range(0.55, 1.05);
    world.audio.sounds.gunshot();
    const spread = world.rng.range(-0.09, 0.09);
    const a = Math.atan2(p.y - car.y, p.x - car.x) + spread;
    const hx = car.x + Math.cos(a) * d;
    const hy = car.y + Math.sin(a) * d;
    world.tracers.push({ x1: car.x + Math.cos(car.angle) * 26, y1: car.y + Math.sin(car.angle) * 26, x2: hx, y2: hy, life: 0, maxLife: 0.09, color: '#ffd98a' });
    addParticles(world, car.x + Math.cos(car.angle) * 28, car.y + Math.sin(car.angle) * 28, 3, {
      speedMin: 10, speedMax: 40, lifeMin: 0.05, lifeMax: 0.12, sizeMin: 2, sizeMax: 4, colors: ['#ffd166', '#fff3b0'],
    });
    if (world.rng.chance(0.42)) {
      if (p.car) {
        damageCar(world, p.car, 2.2, p.x, p.y);
        hurtPlayer(world, 1.1);
      } else {
        hurtPlayer(world, 6.5);
      }
    }
  }
}

/** Advance every car in the world by one step. */
export function updateVehicles(world, dt) {
  for (const car of world.cars) {
    if (car.mode === 'traffic') updateTrafficCar(world, car, dt);
    else if (car.mode === 'police') updatePoliceCar(world, car, dt);
    else if (car.mode === 'parked' || car.mode === 'block') {
      car.speed *= Math.max(0, 1 - 3 * dt);
      if (car.health < 55 && !car.dead) stepCarPhysics(world, car, { throttle: 0, steer: 0, handbrake: false }, dt);
    }
  }
  collideCars(world);
  collideCarsWithPeds(world);
}
