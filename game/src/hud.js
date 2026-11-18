// Everything drawn over the world: the HUD (health, armor, cash, stars,
// clock, weapon), the objective line, the message feed, the minimap, the
// dialogue box, the shop and pause panels, the wasted/busted overlay and
// the title screen. Menus report clicks and keys back as action strings.
import { ARMOR_PRICE, FONT, PALETTE, PISTOL, PLAYER, VIEW } from './config.js';
import { ACT_CONFIRM } from './input.js';

const GOLD = '#ffb03a';
const INK = '#0d1420';

function star(ctx, cx, cy, r, filled) {
  ctx.beginPath();
  for (let i = 0; i < 10; i += 1) {
    const rad = i % 2 === 0 ? r : r * 0.45;
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const x = cx + Math.cos(a) * rad;
    const y = cy + Math.sin(a) * rad;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
  if (filled) {
    ctx.fillStyle = GOLD;
    ctx.fill();
  }
  ctx.strokeStyle = filled ? '#a86e14' : 'rgba(244,241,230,0.5)';
  ctx.lineWidth = 1.4;
  ctx.stroke();
}

function bar(ctx, rr, x, y, w, h, ratio, color, label) {
  ctx.fillStyle = 'rgba(8, 12, 20, 0.66)';
  rr(x - 3, y - 3, w + 6, h + 6, 6);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.14)';
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = color;
  ctx.fillRect(x, y, w * Math.max(0, Math.min(1, ratio)), h);
  ctx.font = `700 10.5px ${FONT}`;
  ctx.fillStyle = '#f4f1e6';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, x + 5, y + h / 2 + 0.5);
}

function wrapText(ctx, value, maxWidth) {
  const words = value.split(' ');
  const lines = [];
  let line = '';
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line);
      line = word;
    } else {
      line = test;
    }
  }
  if (line) lines.push(line);
  return lines;
}

export function createHud(renderer) {
  const { ctx } = renderer;
  const rr = (x, y, w, h, r) => renderer.roundRect(x, y, w, h, r);
  const text = (value, x, y, size, color, align = 'left', weight = 600) => renderer.text(value, x, y, size, color, align, weight);

  // ------------------------------------------------------------ minimap

  function drawMinimap(world) {
    const W = 196;
    const H = 148;
    const x0 = 16;
    const y0 = VIEW.height - H - 16;
    const city = world.city;
    const sx = W / city.width;
    const sy = H / city.height;
    ctx.fillStyle = 'rgba(8, 14, 22, 0.78)';
    rr(x0 - 4, y0 - 4, W + 8, H + 8, 9);
    ctx.fill();
    ctx.fillStyle = '#274b3a';
    ctx.fillRect(x0, y0, W, H);
    ctx.fillStyle = '#166a86';
    ctx.fillRect(x0 + 3660 * sx, y0, W - 3660 * sx, H);
    ctx.strokeStyle = 'rgba(230, 235, 240, 0.5)';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    for (const x of city.roadsV) {
      ctx.moveTo(x0 + x * sx, y0);
      ctx.lineTo(x0 + x * sx, y0 + H);
    }
    for (const y of city.roadsH) {
      ctx.moveTo(x0, y0 + y * sy);
      ctx.lineTo(x0 + 3300 * sx, y0 + y * sy);
    }
    ctx.stroke();
    // Police blips.
    const flash = Math.floor(world.time * 2.4) % 2 === 0;
    for (const car of world.cars) {
      if (car.mode !== 'police') continue;
      ctx.fillStyle = flash ? '#ff5040' : '#4066ff';
      ctx.beginPath();
      ctx.arc(x0 + car.x * sx, y0 + car.y * sy, 3, 0, Math.PI * 2);
      ctx.fill();
    }
    // Objective marker.
    const obj = world.objective;
    if (obj && obj.marker) {
      ctx.fillStyle = GOLD;
      ctx.beginPath();
      ctx.arc(x0 + obj.marker.x * sx, y0 + obj.marker.y * sy, 4.4 + Math.sin(world.time * 5) * 1.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#14161a';
      ctx.lineWidth = 1.2;
      ctx.stroke();
    }
    // Player arrow.
    const p = world.player;
    const px = x0 + p.x * sx;
    const py = y0 + p.y * sy;
    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(p.angle);
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(6.4, 0);
    ctx.lineTo(-4.4, -4);
    ctx.lineTo(-4.4, 4);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    text('CORAL BAY', x0 + 4, y0 + H + 15, 9.5, 'rgba(244,241,230,0.65)', 'left', 700);
  }

  // ------------------------------------------------------------ HUD

  function drawHud(world) {
    const p = world.player;
    bar(ctx, rr, 18, 16, 178, 15, p.hp / 100, p.hp > 30 ? '#3fb68b' : '#e5484d', 'HEALTH');
    bar(ctx, rr, 18, 40, 178, 12, p.armor / 100, '#7ab5e8', 'ARMOR');
    if (p.car) bar(ctx, rr, 18, 61, 178, 12, p.car.health / p.car.maxHealth, '#ffb03a', p.car.name.toUpperCase());
    // Cash, clock and stars, top right.
    ctx.textAlign = 'right';
    text(`$${p.cash}`, VIEW.width - 20, 26, 27, '#ffe066', 'right', 800);
    const hh = Math.floor(world.clockMinutes / 60);
    const mm = Math.floor(world.clockMinutes % 60);
    text(`${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`, VIEW.width - 20, 52, 15, PALETTE.hudText, 'right', 700);
    for (let i = 0; i < 5; i += 1) star(ctx, VIEW.width - 138 + i * 27, 78, 11.5, i < world.wanted.stars);
    if (world.wanted.stars > 0 && world.wanted.unseen > 7) {
      text('LOSING THEM…', VIEW.width - 20, 100, 11.5, '#3fb68b', 'right', 700);
    }
    // Weapon, bottom right.
    ctx.fillStyle = PALETTE.hudPanel;
    rr(VIEW.width - 216, VIEW.height - 58, 198, 42, 8);
    ctx.fill();
    if (p.weapon === 'pistol' && p.hasPistol) {
      text('PISTOL', VIEW.width - 200, VIEW.height - 37, 15, PALETTE.hudText, 'left', 800);
      text(p.reloadT > 0 ? 'RELOADING…' : `${p.ammoInMag} / ${p.reserve}`, VIEW.width - 34, VIEW.height - 37, 15, p.ammoInMag === 0 ? '#ff8a7a' : '#ffe066', 'right', 800);
    } else {
      text('FISTS', VIEW.width - 200, VIEW.height - 37, 15, PALETTE.hudText, 'left', 800);
      text(p.hasPistol ? 'press 2 for pistol' : '', VIEW.width - 34, VIEW.height - 37, 11, PALETTE.hudMuted, 'right', 600);
    }
    // Objective, top centre.
    if (world.objective) {
      ctx.font = `700 15.5px ${FONT}`;
      const w = ctx.measureText(world.objective.text).width + 52;
      ctx.fillStyle = PALETTE.hudPanel;
      rr(VIEW.width / 2 - w / 2, 14, w, 34, 17);
      ctx.fill();
      text('◆', VIEW.width / 2 - w / 2 + 24, 31, 13, GOLD, 'center', 800);
      text(world.objective.text, VIEW.width / 2 - w / 2 + 40, 31.5, 15.5, PALETTE.hudText, 'left', 700);
    }
    // Message feed.
    let my = 92;
    for (const m of world.messages) {
      const age = world.time - m.t;
      ctx.globalAlpha = age > 3.6 ? Math.max(0, 1 - (age - 3.6) / 0.9) : 1;
      text(m.text, 20, my, 14.5, m.color, 'left', 650);
      my += 21;
    }
    ctx.globalAlpha = 1;
    // Interaction prompt.
    if (world.prompt && !world.dialogue) {
      ctx.font = `700 15px ${FONT}`;
      const w = ctx.measureText(world.prompt).width + 36;
      ctx.fillStyle = 'rgba(13, 20, 32, 0.85)';
      rr(VIEW.width / 2 - w / 2, VIEW.height - 118, w, 34, 17);
      ctx.fill();
      text(world.prompt, VIEW.width / 2, VIEW.height - 100.5, 15, '#ffe9b0', 'center', 700);
    }
    // Busted meter.
    if (p.bustedT > 0.08 && !world.over) {
      const w = 240;
      ctx.fillStyle = 'rgba(13, 20, 32, 0.8)';
      rr(VIEW.width / 2 - w / 2, 120, w, 26, 13);
      ctx.fill();
      ctx.fillStyle = '#e5484d';
      rr(VIEW.width / 2 - w / 2 + 4, 124, (w - 8) * Math.min(1, p.bustedT / PLAYER.bustedTime), 18, 9);
      ctx.fill();
      text('BUSTED?', VIEW.width / 2, 133.5, 13, '#ffffff', 'center', 800);
    }
    drawMinimap(world);
    drawDialogue(world);
  }

  function drawDialogue(world) {
    const d = world.dialogue;
    if (!d) return;
    const line = d.lines[d.i];
    if (!line) return;
    ctx.font = `600 16.5px ${FONT}`;
    const lines = wrapText(ctx, line.text, 900);
    const h = 62 + lines.length * 23;
    const y0 = VIEW.height - h - 18;
    ctx.fillStyle = 'rgba(10, 15, 24, 0.88)';
    rr(150, y0, VIEW.width - 300, h, 12);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255, 176, 58, 0.5)';
    ctx.lineWidth = 1.4;
    rr(150, y0, VIEW.width - 300, h, 12);
    ctx.stroke();
    const colors = { 'Marisol Vega': GOLD, 'Dario (cousin)': '#7ad0ff', You: '#2ec4b6' };
    text(line.who.toUpperCase(), 172, y0 + 21, 12.5, colors[line.who] ?? '#ffb03a', 'left', 800);
    ctx.fillStyle = PALETTE.hudText;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.font = `600 16.5px ${FONT}`;
    lines.forEach((l, i) => ctx.fillText(l, 172, y0 + 46 + i * 23));
    text('E ▸', VIEW.width - 172, y0 + h - 16, 12, PALETTE.hudMuted, 'right', 700);
  }

  // ------------------------------------------------------------ overlays

  function drawOver(world) {
    const kind = world.over.kind;
    ctx.fillStyle = kind === 'wasted' ? 'rgba(90, 6, 10, 0.45)' : 'rgba(10, 16, 60, 0.45)';
    ctx.fillRect(0, 0, VIEW.width, VIEW.height);
    text(kind === 'wasted' ? 'WASTED' : 'BUSTED', VIEW.width / 2, VIEW.height / 2 - 16, 84, kind === 'wasted' ? '#ff5040' : '#7ab5e8', 'center', 900);
    text(kind === 'wasted' ? 'Coral Bay General is on its way…' : 'The CBPD thanks you for stopping.', VIEW.width / 2, VIEW.height / 2 + 34, 17, PALETTE.hudText, 'center', 600);
  }

  function panel(x, y, w, h) {
    ctx.fillStyle = 'rgba(10, 15, 24, 0.92)';
    rr(x, y, w, h, 14);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255, 176, 58, 0.45)';
    ctx.lineWidth = 1.6;
    rr(x, y, w, h, 14);
    ctx.stroke();
  }

  /** A clickable menu; returns the clicked item id, or handles hover glow. */
  function menu(items, cx, y0, mouse, clicks, selected) {
    let action = null;
    items.forEach((item, i) => {
      const w = 340;
      const h = 46;
      const x = cx - w / 2;
      const y = y0 + i * 58;
      const hover = mouse.x >= x && mouse.x <= x + w && mouse.y >= y && mouse.y <= y + h;
      ctx.fillStyle = hover || selected === i ? 'rgba(255, 176, 58, 0.92)' : 'rgba(16, 24, 38, 0.88)';
      rr(x, y, w, h, 10);
      ctx.fill();
      text(item.label, cx, y + h / 2 + 1, 18, hover || selected === i ? INK : PALETTE.hudText, 'center', 800);
      if (hover && clicks.length > 0) action = item.id;
    });
    return action;
  }

  // ------------------------------------------------------------ screens

  function drawTitle(world, ui, input, clicks) {
    // Sunset sky, skyline, palms and water — the postcard of Coral Bay.
    const grad = ctx.createLinearGradient(0, 0, 0, VIEW.height);
    grad.addColorStop(0, '#2b1055');
    grad.addColorStop(0.42, '#7a4a8c');
    grad.addColorStop(0.68, '#e2703a');
    grad.addColorStop(0.8, '#ffb03a');
    grad.addColorStop(0.81, '#166a86');
    grad.addColorStop(1, '#0d4a63');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, VIEW.width, VIEW.height);
    ctx.fillStyle = '#ffe9a8';
    ctx.beginPath();
    ctx.arc(880, 512, 54, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255, 233, 168, 0.35)';
    ctx.beginPath();
    ctx.arc(880, 512, 84, 0, Math.PI * 2);
    ctx.fill();
    // Skyline silhouettes, two depths, deterministic by index.
    const towers = [[30, 300, 90], [130, 240, 70], [215, 330, 110], [335, 270, 64], [410, 360, 96], [520, 250, 74], [600, 320, 88], [700, 280, 60], [960, 300, 92], [1060, 250, 68], [1140, 340, 104], [1250, 270, 60]];
    ctx.fillStyle = '#3a2350';
    for (const [x, h, w] of towers) ctx.fillRect(x, 584 - h, w, h);
    ctx.fillStyle = '#241536';
    for (const [x, h, w] of towers) ctx.fillRect(x + 14, 584 - h * 0.72, w * 0.8, h * 0.72);
    ctx.fillStyle = 'rgba(255, 214, 120, 0.85)';
    for (let i = 0; i < towers.length; i += 1) {
      const [x, h, w] = towers[i];
      for (let wy = 584 - h + 16; wy < 560; wy += 26) {
        for (let wx = x + 10; wx < x + w - 12; wx += 19) {
          if ((wx * 7 + wy * 13) % 5 < 2) ctx.fillRect(wx, wy, 7, 10);
        }
      }
    }
    // Palm silhouettes.
    ctx.strokeStyle = '#1c0f2e';
    ctx.lineWidth = 7;
    for (const [px, ph] of [[90, 130], [1180, 150]]) {
      ctx.beginPath();
      ctx.moveTo(px, 590);
      ctx.quadraticCurveTo(px + 12, 590 - ph * 0.6, px + 26, 590 - ph);
      ctx.stroke();
      ctx.lineWidth = 5;
      for (let i = 0; i < 6; i += 1) {
        const a = Math.PI * (0.95 + i * 0.22);
        ctx.beginPath();
        ctx.moveTo(px + 26, 590 - ph);
        ctx.quadraticCurveTo(px + 26 + Math.cos(a) * 30, 590 - ph + Math.sin(a) * 26 - 8, px + 26 + Math.cos(a) * 52, 590 - ph + Math.sin(a) * 40 + 14);
        ctx.stroke();
      }
      ctx.lineWidth = 7;
    }
    // Title.
    ctx.textAlign = 'center';
    ctx.font = `900 108px ${FONT}`;
    ctx.fillStyle = 'rgba(20, 8, 30, 0.55)';
    ctx.fillText('CORAL HEAT', VIEW.width / 2 + 5, 168 + 5);
    const tg = ctx.createLinearGradient(0, 90, 0, 190);
    tg.addColorStop(0, '#fff3b0');
    tg.addColorStop(0.55, '#ffb03a');
    tg.addColorStop(1, '#e2703a');
    ctx.fillStyle = tg;
    ctx.fillText('CORAL HEAT', VIEW.width / 2, 168);
    text('a Coral Bay story of family, favours and very fast cars', VIEW.width / 2, 224, 17.5, '#ffe9d0', 'center', 600);
    const items = [{ id: 'new', label: 'NEW GAME' }];
    if (ui.hasSave) items.push({ id: 'continue', label: 'CONTINUE' });
    items.push({ id: 'help', label: 'HOW TO PLAY' });
    const action = menu(items, VIEW.width / 2, 292, input.mouse(), clicks, ui.menuIndex);
    text('WASD drive & walk · mouse aim · F enter car · E talk & use · M mute', VIEW.width / 2, 640, 13.5, 'rgba(255, 240, 214, 0.8)', 'center', 600);
    text('An original game: every street, name and note of music made for Coral Bay.', VIEW.width / 2, 664, 12, 'rgba(255, 240, 214, 0.55)', 'center', 500);
    return action;
  }

  const HELP_LINES = [
    ['Walk / drive', 'W A S D or arrow keys · Shift sprint'],
    ['Enter / exit a car', 'F (any car — occupied ones get donated)'],
    ['Aim & fight', 'Mouse aims · click punches, or shoots with the pistol out'],
    ['Weapons', '1 fists · 2 pistol · R reload · Q swap'],
    ['Talk, shop, use', 'E at the café, Coral Arms, the respray, fares'],
    ['Handbrake', 'Space while driving — drift the corners'],
    ['Pause', 'Esc or P · Mute: M'],
    ['', ''],
    ['The bay', 'Stars mean the CBPD is coming. Lose their eyes and the heat cools.'],
    ['', 'A respray at Shine & Go wipes the slate — for cash.'],
    ['', 'Fares ( ! ) pay by distance, with a tip for speed.'],
  ];

  function drawHelp(ui, input, clicks) {
    ctx.fillStyle = 'rgba(6, 9, 16, 0.72)';
    ctx.fillRect(0, 0, VIEW.width, VIEW.height);
    panel(240, 92, 800, 520);
    text('HOW TO PLAY', VIEW.width / 2, 138, 30, GOLD, 'center', 900);
    HELP_LINES.forEach(([k, v], i) => {
      const y = 186 + i * 33;
      if (k) text(k, 300, y, 15.5, '#ffe9b0', 'left', 750);
      text(v, k ? 470 : 300, y, 15, PALETTE.hudText, 'left', 550);
    });
    return menu([{ id: 'back', label: 'BACK' }], VIEW.width / 2, 540, input.mouse(), clicks, 0);
  }

  function drawPause(world, ui, input, clicks) {
    ctx.fillStyle = 'rgba(6, 9, 16, 0.6)';
    ctx.fillRect(0, 0, VIEW.width, VIEW.height);
    panel(430, 168, 420, 400);
    text('PAUSED', VIEW.width / 2, 222, 32, GOLD, 'center', 900);
    const s = world.stats;
    text(`Earned $${s.earned} · ${s.fares} fares · ${s.carsStolen} cars borrowed`, VIEW.width / 2, 258, 13.5, PALETTE.hudMuted, 'center', 600);
    text(world.storyDone ? 'Story complete — the bay is yours' : `Story: ${world.storyIndex} of 5 jobs done`, VIEW.width / 2, 282, 13.5, PALETTE.hudMuted, 'center', 600);
    return menu([
      { id: 'resume', label: 'RESUME' },
      { id: 'help', label: 'HOW TO PLAY' },
      { id: 'title', label: 'QUIT TO TITLE' },
    ], VIEW.width / 2, 316, input.mouse(), clicks, ui.menuIndex);
  }

  function drawShop(world, ui, input, clicks) {
    ctx.fillStyle = 'rgba(6, 9, 16, 0.55)';
    ctx.fillRect(0, 0, VIEW.width, VIEW.height);
    panel(360, 150, 560, 420);
    text('CORAL ARMS', VIEW.width / 2, 200, 30, GOLD, 'center', 900);
    text('"Guns, armor, and no questions."', VIEW.width / 2, 232, 14, PALETTE.hudMuted, 'center', 550);
    text(`Cash: $${world.player.cash}`, VIEW.width / 2, 262, 16, '#ffe066', 'center', 800);
    const items = [
      { id: 'buy:pistol', label: world.player.hasPistol ? 'PISTOL — owned' : `PISTOL — $${PISTOL.price}` },
      { id: 'buy:ammo', label: `AMMO x${PISTOL.ammoPack} — $${PISTOL.ammoPrice}  (have ${world.player.reserve})` },
      { id: 'buy:armor', label: `BODY ARMOR — $${ARMOR_PRICE}  (at ${Math.round(world.player.armor)}%)` },
      { id: 'close-shop', label: 'LEAVE (Esc)' },
    ];
    const action = menu(items, VIEW.width / 2, 292, input.mouse(), clicks, ui.menuIndex);
    if (ui.shopMsg) text(ui.shopMsg, VIEW.width / 2, 292 + items.length * 58 + 8, 14.5, '#ffe9b0', 'center', 650);
    text('Click an item, or press 1–4', VIEW.width / 2, 548, 12, PALETTE.hudMuted, 'center', 550);
    return action;
  }

  /** Draw whichever top layer the screen needs; returns a menu action or null. */
  function draw(world, ui, input, clicks, actions) {
    renderer.setScreenTransform();
    let action = null;
    if (ui.screen === 'title') action = drawTitle(world, ui, input, clicks);
    else {
      drawHud(world);
      if (world.over) drawOver(world);
      if (ui.screen === 'paused') action = drawPause(world, ui, input, clicks);
      else if (ui.screen === 'help') action = drawHelp(ui, input, clicks);
      else if (ui.screen === 'shop') action = drawShop(world, ui, input, clicks);
    }
    if (action === null && (actions & ACT_CONFIRM)) {
      // Enter/Space activates the highlighted menu item on menu screens.
      const lists = {
        title: ui.hasSave ? ['new', 'continue', 'help'] : ['new', 'help'],
        paused: ['resume', 'help', 'title'],
        help: ['back'],
        shop: ['buy:pistol', 'buy:ammo', 'buy:armor', 'close-shop'],
      };
      const list = lists[ui.screen];
      if (list) action = list[Math.min(ui.menuIndex, list.length - 1)];
    }
    return action;
  }

  return { draw, drawHud };
}
