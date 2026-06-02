export type NavBadge = 'NEW' | 'SOON' | 'BETA';

export interface NavSubItem {
  readonly id: string;
  readonly label: string;
  readonly href: string;
  readonly badge?: NavBadge;
  readonly disabled?: boolean;
}

export interface NavItem {
  readonly id: string;
  readonly label: string;
  /** boxicons 클래스명 (예: 'bx-bar-chart-alt-2') */
  readonly icon: string;
  readonly href: string;
  readonly badge?: NavBadge;
  readonly disabled?: boolean;
  readonly description?: string;
  readonly children?: readonly NavSubItem[];
}

export interface NavGroup {
  readonly id: string;
  readonly groupLabel?: string;
  readonly items: readonly NavItem[];
}
