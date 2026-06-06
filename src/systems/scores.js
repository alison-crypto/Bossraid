// Local fastest-clear tracking, persisted to localStorage. Best time is the
// lowest clear time (seconds) per boss id. Degrades gracefully if storage is
// unavailable (e.g. file:// in some browsers).

const KEY = 'bossraid.bestTimes.v1';

function load() {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '{}') ?? {};
  } catch {
    return {};
  }
}

function save(data) {
  try {
    localStorage.setItem(KEY, JSON.stringify(data));
  } catch {
    /* storage unavailable — scores are simply not persisted */
  }
}

export function getBestTime(bossId) {
  const t = load()[bossId];
  return typeof t === 'number' ? t : null;
}

// Record a clear time; returns true if it's a new record.
export function recordClear(bossId, time) {
  const data = load();
  const prev = data[bossId];
  if (typeof prev === 'number' && prev <= time) return false;
  data[bossId] = time;
  save(data);
  return true;
}
