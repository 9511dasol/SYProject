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
  /** true이면 role이 'admin'(또는 그 상위인 'dev')인 사용자에게만 노출된다. */
  readonly adminOnly?: boolean;
  /** true이면 role이 'dev'인 사용자에게만 노출된다. */
  readonly devOnly?: boolean;
  readonly items: readonly NavItem[];
}
