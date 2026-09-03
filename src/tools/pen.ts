import type { Point } from '../engine/types';

/** Minimum world-space distance between recorded points, scaled by zoom so it feels consistent on screen. */
export function minPointDistance(zoom: number): number {
  return 1.5 / zoom;
}

export function shouldAddPoint(points: Point[], next: Point, zoom: number): boolean {
  if (points.length === 0) return true;
  const last = points[points.length - 1];
  const dx = next.x - last.x;
  const dy = next.y - last.y;
  return dx * dx + dy * dy >= minPointDistance(zoom) ** 2;
}
