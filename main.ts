// Coral Heat — entry program for the make.fun gta6-01 bounty (Node 22,
// standard library only). The game itself is the static site in game/:
// index.html plus its ES modules, no build step, no network. This program
// hands it in: it copies game/ and screenshots/ into the output directory
// and writes dossier.json there with the vendored make.fun library, so the
// dossier is byte for byte the one the scorer rebuilds from the same files.
//
// Run it the way the grader does, with MAKEFUN_OUTPUT_DIR standing in for
// /output outside the grader's container:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
// Play the game locally with:  node serve.ts   (then open the printed URL)

import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const root = fileURLToPath(new URL('.', import.meta.url));
const outDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

// Start from an empty output so a stale file can never leak into an entry,
// then lay down the game and the screenshots exactly as they are committed.
rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });
cpSync(join(root, 'game'), join(outDir, 'game'), { recursive: true });
if (existsSync(join(root, 'screenshots'))) {
  cpSync(join(root, 'screenshots'), join(outDir, 'screenshots'), { recursive: true });
}

// The caps are the scorer's own: at most 4 screenshots of 256 KiB, at most
// 993 entries and 48 MiB under game/, no game path over 1000 bytes, and the
// dossier text capped at 160 KiB. Passing them here means a tree the scorer
// would refuse fails this program first, on my machine instead of theirs.
const dossier = buildDossier(outDir, {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
  game_path_max_bytes: 1000,
});
writeFileSync(join(outDir, 'dossier.json'), dossier);
