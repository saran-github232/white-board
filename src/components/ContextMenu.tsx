import type { Editor } from '../engine/editor';

interface Props {
  editor: Editor;
  x: number;
  y: number;
  ids: string[];
  onClose: () => void;
}

export function ContextMenu({ editor, x, y, ids, onClose }: Props) {
  const has = ids.length > 0;
  const one = ids.length === 1;
  const el = one ? editor.elements.get(ids[0]) : null;
  const act = (fn: () => void) => () => {
    fn();
    onClose();
  };

  return (
    <div
      className="context-menu"
      style={{ left: x, top: y }}
      onPointerDown={(e) => e.stopPropagation()}
      onContextMenu={(e) => e.preventDefault()}
    >
      {has && <button onClick={act(() => editor.cut())}>Cut</button>}
      {has && <button onClick={act(() => editor.copy())}>Copy</button>}
      <button onClick={act(() => editor.paste())}>Paste</button>
      {has && <button onClick={act(() => editor.duplicateSelection())}>Duplicate</button>}
      {has && <button onClick={act(() => editor.deleteSelection())}>Delete</button>}
      <div className="context-menu-sep" />
      {ids.length > 1 && <button onClick={act(() => editor.group(ids))}>Group</button>}
      {one && el?.groupId && <button onClick={act(() => editor.ungroup(ids))}>Ungroup</button>}
      {has && !el?.locked && <button onClick={act(() => editor.setLocked(ids, true))}>Lock</button>}
      {has && el?.locked && <button onClick={act(() => editor.setLocked(ids, false))}>Unlock</button>}
      <div className="context-menu-sep" />
      {has && <button onClick={act(() => editor.bringForward(ids))}>Bring forward</button>}
      {has && <button onClick={act(() => editor.bringToFront(ids))}>Bring to front</button>}
      {has && <button onClick={act(() => editor.sendBackward(ids))}>Send backward</button>}
      {has && <button onClick={act(() => editor.sendToBack(ids))}>Send to back</button>}
      {has && (
        <>
          <div className="context-menu-sep" />
          <button onClick={act(() => editor.zoomToSelection())}>Zoom to selection</button>
        </>
      )}
    </div>
  );
}
