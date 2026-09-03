import { useEffect, useRef, useState } from 'react';
import { CREATION_TOOLS, translateElement, type Editor } from '../engine/editor';
import { render } from '../engine/renderer';
import { drawSelectionOverlay } from '../engine/overlay';
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
import { ContextMenu } from './ContextMenu';
import { TextEditorOverlay } from './TextEditorOverlay';

const BACKGROUND = '#ffffff';

type DragMode =
  | 'freehand-draw'
  | 'erase'
  | 'shape-draw'
  | 'arrow-draw'
  | 'move'
  | 'resize'
  | 'rotate'
  | 'marquee'
  | null;

export function Canvas({ editor }: { editor: Editor }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const liveElementRef = useRef<Element | null>(null);
  const erasingIdsRef = useRef<Set<string>>(new Set());
  const activePointerIdRef = useRef<number | null>(null);
  const panningRef = useRef(false);
  const spaceHeldRef = useRef(false);
  const pointersRef = useRef<Map<number, { x: number; y: number }>>(new Map());
  const pinchRef = useRef<{ startDist: number; startZoom: number } | null>(null);
  const dirtyRef = useRef(true);

  const dragModeRef = useRef<DragMode>(null);
  const dragStartWorldRef = useRef<{ x: number; y: number } | null>(null);
  const activeHandleRef = useRef<HandleId | null>(null);
  const transformBeforeRef = useRef<Map<string, Element> | null>(null);
  const resizeOrigBoundsRef = useRef<Bounds | null>(null);
  const rotateStartRef = useRef<{ angle0: number; elRotation0: number; center: { x: number; y: number } } | null>(
    null,
  );
  const marqueeRef = useRef<Bounds | null>(null);

  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; ids: string[] } | null>(null);

  const requestRedraw = () => {
    dirtyRef.current = true;
  };

  const updateCursor = (override?: string) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    if (override) {
      canvas.style.cursor = override;
      return;
    }
    if (panningRef.current) canvas.style.cursor = 'grabbing';
    else if (editor.tool === 'hand') canvas.style.cursor = 'grab';
    else if (editor.tool === 'select') canvas.style.cursor = 'default';
    else canvas.style.cursor = 'crosshair';
  };

  // Resize: keep backing store in sync with CSS size and DPR.
  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;

    const resize = () => {
      const rect = container.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.max(1, Math.round(rect.width * dpr));
      canvas.height = Math.max(1, Math.round(rect.height * dpr));
      canvas.style.width = `${rect.width}px`;
      canvas.style.height = `${rect.height}px`;
      editor.camera.viewportWidth = rect.width;
      editor.camera.viewportHeight = rect.height;
      requestRedraw();
    };

    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(container);
    return () => observer.disconnect();
  }, [editor]);

  // Render loop.
  useEffect(() => {
    let raf = 0;
    const loop = () => {
      if (dirtyRef.current && canvasRef.current) {
        dirtyRef.current = false;
        const ctx = canvasRef.current.getContext('2d');
        if (ctx) {
          const dpr = window.devicePixelRatio || 1;
          render(
            ctx,
            editor.camera,
            dpr,
            editor.elements,
            editor.order,
            erasingIdsRef.current,
            liveElementRef.current,
            BACKGROUND,
          );
          if (editor.tool === 'select' && !editor.editingTextId) {
            const selected = [...editor.selection]
              .map((id) => editor.elements.get(id))
              .filter((e): e is Element => !!e);
            drawSelectionOverlay(ctx, editor.camera, dpr, selected, marqueeRef.current);
          }
        }
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    const unsubscribe = editor.subscribe(() => {
      requestRedraw();
      updateCursor();
    });
    updateCursor();
    return () => {
      cancelAnimationFrame(raf);
      unsubscribe();
    };
  }, [editor]);

  // Keyboard shortcuts.
  useEffect(() => {
    const isTypingTarget = (el: EventTarget | null) =>
      el instanceof HTMLElement && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable);

    const onKeyDown = (e: KeyboardEvent) => {
      if (isTypingTarget(e.target)) return;
      if (e.code === 'Space') {
        spaceHeldRef.current = true;
        e.preventDefault();
        return;
      }
      const mod = e.ctrlKey || e.metaKey;
      if (mod) {
        switch (e.key.toLowerCase()) {
          case 'z':
            e.preventDefault();
            if (e.shiftKey) editor.history.redo();
            else editor.history.undo();
            return;
          case 'y':
            e.preventDefault();
            editor.history.redo();
            return;
          case 'c':
            e.preventDefault();
            editor.copy();
            return;
          case 'x':
            e.preventDefault();
            editor.cut();
            return;
          case 'v':
            e.preventDefault();
            editor.paste();
            return;
          case 'd':
            e.preventDefault();
            editor.duplicateSelection();
            return;
          case 'a':
            e.preventDefault();
            editor.selectAll();
            return;
          case 'g':
            e.preventDefault();
            if (e.shiftKey) editor.ungroup([...editor.selection]);
            else editor.group([...editor.selection]);
            return;
        }
      }
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (editor.selection.size > 0) {
          e.preventDefault();
          editor.deleteSelection();
        }
        return;
      }
      if (e.key === 'Escape') {
        setContextMenu(null);
        if (editor.selection.size > 0) editor.clearSelection();
        else if (editor.tool !== 'select') editor.setTool('select');
        return;
      }
      switch (e.key.toLowerCase()) {
        case 'v':
          editor.setTool('select');
          break;
        case 'h':
          editor.setTool('hand');
          break;
        case 'p':
          editor.setTool('pen');
          break;
        case 'e':
          editor.setTool('eraser');
          break;
        case 'r':
          editor.setTool('rectangle');
          break;
        case 'o':
          editor.setTool('ellipse');
          break;
        case 'd':
          editor.setTool('diamond');
          break;
        case 'l':
          editor.setTool('line');
          break;
        case 'a':
          editor.setTool('arrow');
          break;
        case 't':
          editor.setTool('text');
          break;
        case 'n':
          editor.setTool('sticky');
          break;
        case '0':
          editor.resetView();
          break;
        case '1':
          editor.zoomToFitAll();
          break;
        case '+':
        case '=':
          editor.camera.zoomAt(editor.camera.viewportWidth / 2, editor.camera.viewportHeight / 2, 1.2);
          editor.emit();
          break;
        case '-':
          editor.camera.zoomAt(editor.camera.viewportWidth / 2, editor.camera.viewportHeight / 2, 1 / 1.2);
          editor.emit();
          break;
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space') spaceHeldRef.current = false;
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, [editor]);

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

  const onDoubleClick = (e: React.MouseEvent) => {
    if (editor.tool !== 'select' && !CREATION_TOOLS.has(editor.tool)) return;
    const world = worldFromEvent(e);
    const hitId = hitTest(world, 6 / editor.camera.zoom);
    if (!hitId) return;
    const el = editor.elements.get(hitId);
    if (el && (el.type === 'text' || el.type === 'sticky') && !el.locked) {
      editor.select([hitId]);
      editor.startEditingText(hitId);
    }
  };

  const onWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const { x, y } = screenFromEvent(e);
    if (e.ctrlKey || e.metaKey) {
      const factor = Math.exp(-e.deltaY * 0.01);
      editor.camera.zoomAt(x, y, factor);
    } else {
      editor.camera.pan(-e.deltaX, -e.deltaY);
    }
    requestRedraw();
    editor.emit();
  };

  const onContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    if (editor.tool !== 'select') return;
    const world = worldFromEvent(e);
    const hitId = hitTest(world, 6 / editor.camera.zoom);
    let ids = [...editor.selection];
    if (hitId) {
      const groupIds = editor.expandToGroup([hitId]);
      if (!editor.selection.has(hitId)) {
        editor.select(groupIds);
        ids = groupIds;
      }
    }
    setContextMenu({ x: e.clientX, y: e.clientY, ids });
  };

  return (
    <div ref={containerRef} className="canvas-container">
      <canvas
        ref={canvasRef}
        style={{ touchAction: 'none' }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
        onDoubleClick={onDoubleClick}
        onWheel={onWheel}
        onContextMenu={onContextMenu}
      />
      <TextEditorOverlay editor={editor} />
      {contextMenu && (
        <ContextMenu
          editor={editor}
          x={contextMenu.x}
          y={contextMenu.y}
          ids={contextMenu.ids}
          onClose={() => setContextMenu(null)}
        />
      )}
    </div>
  );
}
