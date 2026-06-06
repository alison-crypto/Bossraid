// The fight scene: wires the player, the selected boss, the spawner, and the
// effects system together, resolves combat between them, and drives the
// win/lose transition to the result scene.

import { createPlayer } from '../entities/player.js';
import { createSpawner } from '../systems/spawner.js';
import { createEffects } from '../systems/effects.js';
import { getBoss } from '../bosses/index.js';
import {
  resolveMeleeHit,
  dealDamage,
  bodiesOverlap,
} from '../systems/combat.js';
import { drawPlayerHud, drawBossHud, drawHints } from '../systems/ui.js';

export function createFightScene(game, bossId) {
  const bounds = { x: 0, y: 0, w: game.width, h: game.height };
  const def = getBoss(bossId);

  const player = createPlayer(game.width / 2, game.height - 110);
  const boss = def.create(game.width / 2, 150);
  const spawner = createSpawner(bounds);
  const effects = createEffects();

  let lastSwingId = 0;
  let elapsed = 0;
  let paused = false;
  let outcome = null; // 'win' | 'lose'
  let endTimer = 0;
  let bossDeathDone = false;

  function resolvePlayerAttack() {
    const swing = player.activeSwing;
    if (!swing || swing.swingId === lastSwingId || boss.dead) return;
    const dmg = resolveMeleeHit(swing, boss, effects);
    if (dmg > 0) {
      lastSwingId = swing.swingId;
      player.markSwingResolved();
    }
  }

  function contactDamage() {
    if (boss.dead || player.dead) return;
    if (bodiesOverlap(player, boss) && !(player.invuln > 0)) {
      const dealt = dealDamage(player, 12, effects, { shake: 6, mercyIframes: 0.7 });
      if (dealt > 0) {
        // Shove the player out of the boss to avoid grind-locking.
        const ang = Math.atan2(player.y - boss.y, player.x - boss.x);
        player.pos.x += Math.cos(ang) * 26;
        player.pos.y += Math.sin(ang) * 26;
      }
    }
  }

  return {
    enter() {
      game.input.endFrame();
    },

    update(dt, input) {
      if (input.wasPressed('pause') && !outcome) {
        paused = !paused;
        return;
      }
      if (paused) return;

      // Hit-stop freezes the simulation for impact weight; effects still tick.
      const frozen = effects.consumeHitStop(dt);
      effects.update(dt);
      if (frozen) return;

      if (outcome) {
        // Let the death throes play, then advance to the result screen.
        endTimer -= dt;
        // Keep particles/projectiles alive but stop boss AI.
        spawner.update(dt, player, effects);
        if (endTimer <= 0) {
          game.goResult({ won: outcome === 'win', time: elapsed, bossId: def.id });
        }
        return;
      }

      elapsed += dt;
      player.update(dt, input, bounds);

      const ctx = { player, spawner, effects, bounds };
      boss.update(dt, ctx);

      resolvePlayerAttack();
      spawner.update(dt, player, effects);
      contactDamage();

      // Win.
      if (boss.dead && !bossDeathDone) {
        bossDeathDone = true;
        effects.shake(20, 0.8);
        effects.hitStop(0.12);
        effects.burst(boss.x, boss.y, 60, boss.color, { speed: 320, life: 0.9, size: 5 });
        outcome = 'win';
        endTimer = 1.6;
      }

      // Lose.
      if (player.dead && !outcome) {
        effects.shake(16, 0.6);
        effects.burst(player.x, player.y, 40, '#5ec8ff', { speed: 280, life: 0.8 });
        outcome = 'lose';
        endTimer = 1.6;
      }
    },

    render(ctx, _alpha) {
      ctx.clearRect(0, 0, game.width, game.height);

      const shake = effects.shakeOffset;
      ctx.save();
      ctx.translate(shake.x, shake.y);

      drawArena(ctx, bounds);
      spawner.render(ctx);
      boss.render(ctx);
      if (!player.dead) player.render(ctx);
      effects.render(ctx);

      ctx.restore();

      // HUD is drawn without shake so it stays readable.
      drawPlayerHud(ctx, player);
      drawBossHud(ctx, boss, game.width);
      drawHints(ctx, game.width, game.height);
      drawClock(ctx, elapsed, game.width);

      if (paused) drawPauseOverlay(ctx, game.width, game.height);
    },
  };
}

function drawArena(ctx, bounds) {
  // Floor wash + grid for spatial reference.
  ctx.fillStyle = '#0e1018';
  ctx.fillRect(bounds.x, bounds.y, bounds.w, bounds.h);
  ctx.strokeStyle = 'rgba(120,140,200,0.06)';
  ctx.lineWidth = 1;
  const step = 48;
  ctx.beginPath();
  for (let x = bounds.x; x <= bounds.x + bounds.w; x += step) {
    ctx.moveTo(x, bounds.y);
    ctx.lineTo(x, bounds.y + bounds.h);
  }
  for (let y = bounds.y; y <= bounds.y + bounds.h; y += step) {
    ctx.moveTo(bounds.x, y);
    ctx.lineTo(bounds.x + bounds.w, y);
  }
  ctx.stroke();
}

function drawClock(ctx, elapsed, canvasW) {
  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  ctx.font = "bold 14px 'Trebuchet MS', sans-serif";
  ctx.textAlign = 'right';
  ctx.textBaseline = 'top';
  ctx.fillText(`${elapsed.toFixed(1)}s`, canvasW - 20, 56);
}

function drawPauseOverlay(ctx, w, h) {
  ctx.fillStyle = 'rgba(0,0,0,0.6)';
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = '#fff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = "bold 40px 'Trebuchet MS', sans-serif";
  ctx.fillText('PAUSED', w / 2, h / 2 - 14);
  ctx.font = "16px 'Trebuchet MS', sans-serif";
  ctx.fillStyle = 'rgba(255,255,255,0.7)';
  ctx.fillText('Press Esc / P to resume', w / 2, h / 2 + 24);
}
