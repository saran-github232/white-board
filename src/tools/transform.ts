import { isLineArrow, type Element } from '../engine/types';

/** Uniformly scale any element type around a fixed world-space anchor point. Works for all element kinds. */
export function scaleElement(el: Element, anchor: { x: number; y: number }, sx: number, sy: number) {
  const scalePt = (x: number, y: number) => ({
    x: anchor.x + (x - anchor.x) * sx,
    y: anchor.y + (y - anchor.y) * sy,
  });

  if (el.type === 'freehand' || isLineArrow(el)) {
    for (const p of el.points) {
      const np = scalePt(p.x, p.y);
      p.x = np.x;
      p.y = np.y;
    }
    const avgScale = (Math.abs(sx) + Math.abs(sy)) / 2;
    if (el.type === 'freehand') el.size = Math.max(0.5, el.size * avgScale);
    else el.strokeWidth = Math.max(0.5, el.strokeWidth * avgScale);
    return;
  }

  if (el.type === 'text') {
    const p1 = scalePt(el.x, el.y);
    el.x = p1.x;
    el.y = p1.y;
    el.width = Math.max(20, el.width * Math.abs(sx));
    el.fontSize = Math.max(6, el.fontSize * Math.abs(sy));
    el.height = el.fontSize * el.lineHeight;
    return;
  }

  // rectangle / ellipse / diamond / triangle / sticky
  const p1 = scalePt(el.x, el.y);
  el.x = p1.x;
  el.y = p1.y;
  el.w = Math.max(4, el.w * Math.abs(sx));
  el.h = Math.max(4, el.h * Math.abs(sy));
}

/** Anchor + scale factors for dragging one resize handle of a bounding box. */
export function scaleForHandle(
  orig: { x: number; y: number; w: number; h: number },
  next: { x: number; y: number; w: number; h: number },
  handle: string,
): { anchor: { x: number; y: number }; sx: number; sy: number } {
  const anchor = {
    x: handle.includes('w') ? orig.x + orig.w : orig.x,
    y: handle.includes('n') ? orig.y + orig.h : orig.y,
  };
  const sx = orig.w === 0 ? 1 : next.w / orig.w;
  const sy = orig.h === 0 ? 1 : next.h / orig.h;
  return { anchor, sx, sy };
}
