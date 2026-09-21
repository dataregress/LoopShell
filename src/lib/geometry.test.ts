import { describe, expect, it } from 'vitest';
import { PANEL_H, PANEL_W, PILL_H, PILL_W, TAB_W, placePanel, placePill, placeTab } from './geometry';

const work = { x: 0, y: 0, w: 1920, h: 1040 };

describe('placePill', () => {
  it('sits flush right at 40 % height by default', () => {
    const p = placePill(work, null);
    expect(p.x).toBe(1920 - PILL_W);
    expect(p.y).toBe(416);
  });
  it('clamps saved y to the work area', () => {
    expect(placePill(work, -50).y).toBe(0);
    expect(placePill(work, 5000).y).toBe(1040 - PILL_H);
  });
});

describe('placeTab', () => {
  it('is the same height as the pill and flush with its outer edge', () => {
    const pill = placePill(work, 400);
    const tab = placeTab(pill);
    expect(tab.w).toBe(TAB_W);
    expect(tab.h).toBe(PILL_H);
    expect(tab.x + tab.w).toBe(pill.x + pill.w);
    expect(tab.y).toBe(pill.y);
  });
});

describe('placePanel', () => {
  it('opens 8 px inboard with the pill at ~35 % of its height', () => {
    const pill = placePill(work, 400);
    const panel = placePanel(work, pill);
    expect(panel.x).toBe(pill.x - PANEL_W - 8);
    expect(panel.y).toBe(Math.round(400 + PILL_H / 2 - PANEL_H * 0.35));
    expect(panel.h).toBe(PANEL_H);
  });
  it('clamps to the work area and shrinks on short displays', () => {
    const short = { x: 0, y: 0, w: 1366, h: 600 };
    const panel = placePanel(short, placePill(short, 0));
    expect(panel.h).toBe(600 - 48);
    expect(panel.y).toBe(8);
  });
});
