import type { Bounds, Element } from './types';

export function elementBounds(el: Element): Bounds {
  switch (el.type) {
    case 'freehand': {
      if (el.points.length === 0) return { x: 0, y: 0, w: 0, h: 0 };
      let minX = Infinity;
      let minY = Infinity;
      let maxX = -Infinity;
      let maxY = -Infinity;
      for (const p of el.points) {
        if (p.x < minX) minX = p.x;
        if (p.x > maxX) maxX = p.x;
        if (p.y < minY) minY = p.y;
        if (p.y > maxY) maxY = p.y;
      }
      const pad = el.size / 2 + 1;
      return { x: minX - pad, y: minY - pad, w: maxX - minX + pad * 2, h: maxY - minY + pad * 2 };
    }
    case 'rectangle':
    case 'ellipse':
    case 'diamond':
    case 'triangle':
      return { x: el.x, y: el.y, w: el.w, h: el.h };
    case 'line':
    case 'arrow': {
      const xs = el.points.map((p) => p.x);
      const ys = el.points.map((p) => p.y);
      const minX = Math.min(...xs);
      const maxX = Math.max(...xs);
      const minY = Math.min(...ys);
      const maxY = Math.max(...ys);
      const pad = el.strokeWidth + 4;
      return { x: minX - pad, y: minY - pad, w: maxX - minX + pad * 2, h: maxY - minY + pad * 2 };
    }
    case 'text':
      return { x: el.x, y: el.y, w: el.width, h: el.height };
    case 'sticky':
      return { x: el.x, y: el.y, w: el.w, h: el.h };
  }
}

export function rotationOf(el: Element): number {
  return el.type === 'rectangle' ||
    el.type === 'ellipse' ||
    el.type === 'diamond' ||
    el.type === 'triangle' ||
    el.type === 'sticky'
    ? el.rotation
    : 0;
}

export function unionBounds(list: Bounds[]): Bounds {
  if (list.length === 0) return { x: 0, y: 0, w: 0, h: 0 };
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const b of list) {
    minX = Math.min(minX, b.x);
    minY = Math.min(minY, b.y);
    maxX = Math.max(maxX, b.x + b.w);
    maxY = Math.max(maxY, b.y + b.h);
  }
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

export function boundsCenter(b: Bounds): { x: number; y: number } {
  return { x: b.x + b.w / 2, y: b.y + b.h / 2 };
}
