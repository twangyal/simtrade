import { formatReceiptTime } from './quoteFormat';

// Eight-character clock labels use 10px tabular type. Reserve a generous width
// and gap in chart coordinates, which ResizeObserver keeps aligned to CSS pixels.
const LABEL_WIDTH = 56;
const LABEL_GAP = 12;

export function quoteTimeLabels(points, plotted) {
  if (!points.length) return [];
  const labelAt = (index, anchor) => ({
    time: points[index].time,
    x: plotted[index].x,
    label: formatReceiptTime(points[index].time),
    anchor,
  });
  if (points.length === 1) return [labelAt(0, 'middle')];
  const first = labelAt(0, 'start');
  const last = labelAt(points.length - 1, 'end');
  if (first.label === last.label || first.x + LABEL_WIDTH + LABEL_GAP > last.x - LABEL_WIDTH) return [last];

  const center = (first.x + last.x) / 2;
  let middleIndex = -1;
  for (let index = 1; index < points.length - 1; index += 1) {
    const x = plotted[index].x;
    if (x - LABEL_WIDTH / 2 < first.x + LABEL_WIDTH + LABEL_GAP
      || x + LABEL_WIDTH / 2 > last.x - LABEL_WIDTH - LABEL_GAP) continue;
    if (middleIndex < 0 || Math.abs(x - center) < Math.abs(plotted[middleIndex].x - center)) middleIndex = index;
  }
  // Format only the selected labels, rather than all 1,800 possible observations.
  const middle = middleIndex < 0 ? null : labelAt(middleIndex, 'middle');
  return middle && middle.label !== first.label && middle.label !== last.label ? [first, middle, last] : [first, last];
}
