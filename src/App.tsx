import { useMemo } from 'react';
import { Editor } from './engine/editor';
import { Canvas } from './components/Canvas';
import { Toolbar } from './components/Toolbar';
import { StatusBar } from './components/StatusBar';
import './App.css';

function App() {
  const editor = useMemo(() => new Editor(), []);

  return (
    <div className="app">
      <Toolbar editor={editor} />
      <Canvas editor={editor} />
      <StatusBar editor={editor} />
    </div>
  );
}

export default App;
