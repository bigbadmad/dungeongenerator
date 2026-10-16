import { describe, it, expect } from 'vitest';
import { exportCanvasWidth, footerWidth, type FooterMetrics } from '../exportLayout.js';

const metrics: FooterMetrics = { margin: 24, gap: 12, barWidth: 240, scaleLabelWidth: 60, captionWidth: 420 };

describe('export canvas width', () => {
  it('widens a narrow dungeon so the footer fits (map width 288 at 2x)', () => {
    const w = exportCanvasWidth(288, metrics);
    expect(w).toBeGreaterThanOrEqual(footerWidth(metrics));
    expect(w).toBeGreaterThan(288);
  });

  it('leaves a wide dungeon untouched', () => {
    expect(exportCanvasWidth(4000, metrics)).toBe(4000);
  });

  it('keeps the scale bar, its label and the caption on separate spans', () => {
    const w = exportCanvasWidth(288, metrics);
    const labelEnd = metrics.margin + metrics.barWidth + metrics.gap + metrics.scaleLabelWidth;
    const captionStart = w - metrics.margin - metrics.captionWidth;
    expect(captionStart).toBeGreaterThan(labelEnd);
  });
});
