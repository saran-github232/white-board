import type { Command } from './types';

const MAX_HISTORY = 500;

export class History {
  private undoStack: Command[] = [];
  private redoStack: Command[] = [];
  private onChange: () => void;

  constructor(onChange: () => void) {
    this.onChange = onChange;
  }

  push(command: Command) {
    command.do();
    this.undoStack.push(command);
    if (this.undoStack.length > MAX_HISTORY) this.undoStack.shift();
    this.redoStack = [];
    this.onChange();
  }

  undo() {
    const command = this.undoStack.pop();
    if (!command) return;
    command.undo();
    this.redoStack.push(command);
    this.onChange();
  }

  redo() {
    const command = this.redoStack.pop();
    if (!command) return;
    command.do();
    this.undoStack.push(command);
    this.onChange();
  }

  get canUndo() {
    return this.undoStack.length > 0;
  }

  get canRedo() {
    return this.redoStack.length > 0;
  }

  /** Drop all undo/redo entries — used after loading a snapshot, since old commands reference stale element objects. */
  clear() {
    this.undoStack = [];
    this.redoStack = [];
    this.onChange();
  }
}
