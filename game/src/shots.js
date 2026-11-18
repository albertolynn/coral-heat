// The screenshot scenes behind ?shot=chase|downtown|mission|beach&seed=N.
// Each builds a fresh world, stages a real gameplay situation and steps the
// real simulation forward under a simple autopilot — the same lane-following
// the traffic uses, driven through a virtual keyboard — so a headless
// capture shows the game as it actually plays, and a seed always gives the
// same frame.
import { STEP } from './config.js';
import { laneCoord } from './city.js';
import { angleDelta, distance } from './rng.js';
import { makeCar, spawnPed } from './world.js';
import { beginStory } from './missions.js';
import { starsForHeat } from './wanted.js';

/** A keyboard-and-mouse stand-in the autopilot presses. */
function virtualInput() {
  const keys = new Set();
  let mx = 640;
  let my = 360;
  return {
    keys,
    down: (code) => keys.has(code),
    moveAxis() {
      return {
        x: (keys.has('KeyD') || keys.has('ArrowRight') ? 1 : 0) - (keys.has('KeyA') || keys.has('ArrowLeft') ? 1 : 0),
        y: (keys.has('KeyS') || keys.has('ArrowDown') ? 1 : 0) - (keys.has('KeyW') || keys.has('ArrowUp') ? 1 : 0),
      };
    },
    takeActions: () => 0,
    takeClicks: () => [],
    mouse: () => ({ x: mx, y: my, down: false }),
    aimAt(worldX, worldY, cam) {
      mx = 640 + (worldX - cam.x);
      my = 360 + (worldY - cam.y);
    },
  };
}

/** Put the player into a fresh car at a road point, engine running. */
function putPlayerInCar(world, x, y, angle, type) {
  const car = makeCar(world, x, y, angle, type, 'player');
  car.speed = 120;
  world.player.car = car;
  world.player.x = x;
  world.player.y = y;
  world.camera.x = x;
  world.camera.y = y;
  return car;
}

/**
 * Drive a car along the road lanes with the virtual keys: pick a target far
 * ahead on the current lane, turn at junctions like the traffic does, and
 * press W/A/S/D to hold the target speed.
 */
function driveRoads(world, input, car, targetSpeed) {
  const city = world.city;
  const cross = (() => {
    const lines = car.axis === 'v' ? city.roadsH : city.roadsV;
    const pos = car.axis === 'v' ? car.y : car.x;
    let bestDist = Infinity;
    let bestIndex = -1;
    for (let i = 0; i < lines.length; i += 1) {
      const d = (lines[i] - pos) * car.dir;
      if (d > -6 && d < bestDist) {
        bestDist = d;
        bestIndex = i;
      }
    }
    return { dist: bestDist, index: bestIndex };
  })();
  const key = `${car.axis}:${cross.index}`;
  if (cross.index >= 0 && cross.dist < 36 && car.lastCross !== key) {
    car.lastCross = key;
    if (world.rng.chance(0.42)) {
      const oldRoad = car.road;
      car.axis = car.axis === 'v' ? 'h' : 'v';
      car.road = cross.index;
      car.dir = world.rng.chance(0.5) ? -1 : 1;
      car.lastCross = `${car.axis}:${oldRoad}`;
    }
  }
  const lane = laneCoord(city, car.axis, car.road, car.dir);
  const tx = car.axis === 'v' ? lane : car.x + car.dir * 300;
  const ty = car.axis === 'v' ? car.y + car.dir * 300 : lane;
  steerToward(world, input, car, tx, ty, targetSpeed);
}

/** Press the virtual keys to steer a car toward a point at a speed. */
function steerToward(world, input, car, tx, ty, targetSpeed) {
  const desired = Math.atan2(ty - car.y, tx - car.x);
  const delta = angleDelta(car.angle, desired);
  input.keys.delete('KeyA');
  input.keys.delete('KeyD');
  if (delta > 0.09) input.keys.add('KeyD');
  else if (delta < -0.09) input.keys.add('KeyA');
  input.keys.delete('KeyW');
  input.keys.delete('KeyS');
  if (car.speed < targetSpeed) input.keys.add('KeyW');
  else if (car.speed > targetSpeed + 26) input.keys.add('KeyS');
}

/** Walk the player toward a point with the virtual keys. */
function walkToward(input, world, tx, ty) {
  const p = world.player;
  const axis = { x: 0, y: 0 };
  if (tx - p.x > 14) axis.x = 1;
  else if (p.x - tx > 14) axis.x = -1;
  if (ty - p.y > 14) axis.y = 1;
  else if (p.y - ty > 14) axis.y = -1;
  input.keys.delete('KeyW');
  input.keys.delete('KeyA');
  input.keys.delete('KeyS');
  input.keys.delete('KeyD');
  if (axis.x > 0) input.keys.add('KeyD');
  if (axis.x < 0) input.keys.add('KeyA');
  if (axis.y > 0) input.keys.add('KeyS');
  if (axis.y < 0) input.keys.add('KeyW');
  return distance(p.x, p.y, tx, ty) < 20;
}

const SCENES = {
  /** Cover: a three-star chase through downtown, HUD blazing. */
  chase(world, input) {
    world.clockMinutes = 15 * 60 + 10;
    const car = putPlayerInCar(world, 1610 - 31, 900, Math.PI / 2, 'muscle');
    car.axis = 'v';
    car.road = 3;
    car.dir = 1;
    world.wanted.heat = 6.4;
    world.wanted.stars = starsForHeat(6.4);
    for (let i = 0; i < 3; i += 1) {
      const cop = makeCar(world, car.x + (i - 1) * 46, car.y - 300 - i * 130, Math.PI / 2, 'police', 'police');
      cop.speed = 210;
    }
    return {
      seconds: 9.5,
      drive() {
        driveRoads(world, input, car, 282);
        world.objective = { text: 'Lose the heat!', marker: null };
        world.fareCd = 999;
      },
    };
  },

  /** On foot downtown at midday: walkers, traffic, the café. */
  downtown(world, input) {
    world.clockMinutes = 11 * 60 + 5;
    const cafe = world.city.locations.cafe;
    world.player.x = cafe.x - 60;
    world.player.y = cafe.y + 90;
    world.camera.x = world.player.x;
    world.camera.y = world.player.y;
    for (let i = 0; i < 9; i += 1) {
      spawnPed(world, cafe.x + world.rng.range(-260, 260), cafe.y + world.rng.range(-220, 220));
    }
    // The sidewalk rim of the café's own block, walked like any pedestrian.
    const corners = [
      { x: 1109, y: 1539 },
      { x: 821, y: 1539 },
      { x: 821, y: 1251 },
      { x: 1109, y: 1251 },
    ];
    let corner = 0;
    return {
      seconds: 12,
      drive() {
        if (walkToward(input, world, corners[corner].x, corners[corner].y)) corner = (corner + 1) % corners.length;
        world.fareCd = 999;
      },
    };
  },

  /** A mission in progress: Marisol's first delivery, dialogue still up. */
  mission(world, input) {
    world.clockMinutes = 10 * 60 + 15;
    beginStory(world, 0);
    const car = putPlayerInCar(world, 1180 - 31, 1420, Math.PI / 2, 'sedan');
    car.axis = 'v';
    car.road = 2;
    car.dir = 1;
    return {
      seconds: 10,
      drive() {
        driveRoads(world, input, car, 215);
        world.fareCd = 999;
      },
    };
  },

  /** Golden hour: cruising the boardwalk with the water on the right. */
  beach(world, input) {
    world.clockMinutes = 18 * 60 + 38;
    const car = putPlayerInCar(world, 3346, 2560, -Math.PI / 2, 'muscle');
    car.speed = 150;
    return {
      seconds: 10.5,
      drive() {
        steerToward(world, input, car, 3346, car.y - 420, 205);
        world.objective = { text: 'Golden hour on the Coral Boardwalk', marker: null };
        world.fareCd = 999;
      },
    };
  },
};

/**
 * Stage the named scene on a fresh world and return its driver: the main
 * loop steps it `seconds` worth of fixed steps, then paints.
 */
export function createShotScene(name, world) {
  const input = virtualInput();
  const scene = (SCENES[name] ?? SCENES.downtown)(world, input);
  return {
    input,
    steps: Math.round(scene.seconds / STEP),
    drive() {
      scene.drive(world);
    },
  };
}
