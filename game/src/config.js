// Every tuning number for Coral Heat in one place: the view, the city grid,
// movement, driving, combat, the wanted system and the economy. The renderer
// works in a fixed 1280x720 logical view and scales it to the window, so no
// rule below depends on the screen size.

export const VIEW = { width: 1280, height: 720 };

/** The simulation's fixed step, in seconds: 60 updates a second. */
export const STEP = 1 / 60;

/** The localStorage key the save game lives under. */
export const SAVE_KEY = 'coral-heat.save.v1';

// ------------------------------------------------------------------ city

/** Roads sit on a grid: vertical roads at x = GRID.x0 + i * GRID.pitch. */
export const GRID = {
  x0: 320,
  y0: 320,
  pitch: 430,
  cols: 7, // vertical roads
  rows: 6, // horizontal roads
  roadW: 124, // full asphalt width
  lane: 31, // lane centre offset from the road centre line
};

/** East of the last road: promenade, sand, then open water. */
export const BEACH = {
  promX: 3300, // boardwalk (promenade) west edge
  promW: 92, // boardwalk width
  sandX: 3392, // sand starts
  waterX: 3660, // water starts; solid to drive into, like a wall
};

/** World size in pixels; the water runs to the east edge. */
export const WORLD = { width: 4360, height: 3160 };

// ------------------------------------------------------------------ player

export const PLAYER = {
  radius: 15,
  walkSpeed: 168,
  sprintSpeed: 268,
  health: 100,
  punchRange: 52,
  punchDamage: 34,
  punchCooldown: 0.34,
  enterRange: 64, // how close to a car door F works
  bustedTime: 2.6, // seconds a cop must stay close, on foot, to bust you
};

// ------------------------------------------------------------------ cars

export const CAR = {
  length: 54,
  width: 27,
  radius: 27, // collision circle
  accel: 340,
  brake: 520,
  reverseMax: 120,
  drag: 0.55,
  gripTurn: 2.6, // steering rate at speed, rad/s
  health: 100,
  ramDamage: 9, // damage a hit at speed does to the other car
};

export const CAR_TYPES = {
  sedan: { name: 'Marlin Sedan', topSpeed: 305, accel: 330, turn: 2.6, health: 100 },
  compact: { name: 'Pico Hatch', topSpeed: 262, accel: 300, turn: 2.9, health: 85 },
  muscle: { name: 'Barracuda V8', topSpeed: 368, accel: 430, turn: 2.3, health: 110 },
  van: { name: 'Cargo Van', topSpeed: 238, accel: 260, turn: 2.1, health: 140 },
  taxi: { name: 'Coral Cab', topSpeed: 292, accel: 320, turn: 2.6, health: 100 },
  police: { name: 'CBPD Interceptor', topSpeed: 352, accel: 410, turn: 2.8, health: 130 },
  sport: { name: 'Vireo GT', topSpeed: 415, accel: 480, turn: 2.7, health: 90 },
};

export const CAR_COLORS = ['#d94f3d', '#3d7bd9', '#e8b93c', '#53b06a', '#e6e3da', '#7a4fd0', '#e2703a', '#39b8c4', '#c94f7c', '#5a6270'];

// ------------------------------------------------------------------ combat

export const PISTOL = {
  damage: 34,
  range: 460,
  cooldown: 0.24,
  magazine: 12,
  reloadTime: 1.1,
  spread: 0.035,
  price: 250,
  ammoPrice: 40,
  ammoPack: 36,
};

export const ARMOR_PRICE = 150;
export const HOSPITAL_FEE = 120;

// ------------------------------------------------------------------ wanted

export const WANTED = {
  /** Heat points that make each star: stars = how many thresholds are passed. */
  thresholds: [1, 3, 6, 10, 15],
  crime: {
    carTheft: 1.2,
    assault: 1.0, // punching a pedestrian
    pedHit: 1.6, // running someone over
    pedKill: 2.2,
    gunshot: 1.1,
    copCarHit: 1.8,
    copKill: 3.0,
    property: 0.5, // smashing a prop / light shunt
  },
  decayPerSecond: 0.16, // heat lost while no police eyes are on you
  decayDelay: 7, // unseen seconds before decay starts
  seenRange: 430, // a cop car inside this range counts as eyes on you
};

// ------------------------------------------------------------------ economy

export const ECONOMY = {
  startCash: 120,
  resprayPerStar: 110,
  taxiBase: 14,
  taxiPerPixel: 0.055,
  taxiTipWindow: 0.5, // arrive within this fraction of par time for a tip
};

// ------------------------------------------------------------------ clock

export const CLOCK = {
  startMinutes: 9 * 60 + 20, // a new game begins mid-morning
  minutesPerSecond: 0.55, // game minutes per real second
};

// ------------------------------------------------------------------ palette

export const PALETTE = {
  asphalt: '#3c4149',
  asphaltDark: '#343943',
  laneMark: '#d8d4c4',
  sidewalk: '#9aa0a3',
  sidewalkEdge: '#7e858a',
  grass: '#57a05a',
  grassDark: '#4c9153',
  sand: '#ecd28f',
  boardwalk: '#b08954',
  boardwalkDark: '#9a7745',
  water: '#1d7f9e',
  waterDeep: '#166a86',
  waterFoam: '#bfeef2',
  crosswalk: '#e8e6da',
  lightRed: '#e5484d',
  lightAmber: '#f5a524',
  lightGreen: '#3fb68b',
  hudPanel: 'rgba(10, 16, 26, 0.62)',
  hudText: '#f4f1e6',
  hudMuted: '#b9c2cc',
  accent: '#ffb03a',
  danger: '#e5484d',
  good: '#3fb68b',
};

export const FONT = '"Segoe UI", system-ui, -apple-system, sans-serif';
