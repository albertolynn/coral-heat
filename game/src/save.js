// The save game: cash, the pistol and its ammo, armor, story progress and
// lifetime stats, kept in localStorage. Saving happens when something worth
// keeping changes (a mission done, a purchase, a fare, a respawn); loading
// happens once at boot for the Continue button. Storage may be unavailable
// (private windows) — every access is guarded and failure just means the
// game runs unsaved.
import { SAVE_KEY } from './config.js';

/** Read the stored save, or null when there is none worth continuing. */
export function loadSave() {
  try {
    const raw = window.localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (typeof data !== 'object' || data === null || typeof data.cash !== 'number') return null;
    return data;
  } catch {
    return null;
  }
}

/** Write the player's progress out of the world state. */
export function storeSave(world) {
  try {
    const p = world.player;
    const data = {
      cash: p.cash,
      hasPistol: p.hasPistol,
      ammoInMag: p.ammoInMag,
      reserve: p.reserve,
      armor: p.armor,
      storyIndex: world.storyIndex,
      storyDone: world.storyDone,
      stats: world.stats,
      clockMinutes: world.clockMinutes,
    };
    window.localStorage.setItem(SAVE_KEY, JSON.stringify(data));
  } catch {
    // Unsaved this time; the game goes on.
  }
}

/** Apply a loaded save to a fresh world (the player starts at the café). */
export function applySave(world, data) {
  const p = world.player;
  p.cash = data.cash;
  p.hasPistol = !!data.hasPistol;
  p.ammoInMag = data.ammoInMag ?? 0;
  p.reserve = data.reserve ?? 0;
  p.armor = data.armor ?? 0;
  if (p.hasPistol) p.weapon = 'pistol';
  world.storyIndex = data.storyIndex ?? 0;
  world.storyDone = !!data.storyDone;
  if (data.stats) world.stats = data.stats;
  if (typeof data.clockMinutes === 'number') world.clockMinutes = data.clockMinutes;
}

/** Forget the save (New Game). */
export function clearSave() {
  try {
    window.localStorage.removeItem(SAVE_KEY);
  } catch {
    // Nothing to forget.
  }
}
