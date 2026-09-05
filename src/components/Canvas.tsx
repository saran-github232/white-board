import { useEffect, useRef, useState } from 'react';
import { useKeyboardShortcuts } from './useKeyboardShortcuts';
import { CREATION_TOOLS, type Editor } from '../engine/editor';
import { type DragMode } from './gestures';
import type { Bounds, Element } from '../engine/types';
import type { HandleId } from '../tools/select';
import { createGestureHandlers } from './gestures';
import { render } from '../engine/renderer';
import { drawSelectionOverlay } from '../engine/overlay';
import { ContextMenu } from './ContextMenu';
import { TextEditorOverlay } from './TextEditorOverlay';

const BACKGROUND = '#ffffff';


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
  useKeyboardShortcuts(editor, spaceHeldRef, setContextMenu);

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
  const gesture = createGestureHandlers({
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
  });
  const { worldFromEvent, screenFromEvent, hitTest, onPointerDown, onPointerMove, onPointerUp, onPointerCancel } = gesture;


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
