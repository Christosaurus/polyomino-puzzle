/**
 * Shared 2.5-D drawing primitives — used by every canvas view.
 *
 * The "3-D" is faux: each piece is an extruded body (a dark base offset
 * downward, a lit top face with a gloss) sitting in a recessed well, with a soft
 * contact shadow. No perspective transform, so hit-testing stays simple.
 */

import { shade } from "./colors.js";

export interface TileOpts {
  alpha?: number;
  /** Extra scale about the tile centre (placement pop). */
  scale?: number;
  /** Extra height of the extruded body, in cell fractions (0.16 default). */
  depth?: number;
  /** Coloured outer glow radius. */
  glow?: number;
  /** Override the top-face colour (e.g. red for an invalid drop). */
  tint?: string;
}

const CORNER = 0.2;

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

/** A recessed grid well at cell (col,row) in the board frame. */
export function drawWell(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  cell: number,
  fill: string,
): void {
  const r = cell * CORNER;
  roundRect(ctx, x + 2, y + 2, cell - 4, cell - 4, r);
  ctx.fillStyle = fill;
  ctx.fill();
  // inner shadow: a darker inset along the top-left
  ctx.save();
  roundRect(ctx, x + 2, y + 2, cell - 4, cell - 4, r);
  ctx.clip();
  ctx.strokeStyle = "rgba(0,0,0,0.22)";
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.moveTo(x + 3, y + cell - 4);
  ctx.lineTo(x + 3, y + 3);
  ctx.lineTo(x + cell - 4, y + 3);
  ctx.stroke();
  ctx.restore();
}

/**
 * Draw an extruded polyomino body. `cells` are absolute cell coordinates
 * `[row, col]`; `ox,oy` is the pixel origin of cell (0,0); `cell` is the pixel
 * size of a cell.
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
  const depth = Math.max(2, cell * (opts.depth ?? 0.16));
  const r = cell * CORNER;
  const present = new Set(cells.map(([cr, cc]) => `${cr},${cc}`));

  let sr = 0;
  let sc = 0;
  for (const [cr, cc] of cells) {
    sr += cr;
    sc += cc;
  }
  const cx = ox + (sc / cells.length + 0.5) * cell;
  const cy = oy + (sr / cells.length + 0.5) * cell;

  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(cx, cy);
  ctx.scale(scale, scale);
  ctx.translate(-cx, -cy);

  const cellRect = (cr: number, cc: number, dy: number): void =>
    roundRect(ctx, ox + cc * cell + 2, oy + cr * cell + 2 + dy, cell - 4, cell - 4, r);

  // contact shadow
  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,0.32)";
  ctx.shadowBlur = depth * 2.4;
  ctx.shadowOffsetY = depth * 0.9;
  ctx.fillStyle = "rgba(0,0,0,0.35)";
  for (const [cr, cc] of cells) cellRect(cr, cc, depth);
  ctx.fill();
  ctx.restore();

  // extruded base (dark), only the parts that peek out below/right
  ctx.fillStyle = shade(color, -0.4);
  for (const [cr, cc] of cells) cellRect(cr, cc, depth);
  ctx.fill();

  // top face
  if (opts.glow) {
    ctx.shadowColor = color;
    ctx.shadowBlur = opts.glow;
  }
  for (const [cr, cc] of cells) {
    const x = ox + cc * cell;
    const y = oy + cr * cell;
    const grad = ctx.createLinearGradient(0, y, 0, y + cell);
    grad.addColorStop(0, shade(opts.tint ?? color, 0.34));
    grad.addColorStop(0.55, opts.tint ?? color);
    grad.addColorStop(1, shade(opts.tint ?? color, -0.1));
    roundRect(ctx, x + 2, y + 2, cell - 4, cell - 4, r);
    ctx.fillStyle = grad;
    ctx.fill();
  }
  ctx.shadowBlur = 0;

  // gloss highlight per cell
  ctx.globalAlpha = alpha * 0.5;
  ctx.fillStyle = "rgba(255,255,255,0.8)";
  for (const [cr, cc] of cells) {
    const x = ox + cc * cell;
    const y = oy + cr * cell;
    roundRect(ctx, x + cell * 0.16, y + cell * 0.14, cell * 0.42, cell * 0.22, cell * 0.12);
    ctx.fill();
  }
  ctx.globalAlpha = alpha;

  // crisp boundary
  ctx.strokeStyle = shade(color, -0.28);
  ctx.lineWidth = 2;
  ctx.lineJoin = "round";
  ctx.beginPath();
  for (const [cr, cc] of cells) {
    const x = ox + cc * cell;
    const y = oy + cr * cell;
    if (!present.has(`${cr - 1},${cc}`)) {
      ctx.moveTo(x + 2, y + 2);
      ctx.lineTo(x + cell - 2, y + 2);
    }
    if (!present.has(`${cr + 1},${cc}`)) {
      ctx.moveTo(x + 2, y + cell - 2);
      ctx.lineTo(x + cell - 2, y + cell - 2);
    }
    if (!present.has(`${cr},${cc - 1}`)) {
      ctx.moveTo(x + 2, y + 2);
      ctx.lineTo(x + 2, y + cell - 2);
    }
    if (!present.has(`${cr},${cc + 1}`)) {
      ctx.moveTo(x + cell - 2, y + 2);
      ctx.lineTo(x + cell - 2, y + cell - 2);
    }
  }
  ctx.stroke();

  ctx.restore();
}

/** Stroke the outline of a set of cells (used for the target frame). */
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
