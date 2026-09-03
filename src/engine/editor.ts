import { Camera, MAX_ZOOM, MIN_ZOOM } from './camera';
import { elementBounds, unionBounds } from './bounds';
import { History } from './history';
import {
  isLineArrow,
  type Bounds,
  type ArrowheadStyle,
  type Element,
  type ElementType,
  type FillStyle,
  type ShapeType,
  type SmoothingLevel,
  type StrokeStyle,
  type ToolId,
} from './types';

let idCounter = 0;
export function makeId(): string {
  idCounter += 1;
  return `${Date.now().toString(36)}-${idCounter}`;
}

export function makeSeed(): number {
  return Math.floor(Math.random() * 1_000_000);
}

export interface PenSettings {
  color: string;
  size: number;
  smoothing: SmoothingLevel;
  opacity: number;
}

export interface ShapeSettings {
  strokeColor: string;
  fillColor: string;
  fillStyle: FillStyle;
  strokeWidth: number;
  strokeStyle: StrokeStyle;
  roughness: number;
}

export interface LineArrowSettings {
  strokeColor: string;
  strokeWidth: number;
  strokeStyle: StrokeStyle;
  roughness: number;
  startArrow: ArrowheadStyle;
  endArrow: ArrowheadStyle;
}

export interface TextSettings {
  fontFamily: string;
  fontSize: number;
  color: string;
  bold: boolean;
  italic: boolean;
  underline: boolean;
  align: 'left' | 'center' | 'right';
  lineHeight: number;
}

export const CREATION_TOOLS = new Set<ToolId>([
  'rectangle',
  'ellipse',
  'diamond',
  'triangle',
  'line',
  'arrow',
  'text',
  'sticky',
]);

export class Editor {
  camera = new Camera();
  history = new History(() => this.emit());

  elements = new Map<string, Element>();
  order: string[] = [];
  selection = new Set<string>();

  tool: ToolId = 'pen';
  toolLocked = false;
  eraserSize = 24;

  pen: PenSettings = { color: '#1a1a1a', size: 4, smoothing: 'medium', opacity: 1 };
  shapeStyle: ShapeSettings = {
    strokeColor: '#1a1a1a',
    fillColor: '#4dabf7',
    fillStyle: 'transparent',
    strokeWidth: 2,
    strokeStyle: 'solid',
    roughness: 1.2,
  };
  lineArrowStyle: LineArrowSettings = {
    strokeColor: '#1a1a1a',
    strokeWidth: 2,
    strokeStyle: 'solid',
    roughness: 1.2,
    startArrow: 'none',
    endArrow: 'arrow',
  };
  textStyle: TextSettings = {
    fontFamily: 'system-ui, sans-serif',
    fontSize: 20,
    color: '#1a1a1a',
    bold: false,
    italic: false,
    underline: false,
    align: 'left',
    lineHeight: 1.25,
  };
  stickyColor = '#fff3a0';

  editingTextId: string | null = null;
  private clipboard: Element[] = [];

  version = 0;
  private listeners = new Set<() => void>();

  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };

  emit() {
    this.version += 1;
    for (const fn of this.listeners) fn();
  }

  /** Redraw/UI refresh without a history entry — for live drag/resize feedback. */
  touch() {
    this.emit();
  }

  // ---- tool / settings ----

  setTool(tool: ToolId) {
    this.tool = tool;
    if (tool !== 'select') this.clearSelection();
    this.emit();
  }

  setToolLocked(locked: boolean) {
    this.toolLocked = locked;
    this.emit();
  }

  /** After finishing a created element: return to Select unless the tool is locked. */
  afterCreate(newIds: string[]) {
    this.select(newIds);
    if (!this.toolLocked) {
      this.tool = 'select';
    }
    this.emit();
  }

  setPen(patch: Partial<PenSettings>) {
    this.pen = { ...this.pen, ...patch };
    this.emit();
  }

  setShapeStyle(patch: Partial<ShapeSettings>) {
    this.shapeStyle = { ...this.shapeStyle, ...patch };
    this.applyStyleToSelection(patch);
  }

  setLineArrowStyle(patch: Partial<LineArrowSettings>) {
    this.lineArrowStyle = { ...this.lineArrowStyle, ...patch };
    this.applyStyleToSelection(patch);
  }

  setTextStyle(patch: Partial<TextSettings>) {
    this.textStyle = { ...this.textStyle, ...patch };
    this.applyStyleToSelection(patch);
  }

  /** Live-apply style changes to any currently selected elements (no history spam per keystroke). */
  private applyStyleToSelection(patch: Record<string, unknown>) {
    if (this.selection.size === 0) {
      this.emit();
      return;
    }
    for (const id of this.selection) {
      const el = this.elements.get(id);
      if (el) Object.assign(el, patch);
    }
    this.emit();
  }

  setStickyColor(color: string) {
    this.stickyColor = color;
    this.applyStyleToSelection({ color });
  }

  setEraserSize(size: number) {
    this.eraserSize = size;
    this.emit();
  }

  resetView() {
    this.camera.reset();
    this.emit();
  }

  zoomToBounds(b: Bounds, padding = 80) {
    if (b.w <= 0 || b.h <= 0 || this.camera.viewportWidth === 0) return;
    const scaleX = (this.camera.viewportWidth - padding * 2) / b.w;
    const scaleY = (this.camera.viewportHeight - padding * 2) / b.h;
    this.camera.zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Math.min(scaleX, scaleY)));
    this.camera.x = b.x + b.w / 2;
    this.camera.y = b.y + b.h / 2;
    this.emit();
  }

  zoomToSelection() {
    const els = [...this.selection]
      .map((id) => this.elements.get(id))
      .filter((e): e is Element => !!e);
    if (els.length === 0) return;
    this.zoomToBounds(unionBounds(els.map(elementBounds)));
  }

  zoomToFitAll() {
    const els = [...this.elements.values()];
    if (els.length === 0) {
      this.resetView();
      return;
    }
    this.zoomToBounds(unionBounds(els.map(elementBounds)));
  }

  startEditingText(id: string) {
    this.editingTextId = id;
    this.emit();
  }

  stopEditingText() {
    this.editingTextId = null;
    this.emit();
  }

  // ---- selection ----

  select(ids: string[], additive = false) {
    if (!additive) this.selection.clear();
    for (const id of ids) this.selection.add(id);
    this.emit();
  }

  toggleSelect(id: string) {
    if (this.selection.has(id)) this.selection.delete(id);
    else this.selection.add(id);
    this.emit();
  }

  clearSelection() {
    if (this.selection.size === 0) return;
    this.selection.clear();
    this.emit();
  }

  selectAll() {
    this.selection = new Set(this.order);
    this.emit();
  }

  /** Expand a selection to include every sibling sharing a groupId. */
  expandToGroup(ids: string[]): string[] {
    const result = new Set(ids);
    for (const id of ids) {
      const el = this.elements.get(id);
      if (!el?.groupId) continue;
      for (const other of this.elements.values()) {
        if (other.groupId === el.groupId) result.add(other.id);
      }
    }
    return [...result];
  }

  // ---- element lifecycle ----

  addElement(el: Element) {
    this.history.push({
      do: () => {
        this.elements.set(el.id, el);
        this.order.push(el.id);
        this.emit();
      },
      undo: () => {
        this.elements.delete(el.id);
        this.order = this.order.filter((id) => id !== el.id);
        this.emit();
      },
    });
  }

  removeElements(ids: string[]) {
    const removed = ids
      .map((id) => this.elements.get(id))
      .filter((e): e is Element => !!e && !e.locked);
    if (removed.length === 0) return;
    const removedIds = new Set(removed.map((e) => e.id));
    const positions = this.order
      .map((id, index) => ({ id, index }))
      .filter((p) => removedIds.has(p.id));
    this.history.push({
      do: () => {
        for (const el of removed) this.elements.delete(el.id);
        this.order = this.order.filter((id) => !removedIds.has(id));
        for (const id of removedIds) this.selection.delete(id);
        this.emit();
      },
      undo: () => {
        for (const el of removed) this.elements.set(el.id, structuredClone(el));
        const restored = [...this.order];
        for (const p of positions) restored.splice(Math.min(p.index, restored.length), 0, p.id);
        this.order = restored;
        this.emit();
      },
    });
  }

  deleteSelection() {
    this.removeElements([...this.selection]);
  }

  clearBoard() {
    const allElements = [...this.elements.values()];
    const prevOrder = [...this.order];
    if (allElements.length === 0) return;
    this.history.push({
      do: () => {
        this.elements.clear();
        this.order = [];
        this.selection.clear();
        this.emit();
      },
      undo: () => {
        for (const el of allElements) this.elements.set(el.id, structuredClone(el));
        this.order = prevOrder;
        this.emit();
      },
    });
  }

  duplicateSelection() {
    if (this.selection.size === 0) return;
    const offset = 12;
    const clones: Element[] = [];
    const idMap = new Map<string, string>();
    for (const id of this.selection) {
      const el = this.elements.get(id);
      if (!el) continue;
      const clone = structuredClone(el);
      clone.id = makeId();
      clone.seed = makeSeed();
      clone.groupId = null;
      idMap.set(id, clone.id);
      clones.push(clone);
    }
    for (const clone of clones) translateElement(clone, offset, offset);
    this.history.push({
      do: () => {
        for (const clone of clones) {
          this.elements.set(clone.id, clone);
          this.order.push(clone.id);
        }
        this.selection = new Set(clones.map((c) => c.id));
        this.emit();
      },
      undo: () => {
        for (const clone of clones) {
          this.elements.delete(clone.id);
          this.order = this.order.filter((id) => id !== clone.id);
        }
        this.emit();
      },
    });
  }

  copy() {
    this.clipboard = [...this.selection]
      .map((id) => this.elements.get(id))
      .filter((e): e is Element => !!e)
      .map((e) => structuredClone(e));
  }

  cut() {
    this.copy();
    this.deleteSelection();
  }

  paste() {
    if (this.clipboard.length === 0) return;
    const offset = 16;
    const clones = this.clipboard.map((e) => {
      const clone = structuredClone(e);
      clone.id = makeId();
      clone.seed = makeSeed();
      return clone;
    });
    for (const clone of clones) translateElement(clone, offset, offset);
    this.history.push({
      do: () => {
        for (const clone of clones) {
          this.elements.set(clone.id, clone);
          this.order.push(clone.id);
        }
        this.selection = new Set(clones.map((c) => c.id));
        this.emit();
      },
      undo: () => {
        for (const clone of clones) {
          this.elements.delete(clone.id);
          this.order = this.order.filter((id) => id !== clone.id);
        }
        this.emit();
      },
    });
    this.clipboard = clones.map((c) => structuredClone(c));
  }

  // ---- transforms (move/resize/rotate) ----

  snapshotElements(ids: Iterable<string>): Map<string, Element> {
    const map = new Map<string, Element>();
    for (const id of ids) {
      const el = this.elements.get(id);
      if (el) map.set(id, structuredClone(el));
    }
    return map;
  }

  commitTransform(before: Map<string, Element>) {
    const after = this.snapshotElements(before.keys());
    let changed = false;
    for (const [id, el] of after) {
      if (JSON.stringify(el) !== JSON.stringify(before.get(id))) changed = true;
    }
    if (!changed) return;
    this.history.push({
      do: () => {
        for (const [id, el] of after) this.elements.set(id, structuredClone(el));
        this.emit();
      },
      undo: () => {
        for (const [id, el] of before) this.elements.set(id, structuredClone(el));
        this.emit();
      },
    });
  }

  // ---- z-order ----

  private pushOrder(after: string[]) {
    const before = [...this.order];
    if (JSON.stringify(before) === JSON.stringify(after)) return;
    this.history.push({
      do: () => {
        this.order = after;
        this.emit();
      },
      undo: () => {
        this.order = before;
        this.emit();
      },
    });
  }

  bringToFront(ids: string[]) {
    const idSet = new Set(ids);
    const rest = this.order.filter((id) => !idSet.has(id));
    this.pushOrder([...rest, ...this.order.filter((id) => idSet.has(id))]);
  }

  sendToBack(ids: string[]) {
    const idSet = new Set(ids);
    const rest = this.order.filter((id) => !idSet.has(id));
    this.pushOrder([...this.order.filter((id) => idSet.has(id)), ...rest]);
  }

  /** Swap each selected element one step toward the front, in top-down order so groups move together cleanly. */
  bringForward(ids: string[]) {
    const idSet = new Set(ids);
    const arr = [...this.order];
    for (let i = arr.length - 2; i >= 0; i--) {
      if (idSet.has(arr[i]) && !idSet.has(arr[i + 1])) {
        [arr[i], arr[i + 1]] = [arr[i + 1], arr[i]];
      }
    }
    this.pushOrder(arr);
  }

  sendBackward(ids: string[]) {
    const idSet = new Set(ids);
    const arr = [...this.order];
    for (let i = 1; i < arr.length; i++) {
      if (idSet.has(arr[i]) && !idSet.has(arr[i - 1])) {
        [arr[i], arr[i - 1]] = [arr[i - 1], arr[i]];
      }
    }
    this.pushOrder(arr);
  }

  // ---- grouping / locking ----

  group(ids: string[]) {
    if (ids.length < 2) return;
    const groupId = makeId();
    const before = this.snapshotElements(ids);
    this.history.push({
      do: () => {
        for (const id of ids) {
          const el = this.elements.get(id);
          if (el) el.groupId = groupId;
        }
        this.emit();
      },
      undo: () => {
        for (const [id, el] of before) this.elements.set(id, structuredClone(el));
        this.emit();
      },
    });
  }

  ungroup(ids: string[]) {
    const before = this.snapshotElements(ids);
    this.history.push({
      do: () => {
        for (const id of ids) {
          const el = this.elements.get(id);
          if (el) el.groupId = null;
        }
        this.emit();
      },
      undo: () => {
        for (const [id, el] of before) this.elements.set(id, structuredClone(el));
        this.emit();
      },
    });
  }

  setLocked(ids: string[], locked: boolean) {
    const before = this.snapshotElements(ids);
    this.history.push({
      do: () => {
        for (const id of ids) {
          const el = this.elements.get(id);
          if (el) el.locked = locked;
        }
        this.emit();
      },
      undo: () => {
        for (const [id, el] of before) this.elements.set(id, structuredClone(el));
        this.emit();
      },
    });
  }

  // ---- factories ----

  createFreehand(firstPoint: { x: number; y: number; pressure: number }): Element {
    const p = this.pen;
    return {
      id: makeId(),
      type: 'freehand',
      points: [firstPoint],
      color: p.color,
      size: p.size,
      smoothing: p.smoothing,
      opacity: p.opacity,
      locked: false,
      groupId: null,
      seed: makeSeed(),
    };
  }

  createShape(type: ShapeType, x: number, y: number, w: number, h: number): Element {
    const s = this.shapeStyle;
    return {
      id: makeId(),
      type,
      x,
      y,
      w,
      h,
      rotation: 0,
      opacity: 1,
      locked: false,
      groupId: null,
      seed: makeSeed(),
      strokeColor: s.strokeColor,
      fillColor: s.fillColor,
      fillStyle: s.fillStyle,
      strokeWidth: s.strokeWidth,
      strokeStyle: s.strokeStyle,
      roughness: s.roughness,
    };
  }

  createLineArrow(type: 'line' | 'arrow', points: { x: number; y: number }[]): Element {
    const s = this.lineArrowStyle;
    return {
      id: makeId(),
      type,
      points,
      opacity: 1,
      locked: false,
      groupId: null,
      seed: makeSeed(),
      strokeColor: s.strokeColor,
      strokeWidth: s.strokeWidth,
      strokeStyle: s.strokeStyle,
      roughness: s.roughness,
      startArrow: type === 'arrow' ? s.startArrow : 'none',
      endArrow: type === 'arrow' ? s.endArrow : 'none',
      startBinding: null,
      endBinding: null,
      label: '',
    };
  }

  createText(x: number, y: number, text = ''): Element {
    const s = this.textStyle;
    return {
      id: makeId(),
      type: 'text',
      x,
      y,
      width: 200,
      height: s.fontSize * s.lineHeight,
      text,
      fontFamily: s.fontFamily,
      fontSize: s.fontSize,
      color: s.color,
      bold: s.bold,
      italic: s.italic,
      underline: s.underline,
      align: s.align,
      lineHeight: s.lineHeight,
      opacity: 1,
      locked: false,
      groupId: null,
      seed: makeSeed(),
    };
  }

  createSticky(x: number, y: number): Element {
    return {
      id: makeId(),
      type: 'sticky',
      x,
      y,
      w: 180,
      h: 180,
      rotation: 0,
      text: '',
      color: this.stickyColor,
      opacity: 1,
      locked: false,
      groupId: null,
      seed: makeSeed(),
    };
  }
}

export function translateElement(el: Element, dx: number, dy: number) {
  if (el.type === 'freehand') {
    for (const p of el.points) {
      p.x += dx;
      p.y += dy;
    }
  } else if (isLineArrow(el)) {
    for (const p of el.points) {
      p.x += dx;
      p.y += dy;
    }
  } else {
    el.x += dx;
    el.y += dy;
  }
}

export function elementType(el: Element): ElementType {
  return el.type;
}
