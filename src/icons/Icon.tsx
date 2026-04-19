import { ICON_PATHS, type IconName } from './paths';

interface Props {
  name: IconName;
  size?: 16 | 20 | 24 | 32 | 48;
  /** When provided, exposed as accessible name via <title>. Omit for decorative icons (also pass `aria-hidden`). */
  title?: string;
  className?: string;
  strokeWidth?: number;
}

/**
 * SVG icon component for JSX consumers. Stroke uses currentColor so callers
 * style via CSS color. For DOM-marker consumers (createElementNS pattern),
 * use buildIconElement instead.
 */
export function Icon({
  name,
  size = 24,
  title,
  className,
  strokeWidth = 1.5,
}: Props) {
  const ariaProps = title
    ? { role: 'img' as const, 'aria-label': title }
    : { 'aria-hidden': true };

  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      {...ariaProps}
    >
      {title && <title>{title}</title>}
      <path d={ICON_PATHS[name]} />
    </svg>
  );
}
