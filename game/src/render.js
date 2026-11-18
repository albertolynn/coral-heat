// Drawing the world: Coral Bay from above — roads and crosswalks, art-deco
// downtown, suburbs, the park, the docks, the boardwalk and the animated
// water — then cars, walkers, effects, and the day-night tint with lamps
// and headlights after dark. Everything is drawn in code; there are no
// image assets. The view is the fixed 1280x720 logical frame, scaled to
// the window, with the camera at its centre.
import { BEACH, CAR, FONT, GRID, PALETTE, VIEW } from './config.js';
import { DISTRICT, lightPhase } from './city.js';
import { clamp } from './rng.js';

export const SCREEN_TITLE = 'title';
export const SCREEN_PLAY = 'play';
export const SCREEN_PAUSED = 'paused';
export const SCREEN_OVER = 'over';

/** How dark the world is at a clock time, plus the warm tint of low sun. */
export function dayPhase(minutes) {
  const h = minutes / 60;
  let dark = 0;
  let warm = 0;
  if (h < 5) dark = 0.82;
  else if (h < 7) {
    dark = 0.82 - ((h - 5) / 2) * 0.7;
    warm = 0.5;
  } else if (h < 16.5) dark = 0.06;
  else if (h < 19.5) {
    const t = (h - 16.5) / 3;
    dark = 0.06 + t * 0.76;
    warm = Math.sin(t * Math.PI) * 0.9;
  } else dark = 0.82;
  return { dark, warm };
}

export function createRenderer(canvas) {
  const ctx = canvas.getContext('2d');

  function resize() {
    const ratio = Math.min(window.devicePixelRatio || 1, 1.5);
    canvas.width = Math.round(window.innerWidth * ratio);
    canvas.height = Math.round(window.innerHeight * ratio);
  }
  resize();
  window.addEventListener('resize', resize);

  /** Set the transform so drawing happens in 1280x720 logical pixels. */
  function setScreenTransform() {
    ctx.setTransform(canvas.width / VIEW.width, 0, 0, canvas.height / VIEW.height, 0, 0);
  }

  function text(value, x, y, size, color, align = 'center', weight = 600) {
    ctx.font = `${weight} ${size}px ${FONT}`;
    ctx.fillStyle = color;
    ctx.textAlign = align;
    ctx.textBaseline = 'middle';
    ctx.fillText(value, x, y);
  }

  function roundRect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  // ------------------------------------------------------------ ground

  function drawGround(world, view) {
    const city = world.city;
    // Water under everything; land drawn over it.
    ctx.fillStyle = PALETTE.waterDeep;
    ctx.fillRect(view.x, view.y, view.w, view.h);
    ctx.fillStyle = '#6f9e5f';
    ctx.fillRect(0, 0, BEACH.waterX, city.height);
    // Blocks: sidewalk rim, then the district ground inside.
    for (const b of city.blocks) {
      if (!inView(b.x, b.y, b.w, b.h, view)) continue;
      ctx.fillStyle = PALETTE.sidewalk;
      ctx.fillRect(b.x, b.y, b.w, b.h);
      let ground = '#8f959a';
      if (b.district === DISTRICT.SUBURBS || b.district === DISTRICT.PARK) ground = PALETTE.grass;
      else if (b.district === DISTRICT.DOWNTOWN) ground = '#979da3';
      else if (b.district === DISTRICT.INDUSTRIAL || b.district === DISTRICT.DOCKS) ground = '#828a90';
      else if (b.district === DISTRICT.BEACHFRONT) ground = '#d9c491';
      ctx.fillStyle = ground;
      ctx.fillRect(b.x + 14, b.y + 14, b.w - 28, b.h - 28);
      if (b.district === DISTRICT.SUBURBS) {
        ctx.fillStyle = PALETTE.grassDark;
        ctx.fillRect(b.x + 14, b.y + b.h / 2 - 2, b.w - 28, 4);
        ctx.fillRect(b.x + b.w / 2 - 2, b.y + 14, 4, b.h - 28);
      }
    }
    // The park pond.
    if (city.park) {
      const pond = city.park.pond;
      ctx.fillStyle = PALETTE.water;
      ctx.beginPath();
      ctx.ellipse(pond.x + pond.rx, pond.y + pond.ry, pond.rx, pond.ry, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.25)';
      ctx.beginPath();
      ctx.ellipse(pond.x + pond.rx * 0.7, pond.y + pond.ry * 0.7, pond.rx * 0.4, pond.ry * 0.3, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    // Beach: boardwalk planks, sand, animated water.
    ctx.fillStyle = PALETTE.boardwalk;
    ctx.fillRect(BEACH.promX, 0, BEACH.promW, city.height);
    ctx.fillStyle = PALETTE.boardwalkDark;
    for (let y = 0; y < city.height; y += 22) ctx.fillRect(BEACH.promX, y, BEACH.promW, 3);
    ctx.fillStyle = PALETTE.sand;
    ctx.fillRect(BEACH.sandX, 0, BEACH.waterX - BEACH.sandX, city.height);
    ctx.fillStyle = PALETTE.water;
    ctx.fillRect(BEACH.waterX, 0, city.width - BEACH.waterX, city.height);
    ctx.strokeStyle = PALETTE.waterFoam;
    ctx.lineWidth = 2.4;
    ctx.globalAlpha = 0.5;
    for (let i = 0; i < 26; i += 1) {
      const y = i * 128 + Math.sin(world.time * 0.7 + i * 1.7) * 9;
      const x = BEACH.waterX + 12 + Math.sin(world.time * 0.5 + i) * 7;
      if (y < view.y - 30 || y > view.y + view.h + 30) continue;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.quadraticCurveTo(x + 16, y + 7, x + 34, y);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    // Roads.
    ctx.fillStyle = PALETTE.asphalt;
    for (const x of city.roadsV) ctx.fillRect(x - GRID.roadW / 2, 0, GRID.roadW, city.height);
    for (const y of city.roadsH) ctx.fillRect(0, y - GRID.roadW / 2, BEACH.promX, GRID.roadW);
    // Lane dashes.
    ctx.fillStyle = PALETTE.laneMark;
    ctx.globalAlpha = 0.55;
    for (const x of city.roadsV) {
      for (let y = 8; y < city.height; y += 46) {
        if (city.roadsH.some((hy) => Math.abs(hy - y) < 74)) continue;
        ctx.fillRect(x - 2, y, 4, 24);
      }
    }
    for (const y of city.roadsH) {
      for (let x = 8; x < BEACH.promX; x += 46) {
        if (city.roadsV.some((vx) => Math.abs(vx - x) < 74)) continue;
        ctx.fillRect(x, y - 2, 24, 4);
      }
    }
    ctx.globalAlpha = 1;
    // Crosswalks at every junction.
    ctx.fillStyle = PALETTE.crosswalk;
    ctx.globalAlpha = 0.75;
    for (const x of city.roadsV) {
      for (const y of city.roadsH) {
        if (!inView(x - 70, y - 70, 140, 140, view)) continue;
        for (let s = -2; s <= 2; s += 1) {
          ctx.fillRect(x - GRID.roadW / 2 - 13, y + s * 21 - 6, 9, 13);
          ctx.fillRect(x + GRID.roadW / 2 + 4, y + s * 21 - 6, 9, 13);
          ctx.fillRect(x + s * 21 - 6, y - GRID.roadW / 2 - 13, 13, 9);
          ctx.fillRect(x + s * 21 - 6, y + GRID.roadW / 2 + 4, 13, 9);
        }
      }
    }
    ctx.globalAlpha = 1;
    // Skid marks under everything that moves.
    for (const s of world.skids) {
      ctx.save();
      ctx.translate(s.x, s.y);
      ctx.rotate(s.angle);
      ctx.fillStyle = `rgba(20, 20, 24, ${0.4 * (1 - s.life / 7)})`;
      ctx.fillRect(-2, -2, 15, 4);
      ctx.restore();
    }
  }

  function inView(x, y, w, h, view) {
    return x + w > view.x && y + h > view.y && x < view.x + view.w && y < view.y + view.h;
  }

  // ------------------------------------------------------------ buildings & trees

  function drawBuildings(world, view) {
    const city = world.city;
    for (const b of city.buildings) {
      if (!inView(b.x - 20, b.y - 20, b.w + 44, b.h + 44, view)) continue;
      const lift = b.floors ? Math.min(16, 3 + b.floors * 1.4) : 3;
      ctx.fillStyle = 'rgba(15, 20, 26, 0.30)';
      ctx.fillRect(b.x + lift, b.y + lift, b.w, b.h);
      if (b.container) {
        ctx.fillStyle = b.color;
        ctx.fillRect(b.x, b.y, b.w, b.h);
        ctx.fillStyle = 'rgba(0,0,0,0.22)';
        for (let x = b.x + 6; x < b.x + b.w - 4; x += 9) ctx.fillRect(x, b.y + 2, 3, b.h - 4);
        continue;
      }
      ctx.fillStyle = b.roof ?? '#6a7076';
      ctx.fillRect(b.x, b.y, b.w, b.h);
      ctx.fillStyle = b.color;
      ctx.fillRect(b.x + 4, b.y + 4, b.w - 8, b.h - 8);
      ctx.fillStyle = 'rgba(255,255,255,0.13)';
      ctx.fillRect(b.x + 4, b.y + 4, b.w - 8, 5);
      if (b.floors >= 4) {
        // Rooftop clutter on the towers: AC units and a water tank.
        ctx.fillStyle = 'rgba(60, 66, 74, 0.55)';
        ctx.fillRect(b.x + b.w * 0.16, b.y + b.h * 0.16, 20, 14);
        ctx.fillRect(b.x + b.w * 0.62, b.y + b.h * 0.55, 16, 12);
        ctx.beginPath();
        ctx.arc(b.x + b.w * 0.78, b.y + b.h * 0.24, 8, 0, Math.PI * 2);
        ctx.fill();
      } else if (b.floors === 1 && b.district === DISTRICT.SUBURBS) {
        ctx.fillStyle = 'rgba(0,0,0,0.16)';
        ctx.fillRect(b.x + b.w / 2 - 2, b.y + 4, 4, b.h - 8);
      } else if (b.district === DISTRICT.INDUSTRIAL || b.district === DISTRICT.DOCKS) {
        ctx.fillStyle = 'rgba(255,255,255,0.2)';
        for (let x = b.x + 12; x < b.x + b.w - 10; x += 26) ctx.fillRect(x, b.y + 6, 12, b.h - 12);
      }
    }
    // Trees and lamps.
    for (const t of city.trees) {
      if (!inView(t.x - 30, t.y - 30, 60, 60, view)) continue;
      if (t.kind === 'lamp') {
        ctx.fillStyle = '#4a5058';
        ctx.beginPath();
        ctx.arc(t.x, t.y, 3.4, 0, Math.PI * 2);
        ctx.fill();
        continue;
      }
      ctx.fillStyle = 'rgba(15, 20, 26, 0.25)';
      ctx.beginPath();
      ctx.arc(t.x + 5, t.y + 6, t.r, 0, Math.PI * 2);
      ctx.fill();
      if (t.kind === 'palm') {
        ctx.strokeStyle = '#7a5c38';
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.moveTo(t.x, t.y);
        ctx.lineTo(t.x + 3, t.y - 4);
        ctx.stroke();
        ctx.strokeStyle = '#3f9e4d';
        ctx.lineWidth = 3.4;
        for (let i = 0; i < 6; i += 1) {
          const a = (i / 6) * Math.PI * 2 + 0.4;
          ctx.beginPath();
          ctx.moveTo(t.x + 3, t.y - 4);
          ctx.quadraticCurveTo(t.x + 3 + Math.cos(a) * t.r * 0.8, t.y - 4 + Math.sin(a) * t.r * 0.8 - 3, t.x + 3 + Math.cos(a) * t.r * 1.25, t.y - 2 + Math.sin(a) * t.r * 1.25 + 5);
          ctx.stroke();
        }
      } else {
        ctx.fillStyle = '#3f9e4d';
        ctx.beginPath();
        ctx.arc(t.x, t.y, t.r, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#54b368';
        ctx.beginPath();
        ctx.arc(t.x - t.r * 0.3, t.y - t.r * 0.3, t.r * 0.62, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  // ------------------------------------------------------------ lights & signs

  function drawStreetLights(world, view) {
    for (let ix = 0; ix < world.city.roadsV.length; ix += 1) {
      for (let iy = 0; iy < world.city.roadsH.length; iy += 1) {
        const x = world.city.roadsV[ix];
        const y = world.city.roadsH[iy];
        if (!inView(x - 80, y - 80, 160, 160, view)) continue;
        const phase = lightPhase(world.city, ix, iy, world.time);
        drawLightHead(x - GRID.roadW / 2 - 10, y - GRID.roadW / 2 - 10, phase === 'ns' || phase === 'ns-amber' ? phase : 'red', phase);
        drawLightHead(x + GRID.roadW / 2 + 10, y + GRID.roadW / 2 + 10, phase === 'ew' || phase === 'ew-amber' ? phase : 'red', phase);
      }
    }
  }

  function drawLightHead(x, y, state, phase) {
    ctx.fillStyle = '#2c3138';
    roundRect(x - 5, y - 11, 10, 22, 3);
    ctx.fill();
    const colors = ['#e5484d', '#f5a524', '#3fb68b'];
    const active = state === 'red' ? 0 : state.endsWith('amber') ? 1 : 2;
    for (let i = 0; i < 3; i += 1) {
      ctx.fillStyle = i === active ? colors[i] : 'rgba(255,255,255,0.14)';
      ctx.beginPath();
      ctx.arc(x, y - 6.5 + i * 6.5, 2.6, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawLocationSigns(world, view) {
    const signs = [
      ['cafe', 'CAFÉ AZUL', '#c96f4a'],
      ['gunshop', 'CORAL ARMS', '#7a4fd0'],
      ['respray', 'SHINE & GO', '#39b8c4'],
      ['hospital', 'HOSPITAL +', '#e5484d'],
      ['station', 'CBPD', '#3d7bd9'],
      ['warehouse', 'WAREHOUSE 9', '#8a6d3b'],
      ['docksGate', 'DOCKS GATE 3', '#8a6d3b'],
    ];
    ctx.textAlign = 'center';
    for (const [key, label, color] of signs) {
      const loc = world.city.locations[key];
      if (!loc || !inView(loc.x - 80, loc.y - 60, 160, 90, view)) continue;
      ctx.fillStyle = color;
      roundRect(loc.x - 52, loc.y - 46, 104, 21, 5);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.font = `700 11px ${FONT}`;
      ctx.textBaseline = 'middle';
      ctx.fillText(label, loc.x, loc.y - 35);
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(loc.x - 6, loc.y - 25);
      ctx.lineTo(loc.x + 6, loc.y - 25);
      ctx.lineTo(loc.x, loc.y - 16);
      ctx.closePath();
      ctx.fill();
    }
  }

  // ------------------------------------------------------------ entities

  function drawPickups(world, view) {
    for (const pk of world.pickups) {
      if (!inView(pk.x - 24, pk.y - 24, 48, 48, view)) continue;
      const bob = Math.sin(world.time * 3.4 + pk.x) * 3;
      if (pk.kind === 'cash') {
        ctx.save();
        ctx.translate(pk.x, pk.y + bob);
        ctx.rotate(Math.sin(world.time * 2 + pk.y) * 0.4);
        ctx.fillStyle = '#3f9e4d';
        ctx.fillRect(-10, -6, 20, 12);
        ctx.fillStyle = '#ffe066';
        ctx.beginPath();
        ctx.arc(0, 0, 3.6, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      } else {
        ctx.fillStyle = '#8a5a34';
        roundRect(pk.x - 12, pk.y - 8 + bob, 24, 17, 3);
        ctx.fill();
        ctx.strokeStyle = '#5f3d20';
        ctx.lineWidth = 2.4;
        ctx.strokeRect(pk.x - 5, pk.y - 13 + bob, 10, 6);
        text('LEDGER', pk.x, pk.y + 20 + bob, 9, '#ffe9b0', 'center', 700);
      }
    }
  }

  function drawCar(world, car, view) {
    if (!inView(car.x - 60, car.y - 60, 120, 120, view)) return;
    ctx.save();
    ctx.translate(car.x, car.y);
    ctx.rotate(car.angle);
    ctx.fillStyle = 'rgba(12, 16, 22, 0.35)';
    roundRect(-CAR.length / 2 + 4, -CAR.width / 2 + 5, CAR.length, CAR.width, 7);
    ctx.fill();
    // Wheels.
    ctx.fillStyle = '#14161a';
    const wx = CAR.length / 2 - 11;
    const wy = CAR.width / 2 - 2;
    ctx.fillRect(-wx - 4, -wy - 3, 11, 6);
    ctx.fillRect(wx - 7, -wy - 3, 11, 6);
    ctx.fillRect(-wx - 4, wy - 3, 11, 6);
    ctx.fillRect(wx - 7, wy - 3, 11, 6);
    // Body.
    ctx.fillStyle = car.color;
    roundRect(-CAR.length / 2, -CAR.width / 2, CAR.length, CAR.width, 7);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.16)';
    roundRect(-CAR.length / 2 + 3, -CAR.width / 2 + 3, CAR.length - 6, 5, 3);
    ctx.fill();
    // Cabin, glass and roof.
    ctx.fillStyle = '#1d2733';
    roundRect(-8, -CAR.width / 2 + 4, 17, CAR.width - 8, 4);
    ctx.fill();
    ctx.fillStyle = car.mode === 'police' ? '#24406e' : shade(car.color, -18);
    roundRect(-6, -CAR.width / 2 + 6, 13, CAR.width - 12, 3);
    ctx.fill();
    ctx.fillStyle = '#1d2733';
    roundRect(-16, -CAR.width / 2 + 5, 6, CAR.width - 10, 2);
    ctx.fill();
    if (car.mode === 'police') {
      ctx.fillStyle = '#24406e';
      ctx.fillRect(-CAR.length / 2 + 4, -3, CAR.length - 8, 6);
      const flash = Math.floor(world.time * 6) % 2 === 0;
      ctx.fillStyle = flash ? '#ff4040' : '#4066ff';
      ctx.fillRect(-4, -7, 8, 5);
      ctx.fillStyle = flash ? '#4066ff' : '#ff4040';
      ctx.fillRect(-4, 2, 8, 5);
      text('POLICE', 0, 0.5, 7.5, '#24406e', 'center', 800);
    }
    if (car.type === 'taxi') {
      ctx.fillStyle = '#fff3b0';
      ctx.fillRect(-4, -4, 9, 8);
      ctx.fillStyle = '#14161a';
      ctx.font = `800 6px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('TAXI', 0.5, 0.5);
    }
    if (car.mission) {
      ctx.strokeStyle = `rgba(255, 224, 102, ${0.65 + Math.sin(world.time * 5) * 0.3})`;
      ctx.lineWidth = 2.4;
      roundRect(-CAR.length / 2 - 4, -CAR.width / 2 - 4, CAR.length + 8, CAR.width + 8, 9);
      ctx.stroke();
    }
    // Lights: brake lights flare when slowing, headlights are pale by day.
    const braking = (car.throttleVis ?? 0) < 0 || (car.driver && Math.abs(car.speed) < 4);
    ctx.fillStyle = braking ? '#ff5a4d' : '#a8322a';
    ctx.fillRect(-CAR.length / 2, -CAR.width / 2 + 3, 3.4, 6);
    ctx.fillRect(-CAR.length / 2, CAR.width / 2 - 9, 3.4, 6);
    ctx.fillStyle = '#fff6cf';
    ctx.fillRect(CAR.length / 2 - 3, -CAR.width / 2 + 3, 3, 6);
    ctx.fillRect(CAR.length / 2 - 3, CAR.width / 2 - 9, 3, 6);
    ctx.restore();
  }

  function shade(hex, amt) {
    const n = Number.parseInt(hex.slice(1), 16);
    const r = clamp((n >> 16) + amt, 0, 255);
    const g = clamp(((n >> 8) & 0xff) + amt, 0, 255);
    const b = clamp((n & 0xff) + amt, 0, 255);
    return `rgb(${r},${g},${b})`;
  }

  function drawPed(world, ped, view, isPlayer) {
    if (!inView(ped.x - 26, ped.y - 26, 52, 52, view)) return;
    ctx.save();
    ctx.translate(ped.x, ped.y);
    if (ped.state === 'down') {
      ctx.rotate(ped.angle + Math.PI / 2);
      ctx.fillStyle = 'rgba(12,16,22,0.3)';
      ctx.beginPath();
      ctx.ellipse(2, 3, 17, 8, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = ped.shirt;
      roundRect(-13, -6, 20, 12, 5);
      ctx.fill();
      ctx.fillStyle = '#e8b98d';
      ctx.beginPath();
      ctx.arc(11, 0, 5.4, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      return;
    }
    ctx.fillStyle = 'rgba(12,16,22,0.3)';
    ctx.beginPath();
    ctx.ellipse(0, 4, 10, 5.4, 0, 0, Math.PI * 2);
    ctx.fill();
    const stride = ped.speed > 4 || ped.moving ? Math.sin((ped.walkCycle ?? 0)) * 5 : 0;
    ctx.rotate(ped.angle);
    // Legs.
    ctx.strokeStyle = ped.pants;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(-2, 0);
    ctx.lineTo(-2 - stride * 0.4, stride);
    ctx.moveTo(-2, 0);
    ctx.lineTo(-2 + stride * 0.4, -stride);
    ctx.stroke();
    // Body.
    ctx.fillStyle = ped.shirt;
    roundRect(-8, -7.4, 15, 14.8, 6);
    ctx.fill();
    if (ped.state === 'hostile') {
      ctx.strokeStyle = '#22262c';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(6, 2);
      ctx.lineTo(17, 3);
      ctx.stroke();
      ctx.fillStyle = '#e5484d';
      ctx.fillRect(-3, -7.4, 7, 4);
    }
    // Head.
    ctx.fillStyle = '#e8b98d';
    ctx.beginPath();
    ctx.arc(4.6, 0, 5.2, 0, Math.PI * 2);
    ctx.fill();
    if (isPlayer) {
      ctx.fillStyle = '#f4f1e6';
      ctx.beginPath();
      ctx.arc(5.4, 0, 5.4, Math.PI * 0.6, Math.PI * 1.65);
      ctx.fill();
    }
    ctx.restore();
    if (ped.state === 'fare-wait') {
      const bob = Math.sin(world.time * 5 + ped.id) * 3;
      ctx.fillStyle = '#ffb03a';
      ctx.beginPath();
      ctx.arc(ped.x, ped.y - 30 + bob, 10, 0, Math.PI * 2);
      ctx.fill();
      text('!', ped.x, ped.y - 29.4 + bob, 14, '#14161a', 'center', 800);
    }
  }

  function drawEffects(world, view) {
    for (const t of world.tracers) {
      ctx.strokeStyle = t.color;
      ctx.globalAlpha = 1 - t.life / t.maxLife;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(t.x1, t.y1);
      ctx.lineTo(t.x2, t.y2);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    for (const pt of world.particles) {
      if (!inView(pt.x - 14, pt.y - 14, 28, 28, view)) continue;
      ctx.globalAlpha = Math.max(0, 1 - pt.life / pt.maxLife);
      ctx.fillStyle = pt.color;
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, pt.size, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  function drawMarker(world, view) {
    const obj = world.objective;
    if (!obj || !obj.marker) return;
    const m = obj.marker;
    const bob = Math.sin(world.time * 4) * 5;
    ctx.fillStyle = 'rgba(255, 176, 58, 0.2)';
    ctx.beginPath();
    ctx.arc(m.x, m.y, 30 + Math.sin(world.time * 4) * 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#ffb03a';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(m.x, m.y, 24, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = '#ffb03a';
    ctx.beginPath();
    ctx.moveTo(m.x - 11, m.y - 58 + bob);
    ctx.lineTo(m.x + 11, m.y - 58 + bob);
    ctx.lineTo(m.x, m.y - 38 + bob);
    ctx.closePath();
    ctx.fill();
  }

  // ------------------------------------------------------------ night

  function drawNight(world, view, phase) {
    if (phase.dark <= 0.04) return;
    ctx.fillStyle = `rgba(9, 13, 44, ${phase.dark * 0.45})`;
    ctx.fillRect(view.x, view.y, view.w, view.h);
    if (phase.warm > 0.03) {
      ctx.fillStyle = `rgba(255, 122, 40, ${phase.warm * 0.13})`;
      ctx.fillRect(view.x, view.y, view.w, view.h);
    }
    if (phase.dark < 0.3) return;
    const glow = (x, y, r, color, alpha) => {
      const g = ctx.createRadialGradient(x, y, 2, x, y, r);
      g.addColorStop(0, color);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.globalAlpha = alpha;
      ctx.fillStyle = g;
      ctx.fillRect(x - r, y - r, r * 2, r * 2);
      ctx.globalAlpha = 1;
    };
    for (const t of world.city.trees) {
      if (t.kind !== 'lamp' || !inView(t.x - 60, t.y - 60, 120, 120, view)) continue;
      glow(t.x, t.y, 44, 'rgba(255, 196, 92, 0.55)', 0.5);
    }
    for (const car of world.cars) {
      if (car.mode === 'parked' || !inView(car.x - 130, car.y - 130, 260, 260, view)) continue;
      const hx = car.x + Math.cos(car.angle) * (CAR.length / 2);
      const hy = car.y + Math.sin(car.angle) * (CAR.length / 2);
      glow(hx + Math.cos(car.angle) * 26, hy + Math.sin(car.angle) * 26, 62, 'rgba(255, 240, 190, 0.5)', 0.42);
      if (car.mode === 'police') {
        const flash = Math.floor(world.time * 6) % 2 === 0;
        glow(car.x, car.y, 74, flash ? 'rgba(255, 64, 64, 0.5)' : 'rgba(64, 102, 255, 0.5)', 0.5);
      }
    }
  }

  /** Paint the whole world for this frame. */
  function drawWorld(world) {
    setScreenTransform();
    const cam = world.camera;
    const shakeX = world.camera.shake ? (Math.random() - 0.5) * world.camera.shake : 0;
    const shakeY = world.camera.shake ? (Math.random() - 0.5) * world.camera.shake : 0;
    const view = { x: cam.x - VIEW.width / 2 + shakeX, y: cam.y - VIEW.height / 2 + shakeY, w: VIEW.width, h: VIEW.height };
    ctx.fillStyle = PALETTE.waterDeep;
    ctx.fillRect(0, 0, VIEW.width, VIEW.height);
    ctx.save();
    ctx.translate(-view.x, -view.y);
    drawGround(world, view);
    drawBuildings(world, view);
    drawStreetLights(world, view);
    drawLocationSigns(world, view);
    drawPickups(world, view);
    for (const car of world.cars) drawCar(world, car, view);
    for (const ped of world.peds) {
      if (ped.state === 'driver' || ped.state === 'passenger') continue;
      drawPed(world, ped, view, false);
    }
    if (!world.player.car) drawPed(world, world.player, view, true);
    drawEffects(world, view);
    drawMarker(world, view);
    drawNight(world, view, dayPhase(world.clockMinutes));
    ctx.restore();
    return view;
  }

  return { ctx, drawWorld, setScreenTransform, text, roundRect, resize };
}
