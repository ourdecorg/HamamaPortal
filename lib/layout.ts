/**
 * A tiny deterministic force layout for the hero "ecosystem map".
 * No dependencies; the same input always yields the same picture, so server
 * and client renders agree.
 */

export interface Point {
  id: string;
  x: number;
  y: number;
}

export function layoutNetwork(
  ids: string[],
  edges: [string, string][],
  width: number,
  height: number,
  margin = { x: 64, y: 46 },
): Point[] {
  const n = ids.length;
  if (n === 0) return [];

  const cx = width / 2;
  const cy = height / 2;

  // Start on a jittered ellipse (deterministic "randomness" from the index).
  const pts = ids.map((id, i) => {
    const angle = (i / n) * Math.PI * 2 + 0.6;
    const jitter = 0.75 + 0.5 * Math.abs(Math.sin(i * 12.9898));
    return {
      id,
      x: cx + Math.cos(angle) * (width / 2 - margin.x) * 0.72 * jitter,
      y: cy + Math.sin(angle) * (height / 2 - margin.y) * 0.72 * jitter,
      vx: 0,
      vy: 0,
    };
  });
  const index = new Map(pts.map((p, i) => [p.id, i]));
  const links = edges
    .map(([a, b]) => [index.get(a), index.get(b)] as const)
    .filter((l): l is readonly [number, number] => l[0] !== undefined && l[1] !== undefined);

  const rest = Math.min(width, height) * 0.38;

  for (let step = 0; step < 320; step++) {
    const cooling = 1 - step / 320;

    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const dx = pts[i].x - pts[j].x;
        const dy = pts[i].y - pts[j].y;
        const d2 = Math.max(dx * dx + dy * dy, 60);
        const d = Math.sqrt(d2);
        const force = 30000 / d2;
        pts[i].vx += (dx / d) * force;
        pts[i].vy += (dy / d) * force;
        pts[j].vx -= (dx / d) * force;
        pts[j].vy -= (dy / d) * force;
      }
    }

    for (const [a, b] of links) {
      const dx = pts[b].x - pts[a].x;
      const dy = pts[b].y - pts[a].y;
      const d = Math.max(Math.hypot(dx, dy), 1);
      const force = (d - rest) * 0.012;
      pts[a].vx += (dx / d) * force;
      pts[a].vy += (dy / d) * force;
      pts[b].vx -= (dx / d) * force;
      pts[b].vy -= (dy / d) * force;
    }

    for (const p of pts) {
      p.vx += (cx - p.x) * 0.0025;
      p.vy += (cy - p.y) * 0.0025;
      p.x += p.vx * 0.5 * cooling;
      p.y += p.vy * 0.5 * cooling;
      p.vx *= 0.6;
      p.vy *= 0.6;
      p.x = Math.min(width - margin.x, Math.max(margin.x, p.x));
      p.y = Math.min(height - margin.y, Math.max(margin.y, p.y));
    }
  }
  return pts.map(({ id, x, y }) => ({ id, x: Math.round(x * 10) / 10, y: Math.round(y * 10) / 10 }));
}
