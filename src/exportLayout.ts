export interface FooterMetrics {
  margin: number;
  gap: number;
  barWidth: number;
  scaleLabelWidth: number;
  captionWidth: number;
}

/**
 * Width a PNG export needs so the footer (scale bar + its label + the right-
 * aligned caption) fits on one row without clipping or overlapping.
 */
export function footerWidth(m: FooterMetrics): number {
  return m.margin + m.barWidth + m.gap + m.scaleLabelWidth + m.margin * 2 + m.captionWidth + m.margin;
}

/** A narrow dungeon can be thinner than its footer; widen the canvas, never shrink the map. */
export function exportCanvasWidth(mapWidth: number, m: FooterMetrics): number {
  return Math.ceil(Math.max(mapWidth, footerWidth(m)));
}
