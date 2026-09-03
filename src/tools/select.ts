import { boundsCenter, elementBounds, rotationOf } from '../engine/bounds';
import { distanceToSegment, unrotatePoint } from '../engine/geometry';
import type { Bounds, Element } from '../engine/types';

export type HandleId = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w' | 'rotate';

export const RESIZE_HANDLES: HandleId[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];

function pointInTriangle(
  p: { x: number; y: number },
  a: { x: number; y: number },
  b: { x: number; y: number },
  c: { x: number; y: number },
): boolean {
  const sign = (p1: typeof a, p2: typeof a, p3: typeof a) =>
    (p1.x - p3.x) * (p2.y - p3.y) - (p2.x - p3.x) * (p1.y - p3.y);
  const d1 = sign(p, a, b);
  const d2 = sign(p, b, c);
  const d3 = sign(p, c, a);
  const hasNeg = d1 < 0 || d2 < 0 || d3 < 0;
  const hasPos = d1 > 0 || d2 > 0 || d3 > 0;
  return !(hasNeg && hasPos);
}

export function triangleVertices(b: Bounds) {
  return {
    top: { x: b.x + b.w / 2, y: b.y },
    bl: { x: b.x, y: b.y + b.h },
    br: { x: b.x + b.w, y: b.y + b.h },
  };
}

export function hitTestElement(
  el: Element,
  world: { x: number; y: number },
  tolerance: number,
): boolean {
  if (el.type === 'freehand') {
    const threshold = tolerance + el.size / 2;
    if (el.points.length === 1) {
      return Math.hypot(world.x - el.points[0].x, world.y - el.points[0].y) <= threshold;
    }
    for (let i = 0; i < el.points.length - 1; i++) {
      if (distanceToSegment(world, el.points[i], el.points[i + 1]) <= threshold) return true;
    }
    return false;
  }

  if (el.type === 'line' || el.type === 'arrow') {
    const threshold = tolerance + el.strokeWidth / 2 + 4;
    for (let i = 0; i < el.points.length - 1; i++) {
      if (distanceToSegment(world, el.points[i], el.points[i + 1]) <= threshold) return true;
    }
    return false;
  }

  const b = elementBounds(el);
  const rotation = rotationOf(el);
  const c = boundsCenter(b);
  const local = unrotatePoint(world.x, world.y, c.x, c.y, rotation);

  if (el.type === 'rectangle' || el.type === 'sticky' || el.type === 'text') {
    return (
      local.x >= b.x - tolerance &&
      local.x <= b.x + b.w + tolerance &&
      local.y >= b.y - tolerance &&
      local.y <= b.y + b.h + tolerance
    );
  }

  if (el.type === 'ellipse') {
    const rx = b.w / 2 + tolerance;
    const ry = b.h / 2 + tolerance;
    if (rx <= 0 || ry <= 0) return false;
    const dx = (local.x - c.x) / rx;
    const dy = (local.y - c.y) / ry;
    return dx * dx + dy * dy <= 1;
  }

  if (el.type === 'diamond') {
    const hw = b.w / 2 + tolerance;
    const hh = b.h / 2 + tolerance;
    if (hw <= 0 || hh <= 0) return false;
    return Math.abs(local.x - c.x) / hw + Math.abs(local.y - c.y) / hh <= 1;
  }

  if (el.type === 'triangle') {
    const { top, bl, br } = triangleVertices(b);
    if (pointInTriangle(local, top, bl, br)) return true;
    return (
      distanceToSegment(local, top, bl) <= tolerance ||
      distanceToSegment(local, bl, br) <= tolerance ||
      distanceToSegment(local, br, top) <= tolerance
    );
  }

  return false;
}

/** World-space anchor points for the 8 resize handles + rotate handle, respecting element rotation. */
export function getHandles(
  bounds: Bounds,
  rotation: number,
  zoom: number,
): Record<HandleId, { x: number; y: number }> {
  const { x, y, w, h } = bounds;
  const c = boundsCenter(bounds);
  const local: Record<HandleId, { x: number; y: number }> = {
    nw: { x, y },
    n: { x: x + w / 2, y },
    ne: { x: x + w, y },
    e: { x: x + w, y: y + h / 2 },
    se: { x: x + w, y: y + h },
    s: { x: x + w / 2, y: y + h },
    sw: { x, y: y + h },
    w: { x, y: y + h / 2 },
    rotate: { x: x + w / 2, y: y - 28 / zoom },
  };
  const result = {} as Record<HandleId, { x: number; y: number }>;
  for (const key of Object.keys(local) as HandleId[]) {
    const p = local[key];
    if (rotation === 0) {
      result[key] = p;
    } else {
      const cos = Math.cos(rotation);
      const sin = Math.sin(rotation);
      const dx = p.x - c.x;
      const dy = p.y - c.y;
      result[key] = { x: c.x + dx * cos - dy * sin, y: c.y + dx * sin + dy * cos };
    }
  }
  return result;
}

export function cursorForHandle(handle: HandleId): string {
  switch (handle) {
    case 'n':
    case 's':
      return 'ns-resize';
    case 'e':
    case 'w':
      return 'ew-resize';
    case 'ne':
    case 'sw':
      return 'nesw-resize';
    case 'nw':
    case 'se':
      return 'nwse-resize';
    case 'rotate':
      return 'grab';
  }
}

/** Apply a resize delta (already expressed in the element's local unrotated space) to bounds. */
export function resizeBounds(
  orig: Bounds,
  handle: HandleId,
  dx: number,
  dy: number,
  keepAspect: boolean,
): Bounds {
  const hasN = handle.includes('n');
  const hasS = handle.includes('s');
  const hasE = handle.includes('e');
  const hasW = handle.includes('w');

  let { x, y, w, h } = orig;
  if (hasE) w = orig.w + dx;
  if (hasW) {
    w = orig.w - dx;
    x = orig.x + dx;
  }
  if (hasS) h = orig.h + dy;
  if (hasN) {
    h = orig.h - dy;
    y = orig.y + dy;
  }

  const MIN = 4;
  const isCorner = (hasN || hasS) && (hasE || hasW);
  if (keepAspect && isCorner && orig.w !== 0 && orig.h !== 0) {
    const scale = Math.max(Math.abs(w / orig.w), Math.abs(h / orig.h), MIN / orig.w, MIN / orig.h);
    w = orig.w * scale;
    h = orig.h * scale;
    if (hasW) x = orig.x + orig.w - w;
    if (hasN) y = orig.y + orig.h - h;
  }

  // Never flip through zero — pin the fixed edge and clamp to a minimum size instead.
  if (w < MIN) {
    if (hasW) x = orig.x + orig.w - MIN;
    w = MIN;
  }
  if (h < MIN) {
    if (hasN) y = orig.y + orig.h - MIN;
    h = MIN;
  }

  return { x, y, w, h };
}
