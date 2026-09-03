import { useEffect, useMemo, useRef, useState } from 'react';
import { Editor } from './engine/editor';
import { loadBoard, saveBoard } from './engine/storage';
import { Canvas } from './components/Canvas';
import { Toolbar } from './components/Toolbar';
import { StatusBar, type SaveStatus } from './components/StatusBar';
import './App.css';

const AUTOSAVE_DEBOUNCE_MS = 800;

function App() {
  const editor = useMemo(() => new Editor(), []);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('loading');

  useEffect(() => {
    let cancelled = false;
    loadBoard().then((snapshot) => {
      if (cancelled) return;
      if (snapshot) editor.loadSnapshot(snapshot);
      setSaveStatus('saved');
    });
    return () => {
      cancelled = true;
    };
  }, [editor]);

  const loadedRef = useRef(false);
  useEffect(() => {
    loadedRef.current = saveStatus !== 'loading';
  }, [saveStatus]);

  const saveTimerRef = useRef<number | undefined>(undefined);
  useEffect(() => {
    const unsubscribe = editor.subscribe(() => {
      // Skip autosave until the initial load has resolved, so we never overwrite a saved board with an empty one.
      if (!loadedRef.current) return;
      setSaveStatus('saving');
      window.clearTimeout(saveTimerRef.current);
      saveTimerRef.current = window.setTimeout(() => {
        saveBoard(editor.toSnapshot())
          .then(() => setSaveStatus('saved'))
          .catch(() => setSaveStatus('error'));
      }, AUTOSAVE_DEBOUNCE_MS);
    });
    return () => {
      unsubscribe();
      window.clearTimeout(saveTimerRef.current);
    };
  }, [editor]);

  return (
    <div className="app">
      <Toolbar editor={editor} />
      <Canvas editor={editor} />
      <StatusBar editor={editor} saveStatus={saveStatus} />
    </div>
  );
}

export default App;
