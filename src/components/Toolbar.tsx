import { useSyncExternalStore } from 'react';
import type { Editor } from '../engine/editor';
import type { ArrowheadStyle, Element, FillStyle, SmoothingLevel, StrokeStyle, ToolId } from '../engine/types';
import { alignSelection, distributeSelection } from '../tools/align';

const DRAW_TOOLS: { id: ToolId; label: string; shortcut: string; icon: string }[] = [
  { id: 'select', label: 'Select', shortcut: 'V', icon: '⬚' },
  { id: 'hand', label: 'Hand / Pan', shortcut: 'H', icon: '✋' },
  { id: 'pen', label: 'Pen', shortcut: 'P', icon: '✏️' },
  { id: 'eraser', label: 'Eraser', shortcut: 'E', icon: '🧹' },
];

const SHAPE_TOOLS: { id: ToolId; label: string; shortcut: string; icon: string }[] = [
  { id: 'rectangle', label: 'Rectangle', shortcut: 'R', icon: '▭' },
  { id: 'ellipse', label: 'Ellipse', shortcut: 'O', icon: '◯' },
  { id: 'diamond', label: 'Diamond', shortcut: 'D', icon: '◆' },
  { id: 'triangle', label: 'Triangle', shortcut: '', icon: '△' },
  { id: 'line', label: 'Line', shortcut: 'L', icon: '╱' },
  { id: 'arrow', label: 'Arrow', shortcut: 'A', icon: '↗' },
  { id: 'text', label: 'Text', shortcut: 'T', icon: 'T' },
  { id: 'sticky', label: 'Sticky note', shortcut: 'N', icon: '🗒' },
];

const COLORS = ['#1a1a1a', '#e03131', '#2f9e44', '#1971c2', '#f08c00', '#ffffff'];
const SMOOTHING_OPTIONS: SmoothingLevel[] = ['off', 'low', 'medium', 'high', 'very-high'];
const FILL_STYLES: FillStyle[] = ['transparent', 'solid', 'hachure', 'cross-hatch'];
const STROKE_STYLES: StrokeStyle[] = ['solid', 'dashed', 'dotted'];
const ARROWHEADS: ArrowheadStyle[] = ['none', 'arrow', 'triangle', 'dot', 'bar'];
const STICKY_COLORS = ['#fff3a0', '#a5d8ff', '#b2f2bb', '#fcc2d7', '#d0bfff'];

function firstSelected(editor: Editor): Element | null {
  const id = [...editor.selection][0];
  return id ? (editor.elements.get(id) ?? null) : null;
}

export function Toolbar({ editor }: { editor: Editor }) {
  useSyncExternalStore(editor.subscribe, () => editor.version);

  const selectedCount = editor.selection.size;
  const selected = firstSelected(editor);
  const showShapePanel =
    editor.tool === 'rectangle' ||
    editor.tool === 'ellipse' ||
    editor.tool === 'diamond' ||
    editor.tool === 'triangle' ||
    (editor.tool === 'select' &&
      selected &&
      (selected.type === 'rectangle' || selected.type === 'ellipse' || selected.type === 'diamond' || selected.type === 'triangle'));
  const showLineArrowPanel =
    editor.tool === 'line' ||
    editor.tool === 'arrow' ||
    (editor.tool === 'select' && selected && (selected.type === 'line' || selected.type === 'arrow'));
  const showTextPanel =
    editor.tool === 'text' || (editor.tool === 'select' && selected && selected.type === 'text');
  const showStickyPanel =
    editor.tool === 'sticky' || (editor.tool === 'select' && selected && selected.type === 'sticky');

  return (
    <div className="toolbar">
      <div className="toolbar-group">
        {DRAW_TOOLS.map((t) => (
          <button
            key={t.id}
            className={`toolbar-btn ${editor.tool === t.id ? 'active' : ''}`}
            title={`${t.label} (${t.shortcut})`}
            aria-label={t.label}
            aria-pressed={editor.tool === t.id}
            onClick={() => editor.setTool(t.id)}
          >
            {t.icon}
          </button>
        ))}
      </div>
      <div className="toolbar-divider" />
      <div className="toolbar-group">
        {SHAPE_TOOLS.map((t) => (
          <button
            key={t.id}
            className={`toolbar-btn ${editor.tool === t.id ? 'active' : ''}`}
            title={t.shortcut ? `${t.label} (${t.shortcut})` : t.label}
            aria-label={t.label}
            aria-pressed={editor.tool === t.id}
            onClick={() => editor.setTool(t.id)}
          >
            {t.icon}
          </button>
        ))}
        <button
          className={`toolbar-btn ${editor.toolLocked ? 'active' : ''}`}
          title="Keep tool active after drawing (tool lock)"
          aria-label="Tool lock"
          aria-pressed={editor.toolLocked}
          onClick={() => editor.setToolLocked(!editor.toolLocked)}
        >
          {editor.toolLocked ? '🔒' : '🔓'}
        </button>
      </div>

      <div className="toolbar-divider" />
      <div className="toolbar-group">
        <button
          className="toolbar-btn"
          title="Undo (Ctrl+Z)"
          aria-label="Undo"
          disabled={!editor.history.canUndo}
          onClick={() => editor.history.undo()}
        >
          ↶
        </button>
        <button
          className="toolbar-btn"
          title="Redo (Ctrl+Shift+Z)"
          aria-label="Redo"
          disabled={!editor.history.canRedo}
          onClick={() => editor.history.redo()}
        >
          ↷
        </button>
        <button
          className="toolbar-btn"
          title="Clear board"
          aria-label="Clear board"
          onClick={() => {
            if (confirm('Clear the entire board? This can be undone.')) editor.clearBoard();
          }}
        >
          🗑
        </button>
      </div>

      {selectedCount >= 1 && (
        <>
          <div className="toolbar-divider" />
          <div className="toolbar-group">
            <button className="toolbar-btn" title="Duplicate (Ctrl+D)" onClick={() => editor.duplicateSelection()}>
              ⧉
            </button>
            <button className="toolbar-btn" title="Delete" onClick={() => editor.deleteSelection()}>
              🗑
            </button>
            {selected?.locked ? (
              <button className="toolbar-btn" title="Unlock" onClick={() => editor.setLocked([...editor.selection], false)}>
                🔓
              </button>
            ) : (
              <button className="toolbar-btn" title="Lock" onClick={() => editor.setLocked([...editor.selection], true)}>
                🔒
              </button>
            )}
            <button className="toolbar-btn" title="Bring forward" onClick={() => editor.bringForward([...editor.selection])}>
              ▲
            </button>
            <button className="toolbar-btn" title="Send backward" onClick={() => editor.sendBackward([...editor.selection])}>
              ▼
            </button>
          </div>
        </>
      )}

      {selectedCount >= 2 && (
        <>
          <div className="toolbar-divider" />
          <div className="toolbar-group">
            <button className="toolbar-btn" title="Group (Ctrl+G)" onClick={() => editor.group([...editor.selection])}>
              ⛓
            </button>
            <button className="toolbar-btn" title="Align left" onClick={() => alignSelection(editor, 'left')}>
              ⇤
            </button>
            <button className="toolbar-btn" title="Align center" onClick={() => alignSelection(editor, 'centerH')}>
              ⇔
            </button>
            <button className="toolbar-btn" title="Align right" onClick={() => alignSelection(editor, 'right')}>
              ⇥
            </button>
            <button className="toolbar-btn" title="Align top" onClick={() => alignSelection(editor, 'top')}>
              ⤒
            </button>
            <button className="toolbar-btn" title="Align middle" onClick={() => alignSelection(editor, 'centerV')}>
              ⇕
            </button>
            <button className="toolbar-btn" title="Align bottom" onClick={() => alignSelection(editor, 'bottom')}>
              ⤓
            </button>
          </div>
        </>
      )}
      {selectedCount >= 3 && (
        <div className="toolbar-group">
          <button className="toolbar-btn" title="Distribute horizontally" onClick={() => distributeSelection(editor, 'horizontal')}>
            ↔
          </button>
          <button className="toolbar-btn" title="Distribute vertically" onClick={() => distributeSelection(editor, 'vertical')}>
            ↕
          </button>
        </div>
      )}

      {editor.tool === 'pen' && (
        <>
          <div className="toolbar-divider" />
          <div className="toolbar-group">
            {COLORS.map((c) => (
              <button
                key={c}
                className={`color-swatch ${editor.pen.color === c ? 'active' : ''}`}
                style={{ background: c, borderColor: c === '#ffffff' ? '#ccc' : c }}
                aria-label={`Color ${c}`}
                onClick={() => editor.setPen({ color: c })}
              />
            ))}
            <input
              type="range"
              min={0.5}
              max={40}
              step={0.5}
              value={editor.pen.size}
              title={`Stroke width: ${editor.pen.size}px`}
              onChange={(e) => editor.setPen({ size: Number(e.target.value) })}
            />
            <select
              value={editor.pen.smoothing}
              title="Smoothing"
              onChange={(e) => editor.setPen({ smoothing: e.target.value as SmoothingLevel })}
            >
              {SMOOTHING_OPTIONS.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
        </>
      )}

      {editor.tool === 'eraser' && (
        <>
          <div className="toolbar-divider" />
          <div className="toolbar-group">
            <input
              type="range"
              min={4}
              max={100}
              step={2}
              value={editor.eraserSize}
              title={`Eraser size: ${editor.eraserSize}px`}
              onChange={(e) => editor.setEraserSize(Number(e.target.value))}
            />
          </div>
        </>
      )}

      {showShapePanel && (
        <>
          <div className="toolbar-divider" />
          <div className="toolbar-group">
            {COLORS.map((c) => (
              <button
                key={c}
                className={`color-swatch ${editor.shapeStyle.strokeColor === c ? 'active' : ''}`}
                style={{ background: c, borderColor: c === '#ffffff' ? '#ccc' : c }}
                title="Stroke color"
                onClick={() => editor.setShapeStyle({ strokeColor: c })}
              />
            ))}
            <input
              type="color"
              title="Fill color"
              value={editor.shapeStyle.fillColor}
              onChange={(e) => editor.setShapeStyle({ fillColor: e.target.value })}
            />
            <select
              value={editor.shapeStyle.fillStyle}
              title="Fill style"
              onChange={(e) => editor.setShapeStyle({ fillStyle: e.target.value as FillStyle })}
            >
              {FILL_STYLES.map((f) => (
                <option key={f} value={f}>
                  {f}
                </option>
              ))}
            </select>
            <select
              value={editor.shapeStyle.strokeStyle}
              title="Stroke style"
              onChange={(e) => editor.setShapeStyle({ strokeStyle: e.target.value as StrokeStyle })}
            >
              {STROKE_STYLES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
            <input
              type="range"
              min={0.5}
              max={20}
              step={0.5}
              value={editor.shapeStyle.strokeWidth}
              title={`Stroke width: ${editor.shapeStyle.strokeWidth}px`}
              onChange={(e) => editor.setShapeStyle({ strokeWidth: Number(e.target.value) })}
            />
            <input
              type="range"
              min={0}
              max={3}
              step={0.1}
              value={editor.shapeStyle.roughness}
              title={`Sketchiness: ${editor.shapeStyle.roughness}`}
              onChange={(e) => editor.setShapeStyle({ roughness: Number(e.target.value) })}
            />
          </div>
        </>
      )}

      {showLineArrowPanel && (
        <>
          <div className="toolbar-divider" />
          <div className="toolbar-group">
            {COLORS.map((c) => (
              <button
                key={c}
                className={`color-swatch ${editor.lineArrowStyle.strokeColor === c ? 'active' : ''}`}
                style={{ background: c, borderColor: c === '#ffffff' ? '#ccc' : c }}
                title="Color"
                onClick={() => editor.setLineArrowStyle({ strokeColor: c })}
              />
            ))}
            <select
              value={editor.lineArrowStyle.strokeStyle}
              title="Stroke style"
              onChange={(e) => editor.setLineArrowStyle({ strokeStyle: e.target.value as StrokeStyle })}
            >
              {STROKE_STYLES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
            <input
              type="range"
              min={0.5}
              max={20}
              step={0.5}
              value={editor.lineArrowStyle.strokeWidth}
              title={`Width: ${editor.lineArrowStyle.strokeWidth}px`}
              onChange={(e) => editor.setLineArrowStyle({ strokeWidth: Number(e.target.value) })}
            />
            {editor.tool === 'arrow' || selected?.type === 'arrow' ? (
              <>
                <select
                  value={editor.lineArrowStyle.startArrow}
                  title="Start arrowhead"
                  onChange={(e) => editor.setLineArrowStyle({ startArrow: e.target.value as ArrowheadStyle })}
                >
                  {ARROWHEADS.map((a) => (
                    <option key={a} value={a}>
                      start: {a}
                    </option>
                  ))}
                </select>
                <select
                  value={editor.lineArrowStyle.endArrow}
                  title="End arrowhead"
                  onChange={(e) => editor.setLineArrowStyle({ endArrow: e.target.value as ArrowheadStyle })}
                >
                  {ARROWHEADS.map((a) => (
                    <option key={a} value={a}>
                      end: {a}
                    </option>
                  ))}
                </select>
              </>
            ) : null}
          </div>
        </>
      )}

      {showTextPanel && (
        <>
          <div className="toolbar-divider" />
          <div className="toolbar-group">
            {COLORS.map((c) => (
              <button
                key={c}
                className={`color-swatch ${editor.textStyle.color === c ? 'active' : ''}`}
                style={{ background: c, borderColor: c === '#ffffff' ? '#ccc' : c }}
                title="Text color"
                onClick={() => editor.setTextStyle({ color: c })}
              />
            ))}
            <input
              type="range"
              min={10}
              max={96}
              step={1}
              value={editor.textStyle.fontSize}
              title={`Font size: ${editor.textStyle.fontSize}px`}
              onChange={(e) => editor.setTextStyle({ fontSize: Number(e.target.value) })}
            />
            <button
              className={`toolbar-btn ${editor.textStyle.bold ? 'active' : ''}`}
              title="Bold"
              onClick={() => editor.setTextStyle({ bold: !editor.textStyle.bold })}
            >
              B
            </button>
            <button
              className={`toolbar-btn ${editor.textStyle.italic ? 'active' : ''}`}
              title="Italic"
              onClick={() => editor.setTextStyle({ italic: !editor.textStyle.italic })}
            >
              I
            </button>
            <button
              className={`toolbar-btn ${editor.textStyle.underline ? 'active' : ''}`}
              title="Underline"
              onClick={() => editor.setTextStyle({ underline: !editor.textStyle.underline })}
            >
              U
            </button>
            <select
              value={editor.textStyle.align}
              title="Alignment"
              onChange={(e) => editor.setTextStyle({ align: e.target.value as 'left' | 'center' | 'right' })}
            >
              <option value="left">left</option>
              <option value="center">center</option>
              <option value="right">right</option>
            </select>
          </div>
        </>
      )}

      {showStickyPanel && (
        <>
          <div className="toolbar-divider" />
          <div className="toolbar-group">
            {STICKY_COLORS.map((c) => (
              <button
                key={c}
                className={`color-swatch ${editor.stickyColor === c ? 'active' : ''}`}
                style={{ background: c, borderColor: c }}
                title="Note color"
                onClick={() => editor.setStickyColor(c)}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
