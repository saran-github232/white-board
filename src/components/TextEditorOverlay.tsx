import { useEffect, useRef } from 'react';
import { useSyncExternalStore } from 'react';
import type { Editor } from '../engine/editor';
import type { Element } from '../engine/types';

export function TextEditorOverlay({ editor }: { editor: Editor }) {
  useSyncExternalStore(editor.subscribe, () => editor.version);
  const beforeRef = useRef<Element | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const id = editor.editingTextId;
  const el = id ? editor.elements.get(id) : null;

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (id && el) {
      beforeRef.current = structuredClone(el);
      const raf = requestAnimationFrame(() => {
        textareaRef.current?.focus();
        textareaRef.current?.select();
      });
      return () => cancelAnimationFrame(raf);
    }
  }, [id]);

  if (!id || !el || (el.type !== 'text' && el.type !== 'sticky')) return null;

  const camera = editor.camera;
  const isSticky = el.type === 'sticky';
  const pad = isSticky ? 12 : 0;
  const screen = camera.worldToScreen(el.x + pad, el.y + pad);
  const width = ((isSticky ? el.w : el.width) - pad * 2) * camera.zoom;
  const height = ((isSticky ? el.h : el.height) - pad * 2) * camera.zoom;
  const fontSize = (isSticky ? 15 : el.fontSize) * camera.zoom;
  const lineHeight = (isSticky ? 19 : el.fontSize * el.lineHeight) * camera.zoom;

  const commit = (keepText: boolean) => {
    const current = editor.elements.get(id);
    editor.stopEditingText();
    if (!current || !keepText) return;
    if (current.type === 'text' && !current.text.trim()) {
      editor.removeElements([id]);
      return;
    }
    if (beforeRef.current) editor.commitTransform(new Map([[id, beforeRef.current]]));
  };

  return (
    <textarea
      ref={textareaRef}
      className="text-edit-overlay"
      style={{
        left: screen.x,
        top: screen.y,
        width,
        height,
        fontSize,
        lineHeight: `${lineHeight}px`,
        fontFamily: isSticky ? 'system-ui, sans-serif' : el.fontFamily,
        color: isSticky ? 'rgba(0,0,0,0.78)' : el.color,
        fontWeight: !isSticky && el.bold ? 'bold' : 'normal',
        fontStyle: !isSticky && el.italic ? 'italic' : 'normal',
        textAlign: !isSticky ? el.align : 'left',
      }}
      value={el.text}
      onChange={(e) => {
        const current = editor.elements.get(id);
        if (current && (current.type === 'text' || current.type === 'sticky')) {
          current.text = e.target.value;
          editor.touch();
        }
      }}
      onPointerDown={(e) => e.stopPropagation()}
      onBlur={() => commit(true)}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === 'Escape') {
          e.preventDefault();
          (e.target as HTMLTextAreaElement).blur();
        }
      }}
    />
  );
}
