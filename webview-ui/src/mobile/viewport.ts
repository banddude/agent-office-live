/** Responsiveness math for the existing Pixel Agents canvas in device pixels. */
import { ZOOM_MAX, ZOOM_MIN } from '../constants.js';
import { TILE_SIZE } from '../office/types.js';

export function fitOfficeZoom(
  viewportWidth: number,
  viewportHeight: number,
  devicePixelRatio: number,
  cols: number,
  rows: number,
  marginCssPx = 12,
): number {
  if (![viewportWidth, viewportHeight, devicePixelRatio, cols, rows].every(Number.isFinite)) {
    return ZOOM_MIN;
  }
  if (viewportWidth <= 0 || viewportHeight <= 0 || devicePixelRatio <= 0 || cols <= 0 || rows <= 0) {
    return ZOOM_MIN;
  }
  const width = Math.max(1, (viewportWidth - 2 * marginCssPx) * devicePixelRatio);
  const height = Math.max(1, (viewportHeight - 2 * marginCssPx) * devicePixelRatio);
  const fitting = Math.floor(Math.min(width / (cols * TILE_SIZE), height / (rows * TILE_SIZE)));
  return Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, fitting));
}


/** Find the actually occupied office tiles, ignoring reserved/empty canvas rows. */
export function visibleOfficeBounds(layout: { cols: number; rows: number; tiles: number[] }): {
  left: number; right: number; top: number; bottom: number;
} {
  let left = layout.cols;
  let right = -1;
  let top = layout.rows;
  let bottom = -1;
  for (let index = 0; index < layout.tiles.length; index++) {
    if (layout.tiles[index] === 255) continue; // VOID
    const col = index % layout.cols;
    const row = Math.floor(index / layout.cols);
    left = Math.min(left, col);
    right = Math.max(right, col);
    top = Math.min(top, row);
    bottom = Math.max(bottom, row);
  }
  if (right < left || bottom < top) {
    return {left:0,right:layout.cols-1,top:0,bottom:layout.rows-1};
  }
  return {left,right,top,bottom};
}

/** The default layout has 11 VOID rows above the rooms; fit + center the rooms. */
export function fitVisibleOffice(
  width: number,
  height: number,
  dpr: number,
  layout: {cols:number;rows:number;tiles:number[]},
): {zoom:number;panX:number;panY:number} {
  const bounds = visibleOfficeBounds(layout);
  // One additional tile of breathing room on each side for wall furnishings.
  const contentWidth = bounds.right - bounds.left + 3;
  const contentHeight = bounds.bottom - bounds.top + 3;
  const zoom = fitOfficeZoom(width,height,dpr,contentWidth,contentHeight,8);
  const contentCenterX = (bounds.left + bounds.right + 1) / 2;
  const contentCenterY = (bounds.top + bounds.bottom + 1) / 2;
  return {
    zoom,
    panX: Math.round((layout.cols/2 - contentCenterX) * TILE_SIZE * zoom),
    panY: Math.round((layout.rows/2 - contentCenterY) * TILE_SIZE * zoom),
  };
}
