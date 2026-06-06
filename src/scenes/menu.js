// Main menu / boss-select. Pick a boss with the mouse (click a card) or the
// keyboard (Left/Right to highlight, Enter/Space to start).

import { BOSSES } from '../bosses/index.js';
import { getBestTime } from '../systems/scores.js';
import { roundRect } from '../systems/ui.js';

export function createMenuScene(game, initialIndex = 0) {
  let selected = initialIndex % BOSSES.length;
  let time = 0;

  const cardW = 280;
  const cardH = 200;
  const gap = 40;

  function cardRect(i) {
    const totalW = BOSSES.length * cardW + (BOSSES.length - 1) * gap;
    const startX = (game.width - totalW) / 2;
    return {
      x: startX + i * (cardW + gap),
      y: game.height / 2 - cardH / 2 + 20,
      w: cardW,
      h: cardH,
    };
  }

  function pointInRect(p, r) {
    return p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h;
  }

  return {
    update(_dt, input) {
      time += _dt;
      if (input.wasPressed('right')) selected = (selected + 1) % BOSSES.length;
      if (input.wasPressed('left'))
        selected = (selected - 1 + BOSSES.length) % BOSSES.length;

      // Hover-to-select with the mouse.
      for (let i = 0; i < BOSSES.length; i++) {
        if (pointInRect(input.mouse, cardRect(i))) {
          selected = i;
          if (input.mousePressed('left')) {
            game.goFight(BOSSES[i].id);
            return;
          }
        }
      }

      if (input.wasPressed('confirm')) {
        game.goFight(BOSSES[selected].id);
      }
    },

    render(ctx) {
      ctx.clearRect(0, 0, game.width, game.height);
      ctx.fillStyle = '#0c0d14';
      ctx.fillRect(0, 0, game.width, game.height);

      // Title.
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = '#ffcc55';
      ctx.font = "bold 72px 'Trebuchet MS', sans-serif";
      const bob = Math.sin(time * 2) * 4;
      ctx.fillText('BOSSRAID', game.width / 2, 120 + bob);
      ctx.fillStyle = 'rgba(255,255,255,0.55)';
      ctx.font = "18px 'Trebuchet MS', sans-serif";
      ctx.fillText('Choose your opponent', game.width / 2, 176);

      // Boss cards.
      for (let i = 0; i < BOSSES.length; i++) {
        const b = BOSSES[i];
        const r = cardRect(i);
        const active = i === selected;

        ctx.save();
        roundRect(ctx, r.x, r.y, r.w, r.h, 12);
        ctx.fillStyle = active ? '#1c2030' : '#14161f';
        ctx.fill();
        ctx.lineWidth = active ? 3 : 1.5;
        ctx.strokeStyle = active ? b.color : '#2a2d3a';
        ctx.stroke();

        // Boss glyph.
        ctx.fillStyle = b.color;
        ctx.beginPath();
        ctx.arc(r.x + r.w / 2, r.y + 64, active ? 40 : 36, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = '#fff';
        ctx.font = "bold 22px 'Trebuchet MS', sans-serif";
        ctx.fillText(b.name, r.x + r.w / 2, r.y + 126);

        ctx.fillStyle =
          b.difficulty === 'Hard' ? '#e8855a' : 'rgba(255,255,255,0.6)';
        ctx.font = "13px 'Trebuchet MS', sans-serif";
        ctx.fillText(b.difficulty, r.x + r.w / 2, r.y + 150);

        const best = getBestTime(b.id);
        ctx.fillStyle = 'rgba(255,255,255,0.45)';
        ctx.font = "12px 'Trebuchet MS', sans-serif";
        ctx.fillText(
          best != null ? `Best: ${best.toFixed(1)}s` : 'Not yet cleared',
          r.x + r.w / 2,
          r.y + 174
        );

        ctx.restore();
      }

      // Selected blurb + prompt.
      ctx.fillStyle = 'rgba(255,255,255,0.7)';
      ctx.font = "15px 'Trebuchet MS', sans-serif";
      ctx.fillText(BOSSES[selected].blurb, game.width / 2, game.height - 96);

      ctx.fillStyle = '#ffcc55';
      ctx.font = "bold 18px 'Trebuchet MS', sans-serif";
      const pulse = 0.6 + Math.sin(time * 4) * 0.4;
      ctx.globalAlpha = pulse;
      ctx.fillText('Click a boss or press Enter to fight', game.width / 2, game.height - 56);
      ctx.globalAlpha = 1;
    },
  };
}
