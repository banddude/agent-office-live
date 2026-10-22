import { describe, expect, it } from 'vitest';
import { fitOfficeZoom } from '../src/mobile/viewport.js';
import { TILE_SIZE } from '../src/office/types.js';

describe('mobile office zoom', () => {
  it('fits the whole 21x22 office into an iPhone-sized viewport', () => {
    const width = 390;
    const stageHeight = 620;
    const zoom = fitOfficeZoom(width, stageHeight, 3, 21, 22);
    expect(zoom).toBeGreaterThanOrEqual(1);
    expect(21 * TILE_SIZE * zoom).toBeLessThanOrEqual((width - 24) * 3);
    expect(22 * TILE_SIZE * zoom).toBeLessThanOrEqual((stageHeight - 24) * 3);
    expect(zoom).toBe(3);
  });
  it('refits in landscape without cropping the entire scene', () => {
    const zoom = fitOfficeZoom(844, 220, 3, 21, 22);
    expect(zoom).toBeGreaterThanOrEqual(1);
    expect(22 * TILE_SIZE * zoom).toBeLessThanOrEqual((220 - 24) * 3);
  });
  it('handles tiny and invalid viewports without crashing', () => {
    expect(fitOfficeZoom(0, 0, 3, 21, 22)).toBe(1);
    expect(fitOfficeZoom(NaN, 200, 2, 21, 22)).toBe(1);
    expect(fitOfficeZoom(2000, 2000, 3, 21, 22)).toBeLessThanOrEqual(10);
  });
});

import { fitVisibleOffice, visibleOfficeBounds } from '../src/mobile/viewport.js';

describe('visible room camera', () => {
  const cols=21, rows=22;
  const tiles=Array(cols*rows).fill(255).map((v,i)=>{
    const x=i%cols, y=Math.floor(i/cols);
    return y>=10 && y<=20 && x<=19 ? 1 : v;
  });
  const layout={cols,rows,tiles};
  it('excludes reserved blank rows and centers the actual rooms', () => {
    expect(visibleOfficeBounds(layout)).toEqual({left:0,right:19,top:10,bottom:20});
    const camera=fitVisibleOffice(390,643,3,layout);
    expect(camera.zoom).toBe(3);
    expect(camera.panY).toBeLessThan(0);
    // In portrait, room midpoint must land at the visual center of the stage.
    const centerY=(10+20+1)/2;
    expect((-rows*TILE_SIZE*camera.zoom/2 + camera.panY + centerY*TILE_SIZE*camera.zoom)).toBe(0);
  });
  it('keeps 3× instead of unexpectedly shrinking on a 375px wide phone', () => {
    expect(fitVisibleOffice(375,611,3,layout).zoom).toBe(3);
  });
  it('fits the room at a useful 3× in landscape instead of shrinking to 1×', () => {
    const cam=fitVisibleOffice(844,244,3,layout);
    expect(cam.zoom).toBe(3);
  });
  it('falls back to the full grid for an empty layout', () => {
    const empty={cols,rows,tiles:Array(cols*rows).fill(255)};
    expect(visibleOfficeBounds(empty)).toEqual({left:0,right:20,top:0,bottom:21});
  });
});
