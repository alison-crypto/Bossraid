// Heads-up display: player health/stamina, the boss health bar + name, dash
// cooldown pip, and control hints. Pure draw helpers — they read game state and
// render; they hold no state of their own.

function roundRect(ctx, x, y, w, h, r) {
  const rr = Math.min(r, h / 2, w / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

function bar(ctx, x, y, w, h, frac, fill, opts = {}) {
  ctx.fillStyle = opts.bg ?? 'rgba(0,0,0,0.55)';
  roundRect(ctx, x, y, w, h, opts.radius ?? h / 2);
  ctx.fill();
  const f = Math.max(0, Math.min(1, frac));
  if (f > 0) {
    ctx.fillStyle = fill;
    roundRect(ctx, x, y, w * f, h, opts.radius ?? h / 2);
    ctx.fill();
  }
  if (opts.border) {
    ctx.lineWidth = 2;
    ctx.strokeStyle = opts.border;
    roundRect(ctx, x, y, w, h, opts.radius ?? h / 2);
    ctx.stroke();
  }
}

export function drawPlayerHud(ctx, player) {
  const x = 20;
  const y = 20;
  const w = 260;

  // Health.
  const hpFrac = player.hp / player.maxHp;
  const hpColor = hpFrac > 0.5 ? '#5edc7a' : hpFrac > 0.25 ? '#e8c24a' : '#e85a5a';
  bar(ctx, x, y, w, 18, hpFrac, hpColor, { border: 'rgba(255,255,255,0.25)' });
  ctx.fillStyle = '#fff';
  ctx.font = "bold 12px 'Trebuchet MS', sans-serif";
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(`HP  ${Math.ceil(player.hp)}/${player.maxHp}`, x + 8, y + 9);

  // Stamina.
  bar(ctx, x, y + 24, w, 10, player.stamina / player.maxStamina, '#6ab8ff');

  // Dash cooldown pip.
  const ready = player.dashReady;
  ctx.fillStyle = ready ? '#7fd0ff' : 'rgba(127,208,255,0.3)';
  ctx.beginPath();
  ctx.arc(x + w + 18, y + 13, 8, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = ready ? '#0a0b11' : 'rgba(255,255,255,0.5)';
  ctx.font = "bold 10px 'Trebuchet MS', sans-serif";
  ctx.textAlign = 'center';
  ctx.fillText('DASH', x + w + 18, y + 30);
}

export function drawBossHud(ctx, boss, canvasW) {
  if (!boss || boss.dead) return;
  const w = canvasW - 240;
  const x = (canvasW - w) / 2;
  const y = 24;

  ctx.textAlign = 'center';
  ctx.textBaseline = 'bottom';
  ctx.font = "bold 18px 'Trebuchet MS', sans-serif";
  ctx.fillStyle = '#fff';
  ctx.fillText(boss.phaseName.toUpperCase(), canvasW / 2, y - 2);

  bar(ctx, x, y, w, 16, boss.hpFraction, '#e8554f', {
    border: 'rgba(255,255,255,0.3)',
    bg: 'rgba(0,0,0,0.6)',
  });

  // Phase threshold notches.
  ctx.strokeStyle = 'rgba(0,0,0,0.5)';
  ctx.lineWidth = 2;
  for (const ph of boss.phases) {
    if (ph.threshold >= 1) continue;
    const nx = x + w * ph.threshold;
    ctx.beginPath();
    ctx.moveTo(nx, y);
    ctx.lineTo(nx, y + 16);
    ctx.stroke();
  }
}

export function drawHints(ctx, canvasW, canvasH) {
  ctx.fillStyle = 'rgba(255,255,255,0.4)';
  ctx.font = "12px 'Trebuchet MS', sans-serif";
  ctx.textAlign = 'center';
  ctx.textBaseline = 'bottom';
  ctx.fillText(
    'WASD/Arrows move   ·   Space/Shift dash   ·   J / Left-click light   ·   K / Right-click heavy   ·   Esc pause',
    canvasW / 2,
    canvasH - 12
  );
}

export { bar, roundRect };
