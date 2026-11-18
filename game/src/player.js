// The player: walking and sprinting on foot, mouse aim, fists and the
// pistol, stealing and driving cars, and the two ways a run ends — wasted
// (hospital) or busted (the station). Interactions with shops and mission
// markers live in missions.js; this file owns the body and the car keys.
import { PISTOL, PLAYER, VIEW } from './config.js';
import { collideCircle } from './city.js';
import { clamp, distance } from './rng.js';
import { ACT_INTERACT } from './input.js';
import { addMessage, addParticles, addTracer } from './world.js';
import { damageCar, stepCarPhysics } from './vehicles.js';
import { damagePed, panicNearby } from './peds.js';
import { reportCrime } from './wanted.js';

/** The mouse position in world coordinates (the camera centres the view). */
export function mouseWorld(world, input) {
  const m = input.mouse();
  return {
    x: world.camera.x + (m.x - VIEW.width / 2),
    y: world.camera.y + (m.y - VIEW.height / 2),
    down: m.down,
  };
}

/** The nearest car within range of the player, any kind. */
export function nearestCar(world, range) {
  const p = world.player;
  let best = null;
  let bestD = range;
  for (const car of world.cars) {
    const d = distance(car.x, car.y, p.x, p.y);
    if (d < bestD) {
      bestD = d;
      best = car;
    }
  }
  return best;
}

/** Climb in: an occupied car loses its driver, and the street notices. */
function enterCar(world, car) {
  const p = world.player;
  if (car.driver) {
    const driver = car.driver;
    car.driver = null;
    driver.car = null;
    driver.x = car.x + Math.cos(car.angle + Math.PI / 2) * 34;
    driver.y = car.y + Math.sin(car.angle + Math.PI / 2) * 34;
    driver.state = 'flee';
    driver.fleeFrom = { x: p.x, y: p.y };
    driver.fleeT = 3;
    addMessage(world, 'You yank the driver out!', '#ffd166');
  }
  if (car.mode !== 'player') {
    reportCrime(world, 'carTheft', car.x, car.y);
    world.stats.carsStolen += 1;
  }
  car.mode = 'player';
  p.car = car;
  p.x = car.x;
  p.y = car.y;
  p.bustedT = 0;
  world.audio.sounds.door();
  world.audio.startMusic();
}

/** Climb out, leaving the car parked where it stands. */
function exitCar(world) {
  const p = world.player;
  const car = p.car;
  if (!car) return;
  if (Math.abs(car.speed) > 85) {
    addMessage(world, 'Too fast to bail out!', '#ff8a7a');
    return;
  }
  car.mode = 'parked';
  car.speed = 0;
  p.car = null;
  const side = Math.PI / 2;
  p.x = car.x + Math.cos(car.angle + side) * 36;
  p.y = car.y + Math.sin(car.angle + side) * 36;
  const [cx, cy] = collideCircle(world.city, p.x, p.y, PLAYER.radius);
  p.x = cx;
  p.y = cy;
  world.audio.sounds.door();
}

/** Swing a fist: the nearest walker or car in front takes it. */
function punch(world) {
  const p = world.player;
  p.punchCd = PLAYER.punchCooldown;
  world.audio.sounds.punch();
  let bestPed = null;
  let bestD = PLAYER.punchRange;
  for (const ped of world.peds) {
    if (ped.state === 'down' || ped.state === 'driver' || ped.state === 'passenger') continue;
    const d = distance(ped.x, ped.y, p.x, p.y);
    if (d < bestD) {
      bestD = d;
      bestPed = ped;
    }
  }
  if (bestPed) {
    damagePed(world, bestPed, PLAYER.punchDamage, true, 'pedKill');
    return;
  }
  const car = nearestCar(world, PLAYER.punchRange + 16);
  if (car && car !== p.car) {
    damageCar(world, car, 5, p.x + Math.cos(p.angle) * 24, p.y + Math.sin(p.angle) * 24);
    if (car.mode === 'police') reportCrime(world, 'copCarHit', car.x, car.y);
  }
}

/** Fire the pistol: a hitscan ray against walkers, cars and buildings. */
function shoot(world, aimAngle) {
  const p = world.player;
  p.fireCd = PISTOL.cooldown;
  p.ammoInMag -= 1;
  world.audio.sounds.gunshot();
  reportCrime(world, 'gunshot', p.x, p.y);
  panicNearby(world, p.x, p.y, 210);
  const angle = aimAngle + world.rng.range(-PISTOL.spread, PISTOL.spread);
  const dx = Math.cos(angle);
  const dy = Math.sin(angle);
  let hitD = PISTOL.range;
  let hitPed = null;
  let hitCar = null;
  for (const ped of world.peds) {
    if (ped.state === 'down' || ped.state === 'driver' || ped.state === 'passenger') continue;
    const t = (ped.x - p.x) * dx + (ped.y - p.y) * dy;
    if (t < 0 || t > hitD) continue;
    const lateral = Math.abs(-(ped.x - p.x) * dy + (ped.y - p.y) * dx);
    if (lateral < 14) {
      hitD = t;
      hitPed = ped;
      hitCar = null;
    }
  }
  for (const car of world.cars) {
    if (car === p.car) continue;
    const t = (car.x - p.x) * dx + (car.y - p.y) * dy;
    if (t < 0 || t > hitD) continue;
    const lateral = Math.abs(-(car.x - p.x) * dy + (car.y - p.y) * dx);
    if (lateral < 30) {
      hitD = t;
      hitCar = car;
      hitPed = null;
    }
  }
  // Buildings stop the bullet: march the ray until it enters one.
  let wallD = PISTOL.range;
  for (let step = 20; step < PISTOL.range; step += 10) {
    const sx = p.x + dx * step;
    const sy = p.y + dy * step;
    let inside = false;
    for (const b of world.city.buildings) {
      if (sx > b.x && sx < b.x + b.w && sy > b.y && sy < b.y + b.h) {
        inside = true;
        break;
      }
    }
    if (inside) {
      wallD = step;
      break;
    }
  }
  if (wallD < hitD) {
    hitD = wallD;
    hitPed = null;
    hitCar = null;
  }
  const hx = p.x + dx * hitD;
  const hy = p.y + dy * hitD;
  addTracer(world, p.x + dx * 18, p.y + dy * 18, hx, hy);
  addParticles(world, p.x + dx * 22, p.y + dy * 22, 3, {
    speedMin: 8, speedMax: 34, lifeMin: 0.04, lifeMax: 0.1, sizeMin: 2, sizeMax: 4.4, colors: ['#ffd166', '#fff3b0'],
  });
  if (hitPed) damagePed(world, hitPed, PISTOL.damage, true, 'pedKill');
  else if (hitCar) {
    damageCar(world, hitCar, PISTOL.damage * 0.4, hx, hy);
    if (hitCar.mode === 'police') reportCrime(world, 'copCarHit', hitCar.x, hitCar.y);
  } else if (hitD < PISTOL.range) {
    addParticles(world, hx, hy, 4, {
      speedMin: 16, speedMax: 70, lifeMin: 0.15, lifeMax: 0.35, sizeMin: 1.4, sizeMax: 2.6, colors: ['#d8d4c4', '#9aa0a3'],
    });
  }
  if (p.ammoInMag === 0 && p.reserve > 0) startReload(world);
}

function startReload(world) {
  const p = world.player;
  if (p.reloadT > 0 || p.ammoInMag >= PISTOL.magazine || p.reserve <= 0) return;
  p.reloadT = PISTOL.reloadTime;
  world.audio.sounds.reload();
}

/** On-foot update: move, aim, fight, get in and out of cars, get busted. */
function updateOnFoot(world, input, dt) {
  const p = world.player;
  const actions = world.frameActions ?? 0;
  const axis = input.moveAxis();
  const sprint = input.down('ShiftLeft') || input.down('ShiftRight');
  const speed = sprint ? PLAYER.sprintSpeed : PLAYER.walkSpeed;
  const moving = axis.x !== 0 || axis.y !== 0;
  p.moving = moving;
  if (moving) {
    const len = Math.sqrt(axis.x * axis.x + axis.y * axis.y);
    const nx = p.x + (axis.x / len) * speed * dt;
    const ny = p.y + (axis.y / len) * speed * dt;
    const [cx, cy] = collideCircle(world.city, nx, ny, PLAYER.radius);
    p.x = cx;
    p.y = cy;
    p.walkCycle += dt * (sprint ? 13 : 9.5);
    if (!input.mouse().down) p.angle = Math.atan2(axis.y, axis.x);
  }
  // Cars are solid to walk into.
  for (const car of world.cars) {
    const d = distance(car.x, car.y, p.x, p.y);
    const min = 30 + PLAYER.radius;
    if (d > 0.01 && d < min) {
      p.x = car.x + ((p.x - car.x) / d) * min;
      p.y = car.y + ((p.y - car.y) / d) * min;
    }
  }
  const mouse = mouseWorld(world, input);
  const aim = Math.atan2(mouse.y - p.y, mouse.x - p.x);
  if (input.mouse().down || p.weapon === 'pistol') p.angle = aim;

  // Weapon choice: 1 fists, 2 pistol, Q swaps.
  if (input.down('Digit1')) p.weapon = 'fists';
  if (input.down('Digit2') && p.hasPistol) p.weapon = 'pistol';
  if (input.down('KeyQ') && !p.qWas) {
    p.qWas = true;
    if (p.hasPistol) p.weapon = p.weapon === 'pistol' ? 'fists' : 'pistol';
  }
  if (!input.down('KeyQ')) p.qWas = false;

  p.punchCd -= dt;
  p.fireCd -= dt;
  if (p.reloadT > 0) {
    p.reloadT -= dt;
    if (p.reloadT <= 0) {
      const take = Math.min(PISTOL.magazine - p.ammoInMag, p.reserve);
      p.ammoInMag += take;
      p.reserve -= take;
    }
  }
  if (input.down('KeyR') && !p.rWas) {
    p.rWas = true;
    if (p.weapon === 'pistol') startReload(world);
  }
  if (!input.down('KeyR')) p.rWas = false;

  if (mouse.down) {
    if (p.weapon === 'pistol' && p.hasPistol) {
      if (p.fireCd <= 0 && p.reloadT <= 0) {
        if (p.ammoInMag > 0) shoot(world, aim);
        else {
          p.fireCd = 0.3;
          world.audio.sounds.empty();
          if (p.reserve > 0) startReload(world);
        }
      }
    } else if (p.punchCd <= 0) {
      punch(world);
    }
  }

  if (actions & ACT_INTERACT) {
    const car = nearestCar(world, PLAYER.enterRange);
    if (car) enterCar(world, car);
  }

  // Busted: a live cop car close by, and nowhere to run.
  if (world.wanted.stars > 0 && !world.over) {
    let copClose = false;
    for (const car of world.cars) {
      if (car.mode === 'police' && !car.dead && distance(car.x, car.y, p.x, p.y) < 56) {
        copClose = true;
        break;
      }
    }
    if (copClose && !sprint) p.bustedT += dt;
    else p.bustedT = Math.max(0, p.bustedT - dt * 1.6);
    if (p.bustedT >= PLAYER.bustedTime) {
      world.over = { kind: 'busted', timer: 2.4 };
      world.audio.sounds.fail();
    }
  } else {
    p.bustedT = 0;
  }
}

/** Driving update: keys become throttle and steering for the shared physics. */
function updateDriving(world, input, dt) {
  const p = world.player;
  const car = p.car;
  const actions = world.frameActions ?? 0;
  const throttle = (input.down('KeyW') || input.down('ArrowUp') ? 1 : 0) - (input.down('KeyS') || input.down('ArrowDown') ? 1 : 0);
  const steer = (input.down('KeyD') || input.down('ArrowRight') ? 1 : 0) - (input.down('KeyA') || input.down('ArrowLeft') ? 1 : 0);
  const handbrake = input.down('Space');
  stepCarPhysics(world, car, { throttle, steer, handbrake }, dt);
  p.x = car.x;
  p.y = car.y;
  p.angle = car.angle;
  p.moving = Math.abs(car.speed) > 12;
  if (actions & ACT_INTERACT) exitCar(world);
}

/** Advance the player by one step; death starts the hospital sequence. */
export function updatePlayer(world, input, dt) {
  const p = world.player;
  p.hurtT = Math.max(0, p.hurtT - dt);
  if (world.over) return;
  if (p.car) updateDriving(world, input, dt);
  else updateOnFoot(world, input, dt);
  if (p.hp <= 0) {
    p.hp = 0;
    world.over = { kind: 'wasted', timer: 2.4 };
    world.audio.sounds.fail();
    if (p.car) {
      p.car.mode = 'parked';
      p.car = null;
    }
  }
}
