export interface Point {
  x: number;
  y: number;
  pressure: number;
}

export type ToolId =
  | 'select'
  | 'hand'
  | 'pen'
  | 'eraser'
  | 'rectangle'
  | 'ellipse'
  | 'diamond'
  | 'triangle'
  | 'line'
  | 'arrow'
  | 'text'
  | 'sticky';

export type SmoothingLevel = 'off' | 'low' | 'medium' | 'high' | 'very-high';
export type FillStyle = 'transparent' | 'solid' | 'hachure' | 'cross-hatch';
export type StrokeStyle = 'solid' | 'dashed' | 'dotted';
export type ArrowheadStyle = 'none' | 'arrow' | 'triangle' | 'dot' | 'bar';

export interface Command {
  do(): void;
  undo(): void;
}

interface BaseElement {
  id: string;
  opacity: number;
  locked: boolean;
  groupId: string | null;
  seed: number;
}

export interface FreehandElement extends BaseElement {
  type: 'freehand';
  points: Point[];
  color: string;
  size: number;
  smoothing: SmoothingLevel;
}

export type ShapeType = 'rectangle' | 'ellipse' | 'diamond' | 'triangle';

export interface ShapeElement extends BaseElement {
  type: ShapeType;
  x: number;
  y: number;
  w: number;
  h: number;
  rotation: number;
  strokeColor: string;
  fillColor: string;
  fillStyle: FillStyle;
  strokeWidth: number;
  strokeStyle: StrokeStyle;
  roughness: number;
}

export interface Binding {
  elementId: string;
  /** Anchor as a 0..1 fraction of the target's bounding box, recomputed as the target moves. */
  anchor: { x: number; y: number };
}

export interface LineArrowElement extends BaseElement {
  type: 'line' | 'arrow';
  points: { x: number; y: number }[];
  strokeColor: string;
  strokeWidth: number;
  strokeStyle: StrokeStyle;
  roughness: number;
  startArrow: ArrowheadStyle;
  endArrow: ArrowheadStyle;
  startBinding: Binding | null;
  endBinding: Binding | null;
  label: string;
}

export interface TextElement extends BaseElement {
  type: 'text';
  x: number;
  y: number;
  width: number;
  height: number;
  text: string;
  fontFamily: string;
  fontSize: number;
  color: string;
  bold: boolean;
  italic: boolean;
  underline: boolean;
  align: 'left' | 'center' | 'right';
  lineHeight: number;
}

export interface StickyElement extends BaseElement {
  type: 'sticky';
  x: number;
  y: number;
  w: number;
  h: number;
  rotation: number;
  text: string;
  color: string;
}

export type Element =
  | FreehandElement
  | ShapeElement
  | LineArrowElement
  | TextElement
  | StickyElement;

export type ElementType = Element['type'];

// TS can't exclude LineArrowElement via `el.type !== 'line' && el.type !== 'arrow'`
// because its discriminant is itself a union of two literals; a declared predicate sidesteps that.
export function isLineArrow(el: Element): el is LineArrowElement {
  return el.type === 'line' || el.type === 'arrow';
}

export interface Bounds {
  x: number;
  y: number;
  w: number;
  h: number;
}
