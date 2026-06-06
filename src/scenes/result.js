// Win/lose screen with retry + menu options. On a win, records the clear time
// and flags a new record. Retry (R/Enter) refights the same boss; Menu (M/Esc)
// returns to boss-select.

import { getBoss, BOSSES } from '../bosses/index.js';
import { recordClear, getBestTime } from '../systems/scores.js';
import { roundRect } from '../systems/ui.js';

// Keep the menu highlight on the boss we just fought.
function bossIndex(bossId) {
  return Math.max(0, BOSSES.findIndex((b) => b.id === bossId));
}

export function createResultScene(game, { won, time, bossId }) {
  const def = getBoss(bossId);
  const newRecord = won ? recordClear(bossId, time) : false;
  const best = getBestTime(bossId);
  let elapsed = 0;

  const buttons = [
    { label: 'Retry  (R)', action: () => game.goFight(bossId) },
    { label: 'Menu  (M)', action: () => game.goMenu(bossIndex(bossId)) },
  ];

  function buttonRect(i) {
    const w = 200;
    const h = 56;
    const gap = 32;
    const totalW = buttons.length * w + (buttons.length - 1) * gap;
    const startX = (game.width - totalW) / 2;
    return { x: startX + i * (w + gap), y: game.height / 2 + 70, w, h };
  }

  function pointInRect(p, r) {
    return p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h;
  }

  return {
    update(dt, input) {
      elapsed += dt;
      if (input.wasPressed('confirm') || input.wasPressed('KeyR')) {
        buttons[0].action();
        return;
      }
      if (input.wasPressed('KeyM') || input.wasPressed('pause')) {
        buttons[1].action();
        return;
      }
      for (let i = 0; i < buttons.length; i++) {
        if (pointInRect(input.mouse, buttonRect(i)) && input.mousePressed('left')) {
          buttons[i].action();
          return;
        }
      }
    },

    render(ctx, _alpha) {
      ctx.fillStyle = won ? '#0d1410' : '#140d0f';
      ctx.fillRect(0, 0, game.width, game.height);

      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      const title = won ? 'VICTORY' : 'DEFEATED';
      ctx.fillStyle = won ? '#5edc7a' : '#e85a5a';
      ctx.font = "bold 80px 'Trebuchet MS', sans-serif";
      const pop = Math.min(1, elapsed * 4);
      ctx.save();
      ctx.translate(game.width / 2, game.height / 2 - 90);
      ctx.scale(pop, pop);
      ctx.fillText(title, 0, 0);
      ctx.restore();

      ctx.fillStyle = '#fff';
      ctx.font = "20px 'Trebuchet MS', sans-serif";
      if (won) {
        ctx.fillText(
          `${def.name} cleared in ${time.toFixed(1)}s`,
          game.width / 2,
          game.height / 2 - 24
        );
        ctx.fillStyle = newRecord ? '#ffcc55' : 'rgba(255,255,255,0.6)';
        ctx.font = newRecord
          ? "bold 18px 'Trebuchet MS', sans-serif"
          : "15px 'Trebuchet MS', sans-serif";
        ctx.fillText(
          newRecord ? '★ New best time! ★' : `Best: ${best?.toFixed(1)}s`,
          game.width / 2,
          game.height / 2 + 6
        );
      } else {
        ctx.fillStyle = 'rgba(255,255,255,0.7)';
        ctx.fillText(
          `${def.name} stood firm. You lasted ${time.toFixed(1)}s.`,
          game.width / 2,
          game.height / 2 - 18
        );
      }

      for (let i = 0; i < buttons.length; i++) {
        const r = buttonRect(i);
        const hover = pointInRect(game.input.mouse, r);
        roundRect(ctx, r.x, r.y, r.w, r.h, 10);
        ctx.fillStyle = hover ? '#2a2f42' : '#1a1d29';
        ctx.fill();
        ctx.lineWidth = 2;
        ctx.strokeStyle = hover ? '#ffcc55' : '#3a3f52';
        ctx.stroke();
        ctx.fillStyle = '#fff';
        ctx.font = "bold 18px 'Trebuchet MS', sans-serif";
        ctx.fillText(buttons[i].label, r.x + r.w / 2, r.y + r.h / 2);
      }
    },
  };
}
