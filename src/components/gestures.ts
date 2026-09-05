import type React from 'react';
import { translateElement, type Editor } from "../engine/editor";
import { boundsCenter, elementBounds, rotationOf, unionBounds } from '../engine/bounds';
import { rectsIntersect } from '../engine/geometry';
import { isLineArrow, type Bounds, type Element, type Point } from '../engine/types';
import { shouldAddPoint } from '../tools/pen';
import { elementHitByEraser } from '../tools/eraser';
import {
  cursorForHandle,
  getHandles,
  hitTestElement,
  RESIZE_HANDLES,
  resizeBounds,
} from '../tools/select';
import type { HandleId } from '../tools/select';
import { scaleElement, scaleForHandle } from '../tools/transform';
import { findBindingTarget } from '../tools/arrow';

export type DragMode =
  | 'freehand-draw'
  | 'erase'
  | 'shape-draw'
  | 'arrow-draw'
  | 'move'
  | 'resize'
  | 'rotate'
  | 'marquee'
  | null;

export interface GestureContext {
  editor: Editor;
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  spaceHeldRef: React.RefObject<boolean>;
  liveElementRef: React.RefObject<Element | null>;
  erasingIdsRef: React.RefObject<Set<string>>;
  activePointerIdRef: React.RefObject<number | null>;
  panningRef: React.RefObject<boolean>;
  pointersRef: React.RefObject<Map<number, { x: number; y: number }>>;
  pinchRef: React.RefObject<{ startDist: number; startZoom: number } | null>;
  dragModeRef: React.RefObject<DragMode>;
  dragStartWorldRef: React.RefObject<{ x: number; y: number } | null>;
  activeHandleRef: React.RefObject<HandleId | null>;
  transformBeforeRef: React.RefObject<Map<string, Element> | null>;
  resizeOrigBoundsRef: React.RefObject<Bounds | null>;
  rotateStartRef: React.RefObject<{ angle0: number; elRotation0: number; center: { x: number; y: number } } | null>;
  marqueeRef: React.RefObject<Bounds | null>;
  contextMenu: { x: number; y: number; ids: string[] } | null;
  setContextMenu: (menu: { x: number; y: number; ids: string[] } | null) => void;
  requestRedraw: () => void;
  updateCursor: (override?: string) => void;
}

export function createGestureHandlers(ctx: GestureContext) {
  const {
    editor,
    canvasRef,
    spaceHeldRef,
    liveElementRef,
    erasingIdsRef,
    activePointerIdRef,
    panningRef,
    pointersRef,
    pinchRef,
    dragModeRef,
    dragStartWorldRef,
    activeHandleRef,
    transformBeforeRef,
    resizeOrigBoundsRef,
    rotateStartRef,
    marqueeRef,
    contextMenu,
    setContextMenu,
    requestRedraw,
    updateCursor,
  } = ctx;

  const getPressure = (e: React.PointerEvent) => {
    if (e.pointerType === 'pen') return e.pressure > 0 ? e.pressure : 0.5;
    return 0.5;
  };

  const worldFromEvent = (e: React.PointerEvent | React.MouseEvent): Point => {
    const rect = canvasRef.current!.getBoundingClientRect();
    const world = editor.camera.screenToWorld(e.clientX - rect.left, e.clientY - rect.top);
    return { x: world.x, y: world.y, pressure: 'pressure' in e ? getPressure(e as React.PointerEvent) : 0.5 };
  };

  const screenFromEvent = (e: React.PointerEvent | React.MouseEvent) => {
    const rect = canvasRef.current!.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const hitTest = (world: { x: number; y: number }, tolerance: number): string | null => {
    for (let i = editor.order.length - 1; i >= 0; i--) {
      const el = editor.elements.get(editor.order[i]);
      if (el && hitTestElement(el, world, tolerance)) return el.id;
    }
    return null;
  };

  const selectionBoundsAndRotation = (): { bounds: Bounds; rotation: number; locked: boolean } | null => {
    const selected = [...editor.selection]
      .map((id) => editor.elements.get(id))
      .filter((e): e is Element => !!e);
    if (selected.length === 0) return null;
    const locked = selected.every((e) => e.locked);
    if (selected.length === 1) {
      return { bounds: elementBounds(selected[0]), rotation: rotationOf(selected[0]), locked };
    }
    return { bounds: unionBounds(selected.map(elementBounds)), rotation: 0, locked };
  };

  const hitTestHandle = (screenPt: { x: number; y: number }): HandleId | null => {
    const info = selectionBoundsAndRotation();
    if (!info || info.locked) return null;
    const isSingle = editor.selection.size === 1;
    const single = isSingle ? editor.elements.get([...editor.selection][0]) : null;
    const canRotate =
      isSingle &&
      single &&
      (single.type === 'rectangle' ||
        single.type === 'ellipse' ||
        single.type === 'diamond' ||
        single.type === 'triangle' ||
        single.type === 'sticky');
    const handles = getHandles(info.bounds, info.rotation, editor.camera.zoom);
    const order: HandleId[] = canRotate ? ['rotate', ...RESIZE_HANDLES] : [...RESIZE_HANDLES];
    for (const id of order) {
      const p = editor.camera.worldToScreen(handles[id].x, handles[id].y);
      if (Math.hypot(p.x - screenPt.x, p.y - screenPt.y) <= 10) return id;
    }
    return null;
  };

  const eraseAt = (pos: Point) => {
    const radius = editor.eraserSize / 2 / editor.camera.zoom;
    let changed = false;
    for (const el of editor.elements.values()) {
      if (!erasingIdsRef.current.has(el.id) && !el.locked && elementHitByEraser(el, pos, radius)) {
        erasingIdsRef.current.add(el.id);
        changed = true;
      }
    }
    if (changed) requestRedraw();
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (contextMenu) setContextMenu(null);
    canvasRef.current?.setPointerCapture(e.pointerId);
    const rect = canvasRef.current!.getBoundingClientRect();
    pointersRef.current.set(e.pointerId, { x: e.clientX - rect.left, y: e.clientY - rect.top });

    if (pointersRef.current.size === 2) {
      liveElementRef.current = null;
      dragModeRef.current = null;
      panningRef.current = false;
      activePointerIdRef.current = null;
      const pts = [...pointersRef.current.values()];
      pinchRef.current = {
        startDist: Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y),
        startZoom: editor.camera.zoom,
      };
      return;
    }

    const wantsPan = e.button === 1 || spaceHeldRef.current || editor.tool === 'hand';
    if (wantsPan) {
      panningRef.current = true;
      activePointerIdRef.current = e.pointerId;
      updateCursor();
      return;
    }

    if (e.button !== 0 && e.pointerType === 'mouse') return;

    activePointerIdRef.current = e.pointerId;
    dragModeRef.current = null;
    const world = worldFromEvent(e);
    const zoom = editor.camera.zoom;
    dragStartWorldRef.current = world;

    if (editor.tool === 'pen') {
      liveElementRef.current = editor.createFreehand(world);
      dragModeRef.current = 'freehand-draw';
      requestRedraw();
      return;
    }

    if (editor.tool === 'eraser') {
      erasingIdsRef.current = new Set();
      dragModeRef.current = 'erase';
      eraseAt(world);
      return;
    }

    if (editor.tool === 'rectangle' || editor.tool === 'ellipse' || editor.tool === 'diamond' || editor.tool === 'triangle') {
      dragModeRef.current = 'shape-draw';
      liveElementRef.current = editor.createShape(editor.tool, world.x, world.y, 0, 0);
      requestRedraw();
      return;
    }

    if (editor.tool === 'line' || editor.tool === 'arrow') {
      dragModeRef.current = 'arrow-draw';
      const el = editor.createLineArrow(editor.tool, [
        { x: world.x, y: world.y },
        { x: world.x, y: world.y },
      ]);
      if (el.type === 'arrow') {
        el.startBinding = findBindingTarget(editor.elements, world, new Set([el.id]), 12 / zoom);
      }
      liveElementRef.current = el;
      requestRedraw();
      return;
    }

    if (editor.tool === 'text') {
      const el = editor.createText(world.x, world.y);
      editor.addElement(el);
      editor.startEditingText(el.id);
      activePointerIdRef.current = null;
      return;
    }

    if (editor.tool === 'sticky') {
      const el = editor.createSticky(world.x - 90, world.y - 90);
      editor.addElement(el);
      editor.startEditingText(el.id);
      activePointerIdRef.current = null;
      return;
    }

    if (editor.tool === 'select') {
      const screenPt = screenFromEvent(e);
      const handle = hitTestHandle(screenPt);
      if (handle) {
        const info = selectionBoundsAndRotation()!;
        transformBeforeRef.current = editor.snapshotElements(editor.selection);
        resizeOrigBoundsRef.current = info.bounds;
        activeHandleRef.current = handle;
        if (handle === 'rotate') {
          dragModeRef.current = 'rotate';
          const c = boundsCenter(info.bounds);
          rotateStartRef.current = {
            angle0: Math.atan2(world.y - c.y, world.x - c.x),
            elRotation0: info.rotation,
            center: c,
          };
        } else {
          dragModeRef.current = 'resize';
        }
        requestRedraw();
        return;
      }

      const tolerance = 6 / zoom;
      const hitId = hitTest(world, tolerance);
      if (hitId) {
        const groupIds = editor.expandToGroup([hitId]);
        if (e.shiftKey) editor.select(groupIds, true);
        else if (!editor.selection.has(hitId)) editor.select(groupIds);

        const allLocked = [...editor.selection].every((id) => editor.elements.get(id)?.locked);
        if (!allLocked) {
          for (const id of editor.selection) {
            const el = editor.elements.get(id);
            if (el && (el.type === 'line' || el.type === 'arrow')) {
              el.startBinding = null;
              el.endBinding = null;
            }
          }
          transformBeforeRef.current = editor.snapshotElements(editor.selection);
          dragModeRef.current = 'move';
        }
        requestRedraw();
      } else {
        if (!e.shiftKey) editor.clearSelection();
        dragModeRef.current = 'marquee';
        marqueeRef.current = { x: world.x, y: world.y, w: 0, h: 0 };
        requestRedraw();
      }
    }
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (pointersRef.current.has(e.pointerId)) {
      const rect = canvasRef.current!.getBoundingClientRect();
      pointersRef.current.set(e.pointerId, { x: e.clientX - rect.left, y: e.clientY - rect.top });
    }

    if (pinchRef.current && pointersRef.current.size === 2) {
      const pts = [...pointersRef.current.values()];
      const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      const midX = (pts[0].x + pts[1].x) / 2;
      const midY = (pts[0].y + pts[1].y) / 2;
      const targetZoom = pinchRef.current.startZoom * (dist / pinchRef.current.startDist);
      editor.camera.zoomAt(midX, midY, targetZoom / editor.camera.zoom);
      requestRedraw();
      editor.emit();
      return;
    }

    if (panningRef.current && e.pointerId === activePointerIdRef.current) {
      editor.camera.pan(e.movementX, e.movementY);
      requestRedraw();
      editor.emit();
      return;
    }

    if (!dragModeRef.current && !panningRef.current && editor.tool === 'select' && canvasRef.current) {
      const screenPt = screenFromEvent(e);
      const handle = hitTestHandle(screenPt);
      if (handle) {
        updateCursor(cursorForHandle(handle));
      } else {
        const world = worldFromEvent(e);
        updateCursor(hitTest(world, 6 / editor.camera.zoom) ? 'move' : 'default');
      }
    }

    if (e.pointerId !== activePointerIdRef.current) return;

    const world = worldFromEvent(e);
    const zoom = editor.camera.zoom;

    switch (dragModeRef.current) {
      case 'freehand-draw': {
        const el = liveElementRef.current;
        if (el?.type === 'freehand' && shouldAddPoint(el.points, world, zoom)) {
          el.points.push(world);
          requestRedraw();
        }
        break;
      }
      case 'erase':
        eraseAt(world);
        break;
      case 'shape-draw': {
        const el = liveElementRef.current;
        const start = dragStartWorldRef.current;
        if (el && start && (el.type === 'rectangle' || el.type === 'ellipse' || el.type === 'diamond' || el.type === 'triangle')) {
          el.x = Math.min(start.x, world.x);
          el.y = Math.min(start.y, world.y);
          el.w = Math.abs(world.x - start.x);
          el.h = Math.abs(world.y - start.y);
          requestRedraw();
        }
        break;
      }
      case 'arrow-draw': {
        const el = liveElementRef.current;
        if (el && (el.type === 'line' || el.type === 'arrow')) {
          el.points[el.points.length - 1] = { x: world.x, y: world.y };
          if (el.type === 'arrow') {
            el.endBinding = findBindingTarget(editor.elements, world, new Set([el.id]), 12 / zoom);
          }
          requestRedraw();
        }
        break;
      }
      case 'move': {
        const dx = e.movementX / zoom;
        const dy = e.movementY / zoom;
        for (const id of editor.selection) {
          const el = editor.elements.get(id);
          if (el && !el.locked) translateElement(el, dx, dy);
        }
        editor.touch();
        break;
      }
      case 'resize': {
        const handle = activeHandleRef.current;
        const orig = resizeOrigBoundsRef.current;
        const before = transformBeforeRef.current;
        const start = dragStartWorldRef.current;
        if (!handle || !orig || !before || !start) break;
        const selectedIds = [...editor.selection];
        const singleEl = selectedIds.length === 1 ? editor.elements.get(selectedIds[0]) : null;
        const rotation = singleEl ? rotationOf(singleEl) : 0;
        const totalDx = world.x - start.x;
        const totalDy = world.y - start.y;
        const cos = Math.cos(-rotation);
        const sin = Math.sin(-rotation);
        const localDx = totalDx * cos - totalDy * sin;
        const localDy = totalDx * sin + totalDy * cos;
        const nextBounds = resizeBounds(orig, handle, localDx, localDy, e.shiftKey);
        const { anchor, sx, sy } = scaleForHandle(orig, nextBounds, handle);
        for (const id of selectedIds) {
          const snap = before.get(id);
          const el = editor.elements.get(id);
          if (!snap || !el || el.locked) continue;
          Object.assign(el, structuredClone(snap));
          scaleElement(el, anchor, sx, sy);
        }
        editor.touch();
        break;
      }
      case 'rotate': {
        const rs = rotateStartRef.current;
        const before = transformBeforeRef.current;
        if (!rs || !before) break;
        const angleNow = Math.atan2(world.y - rs.center.y, world.x - rs.center.x);
        let newRotation = rs.elRotation0 + (angleNow - rs.angle0);
        if (e.shiftKey) {
          const step = Math.PI / 12;
          newRotation = Math.round(newRotation / step) * step;
        }
        for (const id of editor.selection) {
          const el = editor.elements.get(id);
          if (el && !el.locked && 'rotation' in el) el.rotation = newRotation;
        }
        editor.touch();
        break;
      }
      case 'marquee': {
        const start = dragStartWorldRef.current;
        if (!start) break;
        marqueeRef.current = {
          x: Math.min(start.x, world.x),
          y: Math.min(start.y, world.y),
          w: Math.abs(world.x - start.x),
          h: Math.abs(world.y - start.y),
        };
        requestRedraw();
        break;
      }
    }
  };

  const revertTransform = () => {
    const before = transformBeforeRef.current;
    if (!before) return;
    for (const [id, snap] of before) {
      const el = editor.elements.get(id);
      if (el) Object.assign(el, structuredClone(snap));
    }
    editor.touch();
  };

  const finishGesture = (e: React.PointerEvent, commit: boolean) => {
    pointersRef.current.delete(e.pointerId);
    if (pointersRef.current.size < 2) pinchRef.current = null;

    if (e.pointerId !== activePointerIdRef.current) return;

    if (panningRef.current) {
      panningRef.current = false;
      updateCursor();
      activePointerIdRef.current = null;
      requestRedraw();
      return;
    }

    const mode = dragModeRef.current;
    dragModeRef.current = null;

    switch (mode) {
      case 'freehand-draw': {
        const el = liveElementRef.current;
        liveElementRef.current = null;
        if (commit && el?.type === 'freehand' && el.points.length > 0) editor.addElement(el);
        break;
      }
      case 'erase': {
        if (commit && erasingIdsRef.current.size > 0) editor.removeElements([...erasingIdsRef.current]);
        erasingIdsRef.current = new Set();
        break;
      }
      case 'shape-draw': {
        const el = liveElementRef.current;
        liveElementRef.current = null;
        if (commit && el && el.type !== 'freehand' && !isLineArrow(el) && el.type !== 'text' && el.type !== 'sticky') {
          if (el.w > 2 && el.h > 2) {
            editor.addElement(el);
            editor.afterCreate([el.id]);
          }
        }
        break;
      }
      case 'arrow-draw': {
        const el = liveElementRef.current;
        liveElementRef.current = null;
        if (commit && el && (el.type === 'line' || el.type === 'arrow')) {
          const dx = el.points[1].x - el.points[0].x;
          const dy = el.points[1].y - el.points[0].y;
          if (Math.hypot(dx, dy) > 2) {
            editor.addElement(el);
            editor.afterCreate([el.id]);
          }
        }
        break;
      }
      case 'move':
        if (commit) editor.commitTransform(transformBeforeRef.current ?? new Map());
        else revertTransform();
        transformBeforeRef.current = null;
        break;
      case 'resize':
      case 'rotate':
        if (commit) editor.commitTransform(transformBeforeRef.current ?? new Map());
        else revertTransform();
        transformBeforeRef.current = null;
        resizeOrigBoundsRef.current = null;
        rotateStartRef.current = null;
        activeHandleRef.current = null;
        break;
      case 'marquee': {
        const m = marqueeRef.current;
        marqueeRef.current = null;
        if (commit && m && (m.w > 2 || m.h > 2)) {
          const hits: string[] = [];
          for (const id of editor.order) {
            const el = editor.elements.get(id);
            if (el && rectsIntersect(m, elementBounds(el))) hits.push(id);
          }
          editor.select(editor.expandToGroup(hits), e.shiftKey);
        }
        break;
      }
    }

    activePointerIdRef.current = null;
    requestRedraw();
  };

  const onPointerUp = (e: React.PointerEvent) => finishGesture(e, true);
  const onPointerCancel = (e: React.PointerEvent) => finishGesture(e, false);

  return {
    worldFromEvent,
    screenFromEvent,
    hitTest,
    hitTestHandle,
    eraseAt,
    onPointerDown,
    onPointerMove,
    onPointerUp,
    onPointerCancel,
  };
}
