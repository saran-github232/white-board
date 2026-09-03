export const MIN_ZOOM = 0.05;
export const MAX_ZOOM = 50;

export interface CameraState {
  x: number; // world coordinate at viewport center
  y: number;
  zoom: number;
}

export class Camera {
  x = 0;
  y = 0;
  zoom = 1;
  viewportWidth = 0;
  viewportHeight = 0;

  screenToWorld(screenX: number, screenY: number): { x: number; y: number } {
    return {
      x: (screenX - this.viewportWidth / 2) / this.zoom + this.x,
      y: (screenY - this.viewportHeight / 2) / this.zoom + this.y,
    };
  }

  worldToScreen(worldX: number, worldY: number): { x: number; y: number } {
    return {
      x: (worldX - this.x) * this.zoom + this.viewportWidth / 2,
      y: (worldY - this.y) * this.zoom + this.viewportHeight / 2,
    };
  }

  zoomAt(screenX: number, screenY: number, factor: number) {
    const before = this.screenToWorld(screenX, screenY);
    this.zoom = clamp(this.zoom * factor, MIN_ZOOM, MAX_ZOOM);
    const after = this.screenToWorld(screenX, screenY);
    this.x += before.x - after.x;
    this.y += before.y - after.y;
  }

  pan(dxScreen: number, dyScreen: number) {
    this.x -= dxScreen / this.zoom;
    this.y -= dyScreen / this.zoom;
  }

  reset() {
    this.x = 0;
    this.y = 0;
    this.zoom = 1;
  }

  getTransform(dpr: number): DOMMatrix {
    return new DOMMatrix([
      this.zoom * dpr,
      0,
      0,
      this.zoom * dpr,
      dpr * (this.viewportWidth / 2 - this.x * this.zoom),
      dpr * (this.viewportHeight / 2 - this.y * this.zoom),
    ]);
  }
}

function clamp(v: number, min: number, max: number) {
  return Math.min(max, Math.max(min, v));
}
