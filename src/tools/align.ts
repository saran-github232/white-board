import { elementBounds, unionBounds } from '../engine/bounds';
import { translateElement, type Editor } from '../engine/editor';
import type { Element } from '../engine/types';

export type AlignMode = 'left' | 'centerH' | 'right' | 'top' | 'centerV' | 'bottom';

function selectedElements(editor: Editor): Element[] {
  return [...editor.selection]
    .map((id) => editor.elements.get(id))
    .filter((e): e is Element => !!e && !e.locked);
}

export function alignSelection(editor: Editor, mode: AlignMode) {
  const elements = selectedElements(editor);
  if (elements.length < 2) return;
  const before = editor.snapshotElements(elements.map((e) => e.id));
  const overall = unionBounds(elements.map(elementBounds));
  for (const el of elements) {
    const b = elementBounds(el);
    let dx = 0;
    let dy = 0;
    switch (mode) {
      case 'left':
        dx = overall.x - b.x;
        break;
      case 'right':
        dx = overall.x + overall.w - (b.x + b.w);
        break;
      case 'centerH':
        dx = overall.x + overall.w / 2 - (b.x + b.w / 2);
        break;
      case 'top':
        dy = overall.y - b.y;
        break;
      case 'bottom':
        dy = overall.y + overall.h - (b.y + b.h);
        break;
      case 'centerV':
        dy = overall.y + overall.h / 2 - (b.y + b.h / 2);
        break;
    }
    translateElement(el, dx, dy);
  }
  editor.commitTransform(before);
}

export function distributeSelection(editor: Editor, axis: 'horizontal' | 'vertical') {
  const elements = selectedElements(editor);
  if (elements.length < 3) return;
  const before = editor.snapshotElements(elements.map((e) => e.id));
  const withBounds = elements
    .map((el) => ({ el, b: elementBounds(el) }))
    .sort((a, b) => (axis === 'horizontal' ? a.b.x - b.b.x : a.b.y - b.b.y));

  const first = withBounds[0];
  const last = withBounds[withBounds.length - 1];
  const centerOf = (b: { x: number; y: number; w: number; h: number }) =>
    axis === 'horizontal' ? b.x + b.w / 2 : b.y + b.h / 2;
  const step = (centerOf(last.b) - centerOf(first.b)) / (withBounds.length - 1);

  withBounds.forEach((item, i) => {
    if (i === 0 || i === withBounds.length - 1) return;
    const target = centerOf(first.b) + step * i;
    const delta = target - centerOf(item.b);
    translateElement(item.el, axis === 'horizontal' ? delta : 0, axis === 'vertical' ? delta : 0);
  });
  editor.commitTransform(before);
}
