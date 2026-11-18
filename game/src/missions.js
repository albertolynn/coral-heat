// Missions and money: Marisol Vega's five-job story chain at Café Azul, the
// taxi fares that pay between jobs, and the two shops (Coral Arms for guns
// and armor, Shine & Go for a respray that clears the heat). Missions are
// small stage machines over the world state; each sets world.objective so
// the HUD and minimap always know what the player is chasing.
import { ARMOR_PRICE, ECONOMY, HOSPITAL_FEE, PISTOL } from './config.js';
import { distance } from './rng.js';
import { ACT_INTERACT } from './input.js';
import { addMessage, makeCar, spawnPed, spawnPickup } from './world.js';
import { clearWanted, starsForHeat } from './wanted.js';

export const CHARACTERS = {
  marisol: 'Marisol Vega',
  dario: 'Dario (cousin)',
  you: 'You',
};

// ---------------------------------------------------------------- dialogue

/** Show a conversation: lines of { who, text }, advanced with E, click or time. */
export function say(world, lines) {
  world.dialogue = { lines, i: 0, t: 0 };
  world.audio.sounds.phone();
}

function updateDialogue(world, dt) {
  const d = world.dialogue;
  if (!d) return;
  d.t += dt;
  const advance = (world.frameActions & ACT_INTERACT) !== 0 || world.frameClicked || d.t > 5.2;
  if (advance) {
    world.frameActions &= ~ACT_INTERACT;
    d.i += 1;
    d.t = 0;
    if (d.i >= d.lines.length) world.dialogue = null;
  }
}

// ---------------------------------------------------------------- helpers

function setObjective(world, text, marker) {
  world.objective = { text, marker: marker ?? null };
}

function at(world, loc, range) {
  return distance(world.player.x, world.player.y, loc.x, loc.y) < range;
}

function completeMission(world, reward, outro) {
  const p = world.player;
  p.cash += reward;
  world.stats.earned += reward;
  world.mission = null;
  world.storyIndex += 1;
  world.audio.sounds.jingle();
  addMessage(world, `Mission complete: +$${reward}`, '#3fb68b');
  if (outro) say(world, outro);
  world.saveDirty = true;
}

function failMission(world, why) {
  if (world.mission && world.mission.carRef) world.mission.carRef.mission = false;
  world.mission = null;
  world.audio.sounds.fail();
  addMessage(world, `Mission failed — ${why}`, '#ff8a7a');
  if (world.taxi) cancelTaxi(world);
}

/** Spawn one of the story's marked cars and remember it on the mission. */
function spawnMissionCar(world, x, y, angle, type, color) {
  const car = makeCar(world, x, y, angle, type, 'parked');
  car.mission = true;
  car.color = color;
  return car;
}

// ---------------------------------------------------------------- the story

export const STORY = [
  {
    title: 'First Delivery',
    intro: [
      { who: CHARACTERS.marisol, text: "You must be Dario's cousin. I'm Marisol — I run this café, and half the favours in Coral Bay run through it." },
      { who: CHARACTERS.marisol, text: 'A package is waiting at the docks, Gate 3. Pick it up and bring it back here. Quick and quiet.' },
      { who: CHARACTERS.you, text: 'And if it stops being quiet?' },
      { who: CHARACTERS.marisol, text: "Then take this pistol, and don't wave it around. Now go — the clock starts when you touch the package." },
    ],
    start(world) {
      const loc = world.city.locations.docksGate;
      world.mission.stage = 0;
      world.mission.marker = loc;
      setObjective(world, 'Pick up the package at the docks, Gate 3', loc);
    },
    update(world, dt) {
      const m = world.mission;
      const L = world.city.locations;
      if (m.stage === 0) {
        setObjective(world, 'Pick up the package at the docks, Gate 3', L.docksGate);
        if (at(world, L.docksGate, 62)) {
          m.stage = 1;
          m.timer = 150;
          const p = world.player;
          if (!p.hasPistol) {
            p.hasPistol = true;
            p.ammoInMag = PISTOL.magazine;
            p.reserve = 24;
            p.weapon = 'pistol';
            addMessage(world, 'Package collected — and a pistol: press 2 to draw it', '#ffd166');
          } else {
            addMessage(world, 'Package collected. The clock is running!', '#ffd166');
          }
          world.audio.sounds.pickup();
        }
      } else if (m.stage === 1) {
        m.timer -= dt;
        setObjective(world, `Deliver the package to Café Azul — ${Math.max(0, Math.ceil(m.timer))}s`, L.cafe);
        if (m.timer <= 0) return failMission(world, 'you were too slow');
        if (at(world, L.cafe, 74)) {
          completeMission(world, 300, [
            { who: CHARACTERS.marisol, text: 'On time and in one piece. Coral Bay might suit you after all.' },
            { who: CHARACTERS.marisol, text: 'Come back when you want more work. There is always more work.' },
          ]);
        }
      }
    },
  },
  {
    title: 'Borrowed Wheels',
    intro: [
      { who: CHARACTERS.dario, text: 'Cousin! A collector owes me money and parks his pink Vireo GT in the suburbs like he owns the sun.' },
      { who: CHARACTERS.dario, text: 'Take it. Bring it to my lockup by the docks. If the police notice, that is your problem, not mine.' },
      { who: CHARACTERS.you, text: 'Family is beautiful.' },
    ],
    start(world) {
      const car = spawnMissionCar(world, 703, 1420, -Math.PI / 2, 'sport', '#ff2e88');
      world.mission.carRef = car;
      world.mission.stage = 0;
      setObjective(world, 'Steal the pink Vireo GT in the suburbs', car);
    },
    update(world) {
      const m = world.mission;
      const L = world.city.locations;
      const car = m.carRef;
      if (!car || car.dead) return failMission(world, 'the car is wrecked');
      if (m.stage === 0) {
        setObjective(world, 'Steal the pink Vireo GT in the suburbs', car);
        if (world.player.car === car) {
          m.stage = 1;
          addMessage(world, "She's yours. Get her to the lockup!", '#ffd166');
        }
      } else {
        setObjective(world, "Deliver the Vireo to Dario's lockup", L.lockup);
        if (world.player.car === car && at(world, L.lockup, 96)) {
          car.mission = false;
          completeMission(world, 450, [
            { who: CHARACTERS.dario, text: 'Beautiful. He will cry into his cocktail. Drinks are on me — someday.' },
          ]);
        }
      }
    },
  },
  {
    title: 'Hot Water',
    intro: [
      { who: CHARACTERS.marisol, text: 'A parcel at Warehouse 9, down at the docks. In and out, nobody sees a thing.' },
      { who: CHARACTERS.marisol, text: 'Why are you looking at me like that? It is a simple job. Probably.' },
    ],
    start(world) {
      world.mission.stage = 0;
      setObjective(world, 'Pick up the parcel at Warehouse 9', world.city.locations.warehouse);
    },
    update(world, dt) {
      const m = world.mission;
      const L = world.city.locations;
      if (m.stage === 0) {
        setObjective(world, 'Pick up the parcel at Warehouse 9', L.warehouse);
        if (at(world, L.warehouse, 62)) {
          m.stage = 1;
          world.wanted.heat = Math.max(world.wanted.heat, 6.2);
          world.wanted.stars = starsForHeat(world.wanted.heat);
          addMessage(world, "It's a setup! Sirens everywhere — get to the old cannery!", '#ff8a7a');
          world.audio.sounds.fail();
        }
      } else if (m.stage === 1) {
        setObjective(world, 'Escape to the old cannery at the docks', L.hideout);
        if (at(world, L.hideout, 96)) m.stage = 2;
      } else if (m.stage === 2) {
        setObjective(world, 'Lay low at the cannery until the heat dies', L.hideout);
        if (at(world, L.hideout, 140)) {
          // Hidden among the fish crates, the heat cools far faster.
          world.wanted.heat = Math.max(0, world.wanted.heat - 0.38 * dt);
          world.wanted.stars = starsForHeat(world.wanted.heat);
        }
        if (world.wanted.stars === 0) {
          completeMission(world, 600, [
            { who: CHARACTERS.marisol, text: 'You smell of fish and freedom. The parcel was empty, by the way. Someone played us both.' },
            { who: CHARACTERS.marisol, text: 'I will find out who. Rest. Spend. Come back.' },
          ]);
        }
      }
    },
  },
  {
    title: 'Warehouse Noise',
    intro: [
      { who: CHARACTERS.marisol, text: 'Found our rats. A crew is squatting in Warehouse 9, sitting on my ledger like it is a beach chair.' },
      { who: CHARACTERS.marisol, text: 'Clear them out and bring me the ledger. They shoot first, so do not feel bad about it.' },
    ],
    start(world) {
      world.mission.stage = 0;
      setObjective(world, 'Go to Warehouse 9 at the docks', world.city.locations.warehouse);
    },
    update(world) {
      const m = world.mission;
      const L = world.city.locations;
      if (m.stage === 0) {
        setObjective(world, 'Go to Warehouse 9 at the docks', L.warehouse);
        if (at(world, L.warehouse, 130)) {
          m.stage = 1;
          m.hostiles = [];
          const spots = [[-70, -40], [50, -70], [80, 30], [-40, 60], [10, -110]];
          for (const [ox, oy] of spots) {
            const ped = spawnPed(world, L.warehouse.x + ox, L.warehouse.y + oy, { state: 'hostile' });
            ped.post = { x: ped.x, y: ped.y };
            ped.hp = 60;
            m.hostiles.push(ped);
          }
          addMessage(world, 'They spotted you — clear the warehouse!', '#ff8a7a');
        }
      } else if (m.stage === 1) {
        const left = m.hostiles.filter((h) => h.state !== 'down' && h.state !== 'gone').length;
        setObjective(world, `Clear out Warehouse 9 — ${left} left`, L.warehouse);
        if (left === 0) {
          m.stage = 2;
          spawnPickup(world, L.warehouse.x, L.warehouse.y, 'item', 0, 'ledger');
          addMessage(world, 'The ledger is on the floor — grab it', '#ffd166');
        }
      } else if (m.stage === 2) {
        setObjective(world, 'Pick up the ledger', L.warehouse);
        const item = world.pickups.find((pk) => pk.kind === 'item');
        if (item && !world.player.car && distance(world.player.x, world.player.y, item.x, item.y) < 30) {
          world.pickups = world.pickups.filter((pk) => pk !== item);
          m.stage = 3;
          world.audio.sounds.pickup();
          addMessage(world, 'Ledger in hand. Back to Marisol.', '#ffd166');
        }
      } else if (m.stage === 3) {
        setObjective(world, 'Bring the ledger back to Café Azul', L.cafe);
        if (at(world, L.cafe, 74)) {
          completeMission(world, 750, [
            { who: CHARACTERS.marisol, text: 'My ledger. And every name in it owes me again. You are earning your keep, cousin of Dario.' },
          ]);
        }
      }
    },
  },
  {
    title: 'The Big Bye',
    intro: [
      { who: CHARACTERS.dario, text: 'I am leaving Coral Bay tonight, cousin, and not by choice. The boat at South Pier will not wait.' },
      { who: CHARACTERS.dario, text: 'There is a Vireo GT downtown with my name on it. Take it, fetch me from the boardwalk, and drive like the city is ending.' },
      { who: CHARACTERS.you, text: 'One quiet week. That is all I asked for.' },
    ],
    start(world) {
      const car = spawnMissionCar(world, 1706, 700, 0, 'sport', '#27c4d8');
      world.mission.carRef = car;
      world.mission.stage = 0;
      setObjective(world, 'Take the teal Vireo GT downtown', car);
    },
    update(world, dt) {
      const m = world.mission;
      const L = world.city.locations;
      const car = m.carRef;
      if (!car || car.dead) return failMission(world, 'the car is wrecked');
      if (m.stage === 0) {
        setObjective(world, 'Take the teal Vireo GT downtown', car);
        if (world.player.car === car) {
          m.stage = 1;
          addMessage(world, 'Wheels up. Get Dario from the boardwalk.', '#ffd166');
        }
      } else if (m.stage === 1) {
        setObjective(world, 'Pick up Dario at the boardwalk', L.boardwalk);
        if (world.player.car === car && at(world, L.boardwalk, 100)) {
          m.stage = 2;
          m.timer = 170;
          const dario = spawnPed(world, L.boardwalk.x, L.boardwalk.y, { state: 'passenger' });
          dario.car = car;
          dario.shirt = '#f2b63c';
          m.dario = dario;
          world.wanted.heat = Math.max(world.wanted.heat, 10.2);
          world.wanted.stars = starsForHeat(world.wanted.heat);
          addMessage(world, "Dario's in — and half the CBPD is behind you!", '#ff8a7a');
        }
      } else if (m.stage === 2) {
        m.timer -= dt;
        setObjective(world, `Get Dario to South Pier — ${Math.max(0, Math.ceil(m.timer))}s`, L.pier);
        if (m.timer <= 0) {
          if (m.dario) {
            m.dario.state = 'walk';
            m.dario.car = null;
          }
          return failMission(world, 'the boat left without him');
        }
        if (world.player.car === car && at(world, L.pier, 110)) {
          car.mission = false;
          if (m.dario) {
            m.dario.state = 'walk';
            m.dario.car = null;
            m.dario.x = L.pier.x;
            m.dario.y = L.pier.y - 30;
          }
          clearWanted(world);
          world.storyDone = true;
          completeMission(world, 2000, [
            { who: CHARACTERS.dario, text: 'You drive like a rumour, cousin. Coral Bay is yours now. Try not to burn it down.' },
            { who: CHARACTERS.marisol, text: 'He made it. The café, the docks, the whole bay will remember who got him out. Welcome home.' },
          ]);
          addMessage(world, 'STORY COMPLETE — Coral Bay is yours. Fares and trouble still pay.', '#3fb68b');
        }
      }
    },
  },
];

function startStoryMission(world) {
  const def = STORY[world.storyIndex];
  if (!def) return;
  world.mission = { index: world.storyIndex, title: def.title, stage: 0, timer: null, carRef: null, hostiles: null, dario: null };
  say(world, def.intro);
  def.start(world);
  addMessage(world, `Mission: ${def.title}`, '#ffd166');
}

/** Start a story mission directly (used by the screenshot scenes). */
export function beginStory(world, index) {
  world.storyIndex = index;
  startStoryMission(world);
}

// ---------------------------------------------------------------- taxi

/** Flag a nearby walker as a fare, or place one on a sidewalk close by. */
function offerFare(world) {
  const p = world.player;
  let ped = world.peds.find((pd) => pd.state === 'walk' && distance(pd.x, pd.y, p.x, p.y) < 700);
  if (!ped) {
    const a = world.rng.range(0, Math.PI * 2);
    ped = spawnPed(world, p.x + Math.cos(a) * 420, p.y + Math.sin(a) * 320);
    ped.block = null;
  }
  const dests = Object.values(world.city.locations);
  const dest = dests[world.rng.int(0, dests.length - 1)];
  ped.state = 'fare-wait';
  ped.fare = { dest: { x: dest.x, y: dest.y, label: dest.short } };
  world.taxi = { ped, stage: 'pickup', dest: ped.fare.dest, t: 0, dist: 0, parTime: 0 };
  addMessage(world, 'A fare is waiting — stop your car beside the ! marker', '#ffd166');
}

function cancelTaxi(world) {
  const t = world.taxi;
  if (!t) return;
  if (t.ped) {
    if (t.ped.state === 'passenger') {
      t.ped.state = 'walk';
      t.ped.x = world.player.x + 30;
      t.ped.y = world.player.y + 10;
    } else if (t.ped.state === 'fare-wait') {
      t.ped.state = 'walk';
    }
    t.ped.fare = null;
    t.ped.car = null;
    t.ped.block = null;
  }
  world.taxi = null;
}

function updateTaxi(world, dt) {
  const t = world.taxi;
  const p = world.player;
  if (!t) {
    world.fareCd = (world.fareCd ?? 6) - dt;
    if (world.fareCd <= 0 && !world.mission && world.rng.chance(0.5)) {
      world.fareCd = 16;
      offerFare(world);
    } else if (world.fareCd <= 0) {
      world.fareCd = 8;
    }
    return;
  }
  if (!t.ped || t.ped.state === 'down' || t.ped.state === 'gone') {
    world.taxi = null;
    return;
  }
  if (t.stage === 'pickup') {
    setObjective(world, 'Pick up the fare (stop your car beside them)', t.ped);
    if (p.car && Math.abs(p.car.speed) < 24 && distance(p.x, p.y, t.ped.x, t.ped.y) < 74) {
      // The fare hurries over and climbs in.
      t.ped.state = 'passenger';
      t.ped.car = p.car;
      t.stage = 'drive';
      t.dist = distance(p.x, p.y, t.dest.x, t.dest.y);
      t.parTime = (t.dist / 235) * 1.7;
      t.t = 0;
      world.audio.sounds.door();
      addMessage(world, `"${t.dest.label}, please — and step on it."`, '#b9e2ff');
    }
  } else {
    t.t += dt;
    setObjective(world, `Drive your fare to ${t.dest.label}`, t.dest);
    if (!p.car) {
      cancelTaxi(world);
      addMessage(world, 'Fare lost — they wanted a ride, not a walk.', '#ff8a7a');
      return;
    }
    if (distance(p.x, p.y, t.dest.x, t.dest.y) < 84 && Math.abs(p.car.speed) < 30) {
      const fare = Math.round(ECONOMY.taxiBase + t.dist * ECONOMY.taxiPerPixel);
      const tip = t.t < t.parTime * ECONOMY.taxiTipWindow * 2 ? Math.round(fare * 0.4) : 0;
      p.cash += fare + tip;
      world.stats.earned += fare + tip;
      world.stats.fares += 1;
      world.audio.sounds.cash();
      addMessage(world, tip > 0 ? `Fare $${fare} + $${tip} tip for speed!` : `Fare paid: $${fare}`, '#3fb68b');
      t.ped.state = 'walk';
      t.ped.car = null;
      t.ped.fare = null;
      t.ped.block = null;
      t.ped.x = t.dest.x + 24;
      t.ped.y = t.dest.y + 14;
      world.taxi = null;
      world.saveDirty = true;
    }
  }
}

// ---------------------------------------------------------------- shops

/** What the player can do where they stand; returns a prompt or null. */
function updateShops(world) {
  const p = world.player;
  const L = world.city.locations;
  world.prompt = null;
  if (p.car) {
    if (distance(p.x, p.y, L.respray.x, L.respray.y) < 92) {
      const cost = Math.max(40, world.wanted.stars * ECONOMY.resprayPerStar);
      world.prompt = `E — Respray & repair at Shine & Go ($${cost}, clears wanted)`;
      if (world.frameActions & ACT_INTERACT) {
        world.frameActions &= ~ACT_INTERACT;
        if (p.cash >= cost) {
          p.cash -= cost;
          p.car.health = p.car.maxHealth;
          p.car.dead = false;
          clearWanted(world);
          world.audio.sounds.jingle();
          addMessage(world, 'Fresh paint, clean plates. The heat forgets your face.', '#3fb68b');
          world.saveDirty = true;
        } else {
          addMessage(world, `Respray costs $${cost} — you are short.`, '#ff8a7a');
        }
      }
    }
    return;
  }
  if (distance(p.x, p.y, L.gunshop.x, L.gunshop.y) < 58) {
    world.prompt = 'E — Coral Arms: guns & armor';
    if (world.frameActions & ACT_INTERACT) {
      world.frameActions &= ~ACT_INTERACT;
      world.shop = 'gun';
      world.audio.ensure();
    }
  } else if (distance(p.x, p.y, L.cafe.x, L.cafe.y) < 74 && !world.mission && !world.storyDone && world.storyIndex < STORY.length) {
    world.prompt = `E — Talk to Marisol (${STORY[world.storyIndex].title})`;
    if (world.frameActions & ACT_INTERACT) {
      world.frameActions &= ~ACT_INTERACT;
      startStoryMission(world);
    }
  } else if (distance(p.x, p.y, L.hospital.x, L.hospital.y) < 70 && p.hp < 100) {
    world.prompt = 'E — Coral Bay General: patch up ($40)';
    if (world.frameActions & ACT_INTERACT) {
      world.frameActions &= ~ACT_INTERACT;
      if (p.cash >= 40) {
        p.cash -= 40;
        p.hp = 100;
        world.audio.sounds.pickup();
        addMessage(world, 'Patched up. Try to keep the blood inside this time.', '#3fb68b');
      } else {
        addMessage(world, 'The hospital wants $40 up front.', '#ff8a7a');
      }
    }
  }
}

/** Buy from the gun shop; called by the main loop while world.shop is open. */
export function shopBuy(world, item) {
  const p = world.player;
  if (item === 'pistol') {
    if (p.hasPistol) return 'You already carry a pistol.';
    if (p.cash < PISTOL.price) return `The pistol costs $${PISTOL.price}.`;
    p.cash -= PISTOL.price;
    p.hasPistol = true;
    p.ammoInMag = PISTOL.magazine;
    p.reserve += 24;
    p.weapon = 'pistol';
  } else if (item === 'ammo') {
    if (p.cash < PISTOL.ammoPrice) return `Ammo costs $${PISTOL.ammoPrice}.`;
    p.cash -= PISTOL.ammoPrice;
    p.reserve += PISTOL.ammoPack;
  } else if (item === 'armor') {
    if (p.cash < ARMOR_PRICE) return `Armor costs $${ARMOR_PRICE}.`;
    if (p.armor >= 100) return 'Your armor is already whole.';
    p.cash -= ARMOR_PRICE;
    p.armor = 100;
  } else {
    return '';
  }
  world.audio.sounds.cash();
  world.saveDirty = true;
  return 'Sold. Anything else?';
}

/** The hospital/station reset after a wasted or busted sequence. */
export function respawnPlayer(world) {
  const p = world.player;
  const over = world.over;
  const starsAtEnd = world.wanted.stars;
  world.over = null;
  if (world.mission) failMission(world, over && over.kind === 'busted' ? 'you got busted' : 'you ended up in hospital');
  if (world.taxi) cancelTaxi(world);
  clearWanted(world);
  p.hp = 100;
  p.bustedT = 0;
  p.car = null;
  if (over && over.kind === 'busted') {
    const fine = Math.min(p.cash, 150 + starsAtEnd * 50);
    p.cash -= fine;
    const st = world.city.locations.station;
    p.x = st.x;
    p.y = st.y + 30;
    addMessage(world, `Busted. The CBPD fine you $${fine} and take your morning.`, '#ff8a7a');
  } else {
    const fee = Math.min(p.cash, HOSPITAL_FEE + Math.round(p.cash * 0.05));
    p.cash -= fee;
    const h = world.city.locations.hospital;
    p.x = h.x;
    p.y = h.y + 30;
    addMessage(world, `Coral Bay General patches you up — $${fee} on the bill.`, '#ff8a7a');
  }
  world.camera.x = p.x;
  world.camera.y = p.y;
  world.saveDirty = true;
}

// ---------------------------------------------------------------- the update

/** One step of story, fares, shops and dialogue. Runs before the world step. */
export function updateMissions(world, input, dt) {
  world.frameClicked = input.takeClicks().length > 0;
  updateDialogue(world, dt);
  if (world.over) {
    world.objective = null;
    return;
  }
  if (world.mission) {
    const def = STORY[world.mission.index];
    if (def) def.update(world, dt);
  } else if (world.taxi) {
    updateTaxi(world, dt);
  } else {
    updateTaxi(world, dt);
    if (!world.objective || !world.mission) {
      if (world.storyIndex < STORY.length && !world.storyDone) {
        setObjective(world, `See Marisol at Café Azul — "${STORY[world.storyIndex].title}"`, world.city.locations.cafe);
      } else if (!world.taxi) {
        setObjective(world, 'Free roam — fares, drops and trouble all pay in Coral Bay', null);
      }
    }
  }
  updateShops(world);
}
