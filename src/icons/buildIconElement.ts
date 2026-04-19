import { ICON_PATHS, type IconName } from './paths';

const SVG_NS = 'http://www.w3.org/2000/svg';

interface Options {
  size?: number;
  strokeWidth?: number;
  className?: string;
}

/**
 * DOM equivalent of <Icon> for chart marker code that uses createElementNS
 * (XSS-safe, no innerHTML). Same paths.ts source so JSX and DOM stay
 * visually identical.
 */
export function buildIconElement(name: IconName, opts: Options = {}): SVGSVGElement {
  const size = opts.size ?? 24;
  const strokeWidth = opts.strokeWidth ?? 1.5;

  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('width', String(size));
  svg.setAttribute('height', String(size));
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', String(strokeWidth));
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');
  if (opts.className) svg.setAttribute('class', opts.className);

  const path = document.createElementNS(SVG_NS, 'path');
  path.setAttribute('d', ICON_PATHS[name]);
  svg.appendChild(path);

  return svg;
}
