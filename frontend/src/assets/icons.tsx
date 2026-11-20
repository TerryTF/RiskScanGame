import type { ReactNode } from 'react';
import type { ResourceType, TeamRole } from '../api/types';
import { useT } from '../texts';

/**
 * Placeholder artwork. The storyboard calls for original card art, so every picture the UI uses is reachable through
 * the RESOURCE_ICON / TEAM_ICON maps below: replace a component there (for example with an <img>) and the whole
 * interface picks it up.
 */
export interface IconProps {
  size?: number;
  /** Accessible name. Icons are decorative (aria-hidden) unless a title is given. */
  title?: string;
  className?: string;
}

function Svg({ size = 24, title, className, children }: IconProps & { children: ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      className={className}
      role={title ? 'img' : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      focusable="false"
    >
      {children}
    </svg>
  );
}

export function CoinIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="14.5" cy="9" r="6.5" fill="#f2b82b" stroke="#c98a0b" strokeWidth="1.2" />
      <circle cx="10" cy="14.5" r="6.5" fill="#f7c948" stroke="#c98a0b" strokeWidth="1.2" />
      <circle cx="10" cy="14.5" r="3.4" fill="none" stroke="#c98a0b" strokeWidth="1.2" />
    </Svg>
  );
}

export function BookIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <rect x="4" y="3" width="16" height="18" rx="2" fill="#d1342c" />
      <rect x="6.5" y="3" width="1.6" height="18" fill="#9e241e" />
      <rect x="10.5" y="7" width="6.5" height="1.6" rx=".8" fill="#fff" opacity=".85" />
      <rect x="10.5" y="10.5" width="6.5" height="1.6" rx=".8" fill="#fff" opacity=".85" />
    </Svg>
  );
}

export function HeadIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="14" cy="8.5" r="4.6" fill="#6b3fa0" />
      <path d="M5.5 21c0-4.6 3.8-7.4 8.5-7.4s8.5 2.8 8.5 7.4z" fill="#6b3fa0" />
      <path d="M4.5 6.5c-1.2 1.4-1.2 3.6 0 5M2.2 5c-2 2.4-2 5.6 0 8" fill="none" stroke="#6b3fa0" strokeWidth="1.3" strokeLinecap="round" />
    </Svg>
  );
}

/** "Wild": any resource type may pay this part of a cost. */
export function WildIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="12" cy="12" r="7.5" fill="none" stroke="#25403b" strokeWidth="2" />
    </Svg>
  );
}

export function SuitcaseIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M9 6V4.8C9 4 9.6 3.5 10.4 3.5h3.2c.8 0 1.4.5 1.4 1.3V6" fill="none" stroke="#1e5f98" strokeWidth="1.6" />
      <rect x="4" y="6" width="16" height="14" rx="2.6" fill="#2f7dc0" />
      <rect x="8" y="6" width="1.7" height="14" fill="#1e5f98" />
      <rect x="14.3" y="6" width="1.7" height="14" fill="#1e5f98" />
      <rect x="6" y="20" width="2.4" height="1.4" rx=".6" fill="#1e5f98" />
      <rect x="15.6" y="20" width="2.4" height="1.4" rx=".6" fill="#1e5f98" />
    </Svg>
  );
}

export function HeartHandsIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path
        d="M12 12.2c-.3-.2-4.2-2.7-4.2-5.4 0-1.6 1.2-2.8 2.7-2.8 1 0 1.5.5 1.5.5s.5-.5 1.5-.5c1.5 0 2.7 1.2 2.7 2.8 0 2.7-3.9 5.2-4.2 5.4z"
        fill="#d9423a"
      />
      <path d="M2.5 13.5c2.2-.8 4.6-.2 6.7 1.5l2.4 2c.7.6.1 1.7-.8 1.4l-3-.9-1.6 2.5c-.5.8-1.3 1-2 .5L2 18z" fill="#f2b38f" />
      <path d="M21.5 13.5c-2.2-.8-4.6-.2-6.7 1.5l-2.4 2c-.7.6-.1 1.7.8 1.4l3-.9 1.6 2.5c.5.8 1.3 1 2 .5l1.2-1.5z" fill="#f2b38f" />
    </Svg>
  );
}

export function PillarIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <rect x="4" y="3.5" width="16" height="3" rx="1" fill="#9aa0a4" />
      <rect x="6" y="6.5" width="12" height="1.6" fill="#b7bcbf" />
      <rect x="7" y="8.5" width="2.4" height="9" fill="#c4c8cb" />
      <rect x="10.8" y="8.5" width="2.4" height="9" fill="#c4c8cb" />
      <rect x="14.6" y="8.5" width="2.4" height="9" fill="#c4c8cb" />
      <rect x="5.5" y="17.5" width="13" height="1.8" fill="#b7bcbf" />
      <rect x="4" y="19.3" width="16" height="2.2" rx="1" fill="#9aa0a4" />
    </Svg>
  );
}

/** The small swirl in a hazard column header. */
export function HazardGlyph(props: IconProps) {
  return (
    <Svg {...props}>
      <path
        d="M3 7c4-3 9-3 12 0s2 6-1 7-5-1-4-3 3-2 4-1"
        fill="none"
        stroke="#d94f35"
        strokeWidth="2.2"
        strokeLinecap="round"
      />
    </Svg>
  );
}

export function CheckIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

const PIPS: Record<number, [number, number][]> = {
  1: [[1, 1]],
  2: [[0, 0], [2, 2]],
  3: [[0, 0], [1, 1], [2, 2]],
  4: [[0, 0], [2, 0], [0, 2], [2, 2]],
  5: [[0, 0], [2, 0], [1, 1], [0, 2], [2, 2]],
  6: [[0, 0], [0, 1], [0, 2], [2, 0], [2, 1], [2, 2]],
};

/** A die showing `value` (1 to 6). */
export function DiceFace({ value, size = 30, label }: { value: number; size?: number; label?: string }) {
  const t = useT();
  const pips = PIPS[value] ?? [];
  return (
    <svg
      viewBox="0 0 30 30"
      width={size}
      height={size}
      role="img"
      aria-label={label ?? t('board.dice.label', { value })}
      className="die"
      focusable="false"
    >
      <rect x="1.5" y="1.5" width="27" height="27" rx="6" fill="#fff" stroke="#25403b" strokeWidth="1.8" />
      {pips.map(([column, row]) => (
        <circle key={`${column}-${row}`} cx={7.5 + column * 7.5} cy={7.5 + row * 7.5} r="2.5" fill="#25403b" />
      ))}
    </svg>
  );
}

export const RESOURCE_ICON: Record<ResourceType, (props: IconProps) => ReactNode> = {
  money: CoinIcon,
  knowledge: BookIcon,
  authority: HeadIcon,
};

export const TEAM_ICON: Record<TeamRole, (props: IconProps) => ReactNode> = {
  tourism_industry: SuitcaseIcon,
  local_government: HeartHandsIcon,
  civil_society: PillarIcon,
};
