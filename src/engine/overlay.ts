import { boundsCenter, elementBounds, rotationOf, unionBounds } from './bounds';
import { getHandles, RESIZE_HANDLES } from '../tools/select';
import type { Camera } from './camera';
import type { Element } from './types';

const SELECT_COLOR = '#1971c2';

/** Draws selection outlines + resize/rotate handles in screen space so they stay a constant size at any zoom. */
export function drawSelectionOverlay(
  ctx: CanvasRenderingContext2D,
  camera: Camera,
  dpr: number,
  selected: Element[],
  marquee: { x: number; y: number; w: number; h: number } | null,
) {
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.save();
  ctx.strokeStyle = SELECT_COLOR;
  ctx.lineWidth = 1.5;

  if (selected.length === 1) {
    const el = selected[0];
    const b = elementBounds(el);
    const rotation = rotationOf(el);
    const corners = [
      { x: b.x, y: b.y },
      { x: b.x + b.w, y: b.y },
      { x: b.x + b.w, y: b.y + b.h },
      { x: b.x, y: b.y + b.h },
    ].map((p) => rotateAround(p, boundsCenter(b), rotation)).map((p) => camera.worldToScreen(p.x, p.y));

    ctx.beginPath();
    corners.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
    ctx.closePath();
    ctx.stroke();

    if (!el.locked) {
      const handles = getHandles(b, rotation, camera.zoom);
      const canRotate = el.type === 'rectangle' || el.type === 'ellipse' || el.type === 'diamond' || el.type === 'triangle' || el.type === 'sticky';
      if (canRotate) {
        const rotateScreen = camera.worldToScreen(handles.rotate.x, handles.rotate.y);
        const topMidScreen = camera.worldToScreen((corners[0].x + corners[1].x) / 2, (corners[0].y + corners[1].y) / 2);
        ctx.beginPath();
        ctx.moveTo(topMidScreen.x, topMidScreen.y);
        ctx.lineTo(rotateScreen.x, rotateScreen.y);
        ctx.stroke();
        drawHandleDot(ctx, rotateScreen.x, rotateScreen.y, true);
      }

      for (const id of RESIZE_HANDLES) {
        const p = camera.worldToScreen(handles[id].x, handles[id].y);
        drawHandleDot(ctx, p.x, p.y, false);
      }
    }
  } else if (selected.length > 1) {
    const overall = unionBounds(selected.map(elementBounds));
    const topLeft = camera.worldToScreen(overall.x, overall.y);
    const bottomRight = camera.worldToScreen(overall.x + overall.w, overall.y + overall.h);
    ctx.setLineDash([4, 4]);
    ctx.strokeRect(topLeft.x, topLeft.y, bottomRight.x - topLeft.x, bottomRight.y - topLeft.y);
    ctx.setLineDash([]);

    const anyLocked = selected.every((e) => e.locked);
    if (!anyLocked) {
      const b = { x: overall.x, y: overall.y, w: overall.w, h: overall.h };
      const handles = getHandles(b, 0, camera.zoom);
      for (const id of RESIZE_HANDLES) {
        const p = camera.worldToScreen(handles[id].x, handles[id].y);
        drawHandleDot(ctx, p.x, p.y, false);
      }
    }
  }

  if (marquee) {
    const a = camera.worldToScreen(marquee.x, marquee.y);
    const b = camera.worldToScreen(marquee.x + marquee.w, marquee.y + marquee.h);
    ctx.fillStyle = 'rgba(25,113,194,0.08)';
    ctx.fillRect(a.x, a.y, b.x - a.x, b.y - a.y);
    ctx.strokeRect(a.x, a.y, b.x - a.x, b.y - a.y);
  }

  ctx.restore();
}

function drawHandleDot(ctx: CanvasRenderingContext2D, x: number, y: number, round: boolean) {
  ctx.save();
  ctx.fillStyle = '#ffffff';
  ctx.strokeStyle = SELECT_COLOR;
  ctx.lineWidth = 1.5;
  const size = 8;
  if (round) {
    ctx.beginPath();
    ctx.arc(x, y, size / 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  } else {
    ctx.beginPath();
    ctx.rect(x - size / 2, y - size / 2, size, size);
    ctx.fill();
    ctx.stroke();
  }
  ctx.restore();
}

function rotateAround(p: { x: number; y: number }, c: { x: number; y: number }, angle: number) {
  if (angle === 0) return p;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const dx = p.x - c.x;
  const dy = p.y - c.y;
  return { x: c.x + dx * cos - dy * sin, y: c.y + dx * sin + dy * cos };
}
