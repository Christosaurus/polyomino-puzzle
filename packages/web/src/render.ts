/**
 * Shared drawing primitives.
 *
 * Pieces are rendered as connected glossy spheres — the IQ-Puzzler look: each
 * cell is a shaded ball, adjacent balls of the same piece are joined by a smooth
 * neck, and the whole thing casts one soft shadow.
 */

import { shade } from "./colors.js";

export interface TileOpts {
  alpha?: number;
  /** Extra scale about the piece centre (placement pop). */
  scale?: number;
  /** Unused for spheres; kept for call-site compatibility. */
  depth?: number;
  /** Coloured outer glow radius. */
  glow?: number;
  /** Override the ball colour. */
  tint?: string;
  /** A smooth white rim + soft halo around the piece — the "picked up" look. */
  selected?: boolean;
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  ctx.beginPath();
  if (typeof ctx.roundRect === "function") {
    ctx.roundRect(x, y, w, h, r);
    return;
  }
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** A soft recessed grid well. */
export function drawWell(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  cell: number,
  fill: string,
): void {
  const r = cell * 0.32;
  roundRect(ctx, x + 2, y + 2, cell - 4, cell - 4, r);
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.save();
  roundRect(ctx, x + 2, y + 2, cell - 4, cell - 4, r);
  ctx.clip();
  ctx.strokeStyle = "rgba(0,0,0,0.28)";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(x + cell / 2, y + cell / 2, cell * 0.4, Math.PI * 0.75, Math.PI * 1.75);
  ctx.stroke();
  ctx.strokeStyle = "rgba(255,255,255,0.05)";
  ctx.beginPath();
  ctx.arc(x + cell / 2, y + cell / 2, cell * 0.4, Math.PI * 1.9, Math.PI * 2.7);
  ctx.stroke();
  ctx.restore();
}

/**
 * Draw a polyomino as connected spheres. `cells` are absolute `[row, col]`;
 * `ox,oy` is the pixel origin of cell (0,0); `cell` is the pixel size.
 */
export function drawPieceBody(
  ctx: CanvasRenderingContext2D,
  cells: ReadonlyArray<readonly [number, number]>,
  ox: number,
  oy: number,
  cell: number,
  color: string,
  opts: TileOpts = {},
): void {
  if (cells.length === 0) return;
  const alpha = opts.alpha ?? 1;
  const scale = opts.scale ?? 1;
  const base = opts.tint ?? color;
  const R = cell * 0.5; // ball radius (balls just touch across a cell)
  const neck = cell * 0.44;

  const present = new Set(cells.map(([r, c]) => `${r},${c}`));
  const centre = (r: number, c: number): [number, number] => [
    ox + (c + 0.5) * cell,
    oy + (r + 0.5) * cell,
  ];

  let sx = 0;
  let sy = 0;
  for (const [r, c] of cells) {
    const [cx, cy] = centre(r, c);
    sx += cx;
    sy += cy;
  }
  const pcx = sx / cells.length;
  const pcy = sy / cells.length;

  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(pcx, pcy);
  ctx.scale(scale, scale);
  ctx.translate(-pcx, -pcy);

  // ── one soft shadow for the whole piece ──
  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,0.4)";
  ctx.shadowBlur = cell * 0.34;
  ctx.shadowOffsetY = cell * 0.16;
  ctx.fillStyle = "rgba(0,0,0,0.5)";
  for (const [r, c] of cells) {
    const [cx, cy] = centre(r, c);
    ctx.beginPath();
    ctx.arc(cx, cy, R * 0.92, 0, 6.28);
    ctx.fill();
  }
  ctx.restore();

  // ── "picked up" rim: a smooth white silhouette + soft halo, drawn just
  //    under the coloured balls so a clean band of it shows all around ──
  if (opts.selected) {
    const rim = cell * 0.07;
    ctx.save();
    ctx.shadowColor = "rgba(255,255,255,0.55)";
    ctx.shadowBlur = cell * 0.3;
    ctx.fillStyle = "rgba(255,255,255,0.96)";
    // widened necks first, then widened balls — one continuous white shape
    for (const [r, c] of cells) {
      const [cx, cy] = centre(r, c);
      if (present.has(`${r},${c + 1}`)) {
        const [nx] = centre(r, c + 1);
        ctx.beginPath();
        ctx.roundRect?.(cx, cy - neck / 2 - rim, nx - cx, neck + rim * 2, (neck + rim * 2) / 2);
        if (!ctx.roundRect) ctx.rect(cx, cy - neck / 2 - rim, nx - cx, neck + rim * 2);
        ctx.fill();
      }
      if (present.has(`${r + 1},${c}`)) {
        const [, ny] = centre(r + 1, c);
        ctx.beginPath();
        ctx.roundRect?.(cx - neck / 2 - rim, cy, neck + rim * 2, ny - cy, (neck + rim * 2) / 2);
        if (!ctx.roundRect) ctx.rect(cx - neck / 2 - rim, cy, neck + rim * 2, ny - cy);
        ctx.fill();
      }
    }
    for (const [r, c] of cells) {
      const [cx, cy] = centre(r, c);
      ctx.beginPath();
      ctx.arc(cx, cy, R * 0.97 + rim, 0, 6.28);
      ctx.fill();
    }
    ctx.restore();
  }

  // ── necks between adjacent balls (drawn under the balls) ──
  ctx.fillStyle = shade(base, -0.05);
  for (const [r, c] of cells) {
    const [cx, cy] = centre(r, c);
    if (present.has(`${r},${c + 1}`)) {
      const [nx, ny] = centre(r, c + 1);
      ctx.beginPath();
      ctx.roundRect?.(cx, cy - neck / 2, nx - cx, neck, neck / 2);
      if (!ctx.roundRect) ctx.rect(cx, cy - neck / 2, nx - cx, neck);
      ctx.fill();
    }
    if (present.has(`${r + 1},${c}`)) {
      const [nx, ny] = centre(r + 1, c);
      ctx.beginPath();
      ctx.roundRect?.(cx - neck / 2, cy, neck, ny - cy, neck / 2);
      if (!ctx.roundRect) ctx.rect(cx - neck / 2, cy, neck, ny - cy);
      ctx.fill();
    }
  }

  // ── the balls ──
  if (opts.glow) {
    ctx.shadowColor = base;
    ctx.shadowBlur = opts.glow;
  }
  const hi = shade(base, 0.62);
  const mid = base;
  const edge = shade(base, -0.42);
  for (const [r, c] of cells) {
    const [cx, cy] = centre(r, c);
    const g = ctx.createRadialGradient(
      cx - R * 0.34,
      cy - R * 0.4,
      R * 0.1,
      cx,
      cy,
      R * 1.05,
    );
    g.addColorStop(0, hi);
    g.addColorStop(0.35, mid);
    g.addColorStop(1, edge);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(cx, cy, R * 0.97, 0, 6.28);
    ctx.fill();
  }
  ctx.shadowBlur = 0;

  // ── specular highlight ──
  for (const [r, c] of cells) {
    const [cx, cy] = centre(r, c);
    const s = ctx.createRadialGradient(
      cx - R * 0.32,
      cy - R * 0.4,
      0,
      cx - R * 0.32,
      cy - R * 0.4,
      R * 0.55,
    );
    s.addColorStop(0, "rgba(255,255,255,0.9)");
    s.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = s;
    ctx.beginPath();
    ctx.ellipse(cx - R * 0.3, cy - R * 0.38, R * 0.42, R * 0.3, -0.5, 0, 6.28);
    ctx.fill();
  }

  ctx.restore();
}

/** Stroke the outline of a set of cells (the target frame). */
export function strokeCellOutline(
  ctx: CanvasRenderingContext2D,
  has: (row: number, col: number) => boolean,
  cells: ReadonlyArray<readonly [number, number]>,
  ox: number,
  oy: number,
  cell: number,
  color: string,
  width = 3,
): void {
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.beginPath();
  for (const [r, c] of cells) {
    const x = ox + c * cell;
    const y = oy + r * cell;
    if (!has(r - 1, c)) {
      ctx.moveTo(x, y);
      ctx.lineTo(x + cell, y);
    }
    if (!has(r + 1, c)) {
      ctx.moveTo(x, y + cell);
      ctx.lineTo(x + cell, y + cell);
    }
    if (!has(r, c - 1)) {
      ctx.moveTo(x, y);
      ctx.lineTo(x, y + cell);
    }
    if (!has(r, c + 1)) {
      ctx.moveTo(x + cell, y);
      ctx.lineTo(x + cell, y + cell);
    }
  }
  ctx.stroke();
}

export { roundRect };
