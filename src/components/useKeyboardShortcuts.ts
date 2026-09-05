import { useEffect } from 'react';
import type { Editor } from '../engine/editor';

export function useKeyboardShortcuts(
  editor: Editor,
  spaceHeldRef: React.RefObject<boolean>,
  setContextMenu: (menu: { x: number; y: number; ids: string[] } | null) => void,
) {
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
}
