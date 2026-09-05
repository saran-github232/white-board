// Element construction: id/seed generation, per-tool settings shapes,
// the set of tools that create elements, and element translation helpers.
import {
  isLineArrow,
  type Element,
  type ArrowheadStyle,
  type ElementType,
  type FillStyle,
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
