import getStroke from 'perfect-freehand';
import rough from 'roughjs';
import type { RoughCanvas } from 'roughjs/bin/canvas';
import type { Options as RoughOptions } from 'roughjs/bin/core';
import { elementBounds, boundsCenter, rotationOf } from './bounds';
import { resolveBindingPoint } from '../tools/arrow';
import { triangleVertices } from '../tools/select';
import type { Camera } from './camera';
import type {
  ArrowheadStyle,
  Element,
  FreehandElement,
  LineArrowElement,
  ShapeElement,
  SmoothingLevel,
  StickyElement,
  StrokeStyle,
  TextElement,
} from './types';

const SMOOTHING_PRESETS: Record<SmoothingLevel, { streamline: number; smoothing: number }> = {
  off: { streamline: 0.05, smoothing: 0.2 },
  low: { streamline: 0.15, smoothing: 0.35 },
  medium: { streamline: 0.35, smoothing: 0.5 },
  high: { streamline: 0.55, smoothing: 0.65 },
  'very-high': { streamline: 0.75, smoothing: 0.8 },
};

const roughCanvasCache = new WeakMap<HTMLCanvasElement, RoughCanvas>();
function getRoughCanvas(canvas: HTMLCanvasElement): RoughCanvas {
  let rc = roughCanvasCache.get(canvas);
  if (!rc) {
    rc = rough.canvas(canvas);
    roughCanvasCache.set(canvas, rc);
  }
  return rc;
}

function dashFor(style: StrokeStyle, width: number): number[] | undefined {
  if (style === 'dashed') return [width * 3.5, width * 2.5];
  if (style === 'dotted') return [width * 0.5, width * 2];
  return undefined;
}

// ---- freehand ----

function strokeOutlinePath(stroke: FreehandElement): Path2D {
  const preset = SMOOTHING_PRESETS[stroke.smoothing];
  const outline = getStroke(
    stroke.points.map((p) => [p.x, p.y, p.pressure]),
    {
      size: stroke.size,
      thinning: 0.55,
      smoothing: preset.smoothing,
      streamline: preset.streamline,
      simulatePressure: stroke.points.every((p) => p.pressure === 0.5),
      last: true,
    },
  );
  return new Path2D(svgPathFromOutline(outline));
}

function svgPathFromOutline(points: number[][]): string {
  const len = points.length;
  if (len < 4) {
    return points
      .map((p, i) => `${i === 0 ? 'M' : 'L'}${p[0].toFixed(2)},${p[1].toFixed(2)}`)
      .join(' ');
  }
  let a = points[0];
  let b = points[1];
  const c = points[2];
  let result = `M${a[0].toFixed(2)},${a[1].toFixed(2)} Q${b[0].toFixed(2)},${b[1].toFixed(2)} ${(
    (b[0] + c[0]) /
    2
  ).toFixed(2)},${((b[1] + c[1]) / 2).toFixed(2)} T`;
  for (let i = 2, max = len - 1; i < max; i++) {
    a = points[i];
    b = points[i + 1];
    result += `${((a[0] + b[0]) / 2).toFixed(2)},${((a[1] + b[1]) / 2).toFixed(2)} `;
  }
  result += 'Z';
  return result;
}

function drawFreehand(ctx: CanvasRenderingContext2D, el: FreehandElement) {
  if (el.points.length === 0) return;
  ctx.save();
  ctx.globalAlpha = el.opacity;
  ctx.fillStyle = el.color;
  ctx.fill(strokeOutlinePath(el));
  ctx.restore();
}

// ---- shapes ----

function roughOptions(
  strokeColor: string,
  strokeWidth: number,
  strokeStyle: StrokeStyle,
  roughness: number,
  seed: number,
  fillColor?: string,
  fillStyle?: string,
): RoughOptions {
  const opts: RoughOptions = {
    stroke: strokeColor,
    strokeWidth,
    roughness,
    seed,
    strokeLineDash: dashFor(strokeStyle, strokeWidth),
  };
  if (fillColor && fillStyle && fillStyle !== 'transparent') {
    opts.fill = fillColor;
    opts.fillStyle = fillStyle === 'cross-hatch' ? 'cross-hatch' : fillStyle === 'hachure' ? 'hachure' : 'solid';
  }
  return opts;
}

function withRotation<T>(
  ctx: CanvasRenderingContext2D,
  el: ShapeElement | StickyElement,
  draw: () => T,
): T {
  const rotation = rotationOf(el);
  if (rotation === 0) return draw();
  const c = boundsCenter(elementBounds(el));
  ctx.save();
  ctx.translate(c.x, c.y);
  ctx.rotate(rotation);
  ctx.translate(-c.x, -c.y);
  const result = draw();
  ctx.restore();
  return result;
}

function drawShape(ctx: CanvasRenderingContext2D, rc: RoughCanvas, el: ShapeElement) {
  ctx.save();
  ctx.globalAlpha = el.opacity;
  withRotation(ctx, el, () => {
    const opts = roughOptions(
      el.strokeColor,
      el.strokeWidth,
      el.strokeStyle,
      el.roughness,
      el.seed,
      el.fillColor,
      el.fillStyle,
    );
    const b = elementBounds(el);
    switch (el.type) {
      case 'rectangle':
        rc.rectangle(b.x, b.y, b.w, b.h, opts);
        break;
      case 'ellipse':
        rc.ellipse(b.x + b.w / 2, b.y + b.h / 2, b.w, b.h, opts);
        break;
      case 'diamond':
        rc.polygon(
          [
            [b.x + b.w / 2, b.y],
            [b.x + b.w, b.y + b.h / 2],
            [b.x + b.w / 2, b.y + b.h],
            [b.x, b.y + b.h / 2],
          ],
          opts,
        );
        break;
      case 'triangle': {
        const { top, bl, br } = triangleVertices(b);
        rc.polygon(
          [
            [top.x, top.y],
            [br.x, br.y],
            [bl.x, bl.y],
          ],
          opts,
        );
        break;
      }
    }
  });
  ctx.restore();
}

// ---- lines / arrows ----

function drawArrowhead(
  ctx: CanvasRenderingContext2D,
  style: ArrowheadStyle,
  tip: { x: number; y: number },
  angle: number,
  size: number,
  color: string,
) {
  if (style === 'none') return;
  ctx.save();
  ctx.translate(tip.x, tip.y);
  ctx.rotate(angle);
  ctx.fillStyle = color;
  ctx.strokeStyle = color;
  ctx.lineWidth = Math.max(1, size / 6);
  switch (style) {
    case 'arrow':
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(-size, size * 0.5);
      ctx.moveTo(0, 0);
      ctx.lineTo(-size, -size * 0.5);
      ctx.stroke();
      break;
    case 'triangle':
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(-size, size * 0.55);
      ctx.lineTo(-size, -size * 0.55);
      ctx.closePath();
      ctx.fill();
      break;
    case 'dot':
      ctx.beginPath();
      ctx.arc(-size / 2, 0, size / 2, 0, Math.PI * 2);
      ctx.fill();
      break;
    case 'bar':
      ctx.beginPath();
      ctx.moveTo(0, -size * 0.6);
      ctx.lineTo(0, size * 0.6);
      ctx.stroke();
      break;
  }
  ctx.restore();
}

function drawLineArrow(
  ctx: CanvasRenderingContext2D,
  rc: RoughCanvas,
  el: LineArrowElement,
  elements: Map<string, Element>,
) {
  if (el.points.length < 2) return;
  const start = resolveBindingPoint(el.startBinding, el.points[0], elements);
  const end = resolveBindingPoint(el.endBinding, el.points[el.points.length - 1], elements);
  const mid = el.points.slice(1, -1);
  const path: [number, number][] = [
    [start.x, start.y],
    ...mid.map((p): [number, number] => [p.x, p.y]),
    [end.x, end.y],
  ];

  ctx.save();
  ctx.globalAlpha = el.opacity;
  const opts = roughOptions(el.strokeColor, el.strokeWidth, el.strokeStyle, el.roughness, el.seed);
  if (path.length === 2) {
    rc.line(path[0][0], path[0][1], path[1][0], path[1][1], opts);
  } else {
    rc.linearPath(path, opts);
  }

  if (el.type === 'arrow') {
    const headSize = 8 + el.strokeWidth * 2;
    const beforeEnd = path[path.length - 2];
    const endAngle = Math.atan2(end.y - beforeEnd[1], end.x - beforeEnd[0]);
    drawArrowhead(ctx, el.endArrow, end, endAngle, headSize, el.strokeColor);
    const afterStart = path[1];
    const startAngle = Math.atan2(start.y - afterStart[1], start.x - afterStart[0]);
    drawArrowhead(ctx, el.startArrow, start, startAngle, headSize, el.strokeColor);
  }

  if (el.label) {
    const cx = (start.x + end.x) / 2;
    const cy = (start.y + end.y) / 2;
    ctx.font = '14px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const metrics = ctx.measureText(el.label);
    const padX = 4;
    const padY = 2;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(cx - metrics.width / 2 - padX, cy - 8 - padY, metrics.width + padX * 2, 16 + padY * 2);
    ctx.fillStyle = el.strokeColor;
    ctx.fillText(el.label, cx, cy);
  }
  ctx.restore();
}

// ---- text ----

function fontString(el: TextElement): string {
  const weight = el.bold ? 'bold' : 'normal';
  const style = el.italic ? 'italic' : 'normal';
  return `${style} ${weight} ${el.fontSize}px ${el.fontFamily}`;
}

export function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const lines: string[] = [];
  for (const paragraph of text.split('\n')) {
    if (paragraph === '') {
      lines.push('');
      continue;
    }
    const words = paragraph.split(' ');
    let current = '';
    for (const word of words) {
      const test = current ? `${current} ${word}` : word;
      if (ctx.measureText(test).width > maxWidth && current) {
        lines.push(current);
        current = word;
      } else {
        current = test;
      }
    }
    lines.push(current);
  }
  return lines;
}

function drawText(ctx: CanvasRenderingContext2D, el: TextElement) {
  ctx.save();
  ctx.globalAlpha = el.opacity;
  ctx.font = fontString(el);
  ctx.fillStyle = el.color;
  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = el.align;
  const lines = wrapText(ctx, el.text, el.width);
  const lineHeightPx = el.fontSize * el.lineHeight;
  const anchorX = el.align === 'left' ? el.x : el.align === 'right' ? el.x + el.width : el.x + el.width / 2;
  lines.forEach((line, i) => {
    const ly = el.y + el.fontSize + i * lineHeightPx;
    ctx.fillText(line, anchorX, ly);
    if (el.underline) {
      const w = ctx.measureText(line).width;
      const lx = el.align === 'left' ? el.x : el.align === 'right' ? el.x + el.width - w : el.x + el.width / 2 - w / 2;
      ctx.beginPath();
      ctx.strokeStyle = el.color;
      ctx.lineWidth = Math.max(1, el.fontSize / 16);
      ctx.moveTo(lx, ly + 2);
      ctx.lineTo(lx + w, ly + 2);
      ctx.stroke();
    }
  });
  ctx.restore();
}

// ---- sticky ----

function drawSticky(ctx: CanvasRenderingContext2D, el: StickyElement) {
  ctx.save();
  ctx.globalAlpha = el.opacity;
  withRotation(ctx, el, () => {
    ctx.fillStyle = el.color;
    ctx.shadowColor = 'rgba(0,0,0,0.18)';
    ctx.shadowBlur = 8;
    ctx.shadowOffsetY = 3;
    roundRectPath(ctx, el.x, el.y, el.w, el.h, 6);
    ctx.fill();
    ctx.shadowColor = 'transparent';

    ctx.fillStyle = 'rgba(0,0,0,0.78)';
    ctx.font = '15px system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    const pad = 12;
    const lines = wrapText(ctx, el.text, el.w - pad * 2);
    const lh = 19;
    for (let i = 0; i < lines.length; i++) {
      const ly = el.y + pad + 14 + i * lh;
      if (ly > el.y + el.h - pad) break;
      ctx.fillText(lines[i], el.x + pad, ly);
    }
  });
  ctx.restore();
}

function roundRectPath(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// ---- dispatch ----

export function drawElement(
  ctx: CanvasRenderingContext2D,
  rc: RoughCanvas,
  el: Element,
  elements: Map<string, Element>,
) {
  switch (el.type) {
    case 'freehand':
      drawFreehand(ctx, el);
      break;
    case 'rectangle':
    case 'ellipse':
    case 'diamond':
    case 'triangle':
      drawShape(ctx, rc, el);
      break;
    case 'line':
    case 'arrow':
      drawLineArrow(ctx, rc, el, elements);
      break;
    case 'text':
      drawText(ctx, el);
      break;
    case 'sticky':
      drawSticky(ctx, el);
      break;
  }
}

export function render(
  ctx: CanvasRenderingContext2D,
  camera: Camera,
  dpr: number,
  elements: Map<string, Element>,
  order: string[],
  hiddenIds: Set<string>,
  liveElement: Element | null,
  backgroundColor: string,
) {
  const { viewportWidth: w, viewportHeight: h } = camera;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = backgroundColor;
  ctx.fillRect(0, 0, w * dpr, h * dpr);

  ctx.setTransform(camera.getTransform(dpr));
  const rc = getRoughCanvas(ctx.canvas);
  for (const id of order) {
    if (hiddenIds.has(id)) continue;
    const el = elements.get(id);
    if (el) drawElement(ctx, rc, el, elements);
  }
  if (liveElement) drawElement(ctx, rc, liveElement, elements);
}
