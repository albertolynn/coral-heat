// Boot and the one loop. Coral Heat runs on a fixed 1/60 s step: missions
// first (they may consume the interact key for shops and conversations),
// then the world. Around the simulation sit the screens — title, play,
// paused, help, the gun shop — and the save game that Continue resumes.
//
// ?seed=N fixes the city's random stream. ?shot=chase|downtown|mission|beach
// (with &seed=N) stages a screenshot scene instead of running the loop:
// it steps the real simulation under an autopilot, paints twice and sets
// window.__shotReady.
import { STEP } from './config.js';
import { ACT_PAUSE, createInput } from './input.js';
import { createWorld, updateWorld } from './world.js';
import { respawnPlayer, shopBuy, updateMissions } from './missions.js';
import { createRenderer } from './render.js';
import { createHud } from './hud.js';
import { createShotScene } from './shots.js';
import { applySave, clearSave, loadSave, storeSave } from './save.js';

const MAX_FRAME = 0.25;

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : Math.floor(Math.random() * 4294967296);

const canvas = document.getElementById('game');
const status = document.getElementById('status');
const renderer = createRenderer(canvas);
const hud = createHud(renderer);
const input = createInput(canvas);

function announce(message) {
  if (status) status.textContent = message;
}

// ------------------------------------------------------------ shot scenes

function runShot(name) {
  const world = createWorld(seed);
  const scene = createShotScene(name, world);
  for (let i = 0; i < scene.steps; i += 1) {
    world.frameActions = 0;
    updateMissions(world, scene.input, STEP);
    scene.drive();
    updateWorld(world, scene.input, STEP);
  }
  const ui = { screen: 'play', hasSave: false, menuIndex: 0, shopMsg: '' };
  let painted = 0;
  function paint() {
    renderer.drawWorld(world);
    hud.draw(world, ui, scene.input, [], 0);
    painted += 1;
    if (painted < 2) requestAnimationFrame(paint);
    else window.__shotReady = true;
  }
  requestAnimationFrame(paint);
}

// ------------------------------------------------------------ the game

function runGame() {
  let world = createWorld(seed);
  const ui = { screen: 'title', helpReturn: 'title', menuIndex: 0, hasSave: !!loadSave(), shopMsg: '' };
  let accumulator = 0;
  let last = performance.now();
  let upWas = false;
  let downWas = false;
  let muteWas = false;

  function startNewGame() {
    clearSave();
    world = createWorld(Math.floor(Math.random() * 4294967296));
    ui.hasSave = false;
    ui.screen = 'play';
    world.audio.ensure();
    world.audio.startMusic();
    announce('New game. See Marisol at Café Azul.');
  }

  function startContinue() {
    const save = loadSave();
    world = createWorld(Math.floor(Math.random() * 4294967296));
    if (save) applySave(world, save);
    ui.screen = 'play';
    world.audio.ensure();
    world.audio.startMusic();
    announce('Welcome back to Coral Bay.');
  }

  function handleAction(action) {
    if (!action) return;
    if (ui.screen === 'title') {
      if (action === 'new') startNewGame();
      else if (action === 'continue') startContinue();
      else if (action === 'help') {
        ui.helpReturn = 'title';
        ui.screen = 'help';
      }
    } else if (ui.screen === 'paused') {
      if (action === 'resume') ui.screen = 'play';
      else if (action === 'help') {
        ui.helpReturn = 'paused';
        ui.screen = 'help';
      } else if (action === 'title') {
        ui.hasSave = !!loadSave();
        ui.screen = 'title';
      }
    } else if (ui.screen === 'help') {
      if (action === 'back') ui.screen = ui.helpReturn;
    } else if (ui.screen === 'shop') {
      if (action === 'close-shop') {
        world.shop = null;
        ui.screen = 'play';
      } else if (action.startsWith('buy:')) {
        ui.shopMsg = shopBuy(world, action.slice(4));
      }
    }
    ui.menuIndex = 0;
  }

  function menuKeys(actions) {
    const up = input.down('ArrowUp') || input.down('KeyW');
    const down = input.down('ArrowDown') || input.down('KeyS');
    if (up && !upWas) ui.menuIndex = Math.max(0, ui.menuIndex - 1);
    if (down && !downWas) ui.menuIndex += 1;
    upWas = up;
    downWas = down;
    if (actions & ACT_PAUSE) {
      if (ui.screen === 'paused') ui.screen = 'play';
      else if (ui.screen === 'help') ui.screen = ui.helpReturn;
      else if (ui.screen === 'shop') {
        world.shop = null;
        ui.screen = 'play';
      }
    }
    if (ui.screen === 'shop') {
      const items = ['buy:pistol', 'buy:ammo', 'buy:armor', 'close-shop'];
      for (let i = 0; i < items.length; i += 1) {
        if (input.down(`Digit${i + 1}`) && !ui[`digit${i}Was`]) {
          ui[`digit${i}Was`] = true;
          handleAction(items[i]);
        }
        if (!input.down(`Digit${i + 1}`)) ui[`digit${i}Was`] = false;
      }
    }
  }

  function stepOnce(first) {
    if (!first) world.frameActions = 0;
    updateMissions(world, input, STEP);
    if (world.shop) {
      ui.screen = 'shop';
      ui.shopMsg = '';
      return;
    }
    updateWorld(world, input, STEP);
    if (world.saveDirty) {
      world.saveDirty = false;
      storeSave(world);
      ui.hasSave = true;
    }
    if (world.over) {
      world.over.timer -= STEP;
      if (world.over.timer <= 0) respawnPlayer(world);
    }
  }

  function frame(now) {
    requestAnimationFrame(frame);
    accumulator += Math.min((now - last) / 1000, MAX_FRAME);
    last = now;
    const actions = input.takeActions();
    const clicks = input.takeClicks();

    // M is a global mute, in every screen.
    const mute = input.down('KeyM');
    if (mute && !muteWas) {
      const muted = world.audio.toggleMute();
      if (ui.screen === 'play') world.messages.push({ text: muted ? 'Sound off' : 'Sound on', color: '#b9c2cc', t: world.time });
    }
    muteWas = mute;

    if (ui.screen === 'play') {
      if (actions & ACT_PAUSE) {
        ui.screen = 'paused';
        ui.menuIndex = 0;
        accumulator = 0;
        announce('Paused.');
      } else {
        world.frameActions = actions;
        let first = true;
        let guard = 0;
        while (accumulator >= STEP && guard < 6) {
          stepOnce(first);
          first = false;
          accumulator -= STEP;
          guard += 1;
          if (ui.screen !== 'play') {
            accumulator = 0;
            break;
          }
        }
      }
    } else {
      accumulator = 0;
      menuKeys(actions);
      // The world shows behind the pause, help and shop panels; the title
      // screen paints its own backdrop and needs nothing beneath it.
      if (ui.screen !== 'title') renderer.drawWorld(world);
      const action = hud.draw(world, ui, input, clicks, actions);
      handleAction(action);
      return;
    }

    renderer.drawWorld(world);
    hud.draw(world, ui, input, [], 0);
  }

  document.addEventListener('visibilitychange', () => {
    if (document.hidden && ui.screen === 'play') {
      ui.screen = 'paused';
      announce('Paused.');
    }
  });

  announce('Coral Heat. New Game, Continue, or How to Play.');
  requestAnimationFrame(frame);
}

if (shot) runShot(shot);
else runGame();
