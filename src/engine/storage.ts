import type { Element } from './types';

const DB_NAME = 'whiteboard';
const DB_VERSION = 1;
const STORE = 'boards';
const BOARD_ID = 'default';

export interface BoardSnapshot {
  elements: Element[];
  order: string[];
  camera: { x: number; y: number; zoom: number };
}

interface StoredBoard extends BoardSnapshot {
  id: string;
  schemaVersion: number;
  savedAt: number;
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) {
        req.result.createObjectStore(STORE, { keyPath: 'id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/** Returns null if nothing was saved yet, or if IndexedDB is unavailable/corrupt — never throws. */
export async function loadBoard(): Promise<BoardSnapshot | null> {
  try {
    const db = await openDB();
    const board = await new Promise<StoredBoard | undefined>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly');
      const req = tx.objectStore(STORE).get(BOARD_ID);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    db.close();
    if (!board || !Array.isArray(board.elements) || !Array.isArray(board.order) || !board.camera) return null;
    return { elements: board.elements, order: board.order, camera: board.camera };
  } catch {
    return null;
  }
}

/** Throws on failure (quota exceeded, IndexedDB blocked/unavailable) so the caller can surface a warning. */
export async function saveBoard(snapshot: BoardSnapshot): Promise<void> {
  const db = await openDB();
  const stored: StoredBoard = { id: BOARD_ID, schemaVersion: 1, savedAt: Date.now(), ...snapshot };
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(stored);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}
