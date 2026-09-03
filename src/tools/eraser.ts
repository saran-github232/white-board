import { elementBounds } from '../engine/bounds';
import { distanceToSegment } from '../engine/geometry';
import type { Element, Point } from '../engine/types';

/** True if the eraser circle at `pos` (world space) touches this element. */
export function elementHitByEraser(el: Element, pos: Point, eraserRadius: number): boolean {
  if (el.type === 'freehand') {
    const threshold = eraserRadius + el.size / 2;
    if (el.points.length === 1) {
      return Math.hypot(pos.x - el.points[0].x, pos.y - el.points[0].y) <= threshold;
    }
    for (let i = 0; i < el.points.length - 1; i++) {
      if (distanceToSegment(pos, el.points[i], el.points[i + 1]) <= threshold) return true;
    }
    return false;
  }
  if (el.type === 'line' || el.type === 'arrow') {
    const threshold = eraserRadius + el.strokeWidth / 2;
    for (let i = 0; i < el.points.length - 1; i++) {
      if (distanceToSegment(pos, el.points[i], el.points[i + 1]) <= threshold) return true;
    }
    return false;
  }
  const b = elementBounds(el);
  return (
    pos.x >= b.x - eraserRadius &&
    pos.x <= b.x + b.w + eraserRadius &&
    pos.y >= b.y - eraserRadius &&
    pos.y <= b.y + b.h + eraserRadius
  );
}
