import { useSyncExternalStore } from 'react';
import type { Editor } from '../engine/editor';

export type SaveStatus = 'loading' | 'saving' | 'saved' | 'error';

const SAVE_LABEL: Record<SaveStatus, string> = {
  loading: 'Loading…',
  saving: 'Saving…',
  saved: 'Saved locally',
  error: 'Storage error — work may not be saved',
};

export function StatusBar({ editor, saveStatus }: { editor: Editor; saveStatus: SaveStatus }) {
  useSyncExternalStore(editor.subscribe, () => editor.version);

  const zoomBy = (factor: number) => {
    editor.camera.zoomAt(editor.camera.viewportWidth / 2, editor.camera.viewportHeight / 2, factor);
    editor.emit();
  };

  return (
    <div className="status-bar">
      <button className="status-link" title="Zoom out (-)" onClick={() => zoomBy(1 / 1.2)}>
        −
      </button>
      <span>{Math.round(editor.camera.zoom * 100)}%</span>
      <button className="status-link" title="Zoom in (+)" onClick={() => zoomBy(1.2)}>
        +
      </button>
      <span className="status-sep">·</span>
      <button className="status-link" title="Fit all content (1)" onClick={() => editor.zoomToFitAll()}>
        Fit
      </button>
      <button className="status-link" title="Reset view (0)" onClick={() => editor.resetView()}>
        Reset
      </button>
      <span className="status-sep">·</span>
      <span>{editor.tool}</span>
      {editor.selection.size > 0 && (
        <>
          <span className="status-sep">·</span>
          <span>{editor.selection.size} selected</span>
        </>
      )}
      <span className="status-sep">·</span>
      <span>{editor.elements.size} objects</span>
      <span className="status-sep">·</span>
      <span className={saveStatus === 'error' ? 'status-error' : undefined} title="Board is autosaved to this browser's local storage">
        {SAVE_LABEL[saveStatus]}
      </span>
    </div>
  );
}
