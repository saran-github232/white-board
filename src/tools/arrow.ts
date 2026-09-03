import { elementBounds } from '../engine/bounds';
import type { Binding, Element } from '../engine/types';

const BINDABLE_TYPES = new Set(['rectangle', 'ellipse', 'diamond', 'triangle', 'sticky']);
const ANCHOR_CANDIDATES = [
  { x: 0.5, y: 0 },
  { x: 1, y: 0.5 },
  { x: 0.5, y: 1 },
  { x: 0, y: 0.5 },
  { x: 0.5, y: 0.5 },
];

function nearestAnchor(fx: number, fy: number) {
  let best = ANCHOR_CANDIDATES[0];
  let bestDist = Infinity;
  for (const c of ANCHOR_CANDIDATES) {
    const d = (c.x - fx) ** 2 + (c.y - fy) ** 2;
    if (d < bestDist) {
      bestDist = d;
      best = c;
    }
  }
  return best;
}

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

/** Find the smallest bindable shape whose (expanded) bounds contain `point`, and its nearest anchor. */
export function findBindingTarget(
  elements: Map<string, Element>,
  point: { x: number; y: number },
  excludeIds: Set<string>,
  snapRadius: number,
): Binding | null {
  let best: { elementId: string; anchor: { x: number; y: number }; area: number } | null = null;
  for (const el of elements.values()) {
    if (excludeIds.has(el.id) || el.locked || !BINDABLE_TYPES.has(el.type)) continue;
    const b = elementBounds(el);
    const minX = b.x - snapRadius;
    const minY = b.y - snapRadius;
    const maxX = b.x + b.w + snapRadius;
    const maxY = b.y + b.h + snapRadius;
    if (point.x < minX || point.x > maxX || point.y < minY || point.y > maxY) continue;
    const fx = b.w === 0 ? 0.5 : (point.x - b.x) / b.w;
    const fy = b.h === 0 ? 0.5 : (point.y - b.y) / b.h;
    const anchor = nearestAnchor(clamp(fx, 0, 1), clamp(fy, 0, 1));
    const area = Math.abs(b.w * b.h) || Infinity;
    if (!best || area < best.area) best = { elementId: el.id, anchor, area };
  }
  return best ? { elementId: best.elementId, anchor: best.anchor } : null;
}

export function resolveBindingPoint(
  binding: Binding | null,
  fallback: { x: number; y: number },
  elements: Map<string, Element>,
): { x: number; y: number } {
  if (!binding) return fallback;
  const target = elements.get(binding.elementId);
  if (!target) return fallback;
  const b = elementBounds(target);
  return { x: b.x + binding.anchor.x * b.w, y: b.y + binding.anchor.y * b.h };
}
