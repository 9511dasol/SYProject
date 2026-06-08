'use client';

import { useTheme } from 'next-themes';
import { useMemo } from 'react';

// ── 타입 ──────────────────────────────────────────────────────────────────────

export interface ChartAxisTheme {
  stroke: string;   /* 축 선 색 */
  tick: string;     /* 눈금 레이블 색 */
  grid: string;     /* 격자선 색 */
}

export interface ChartTooltipTheme {
  bg: string;
  border: string;
  text: string;
  mutedText: string;
}

export interface ChartTheme {
  isDark: boolean;
  axis: ChartAxisTheme;
  tooltip: ChartTooltipTheme;
  /** 시리즈 색상 — recharts fill/stroke에 그대로 전달 */
  colors: string[];
  /** 단일 지표 차트용 대표 색 */
  primary: string;
  /** 양수/음수 비교 색 */
  positive: string;
  negative: string;
  /** recharts CartesianGrid의 strokeDasharray 기본값 */
  gridDash: string;
  /** recharts Bar cornerRadius 기본값 */
  barRadius: number;
}

// ── 팔레트 ────────────────────────────────────────────────────────────────────

const LIGHT: ChartTheme = {
  isDark: false,
  axis: {
    stroke: '#e2e8f0',   /* slate-200 */
    tick:   '#64748b',   /* slate-500  — 4.6:1 on white ✓ */
    grid:   '#f1f5f9',   /* slate-100 */
  },
  tooltip: {
    bg:        '#ffffff',
    border:    '#e2e8f0',
    text:      '#0f172a',
    mutedText: '#64748b',
  },
  /* 라이트 모드 시리즈 — 채도 높게 */
  colors: ['#2563eb','#10b981','#f59e0b','#ec4899','#8b5cf6','#06b6d4','#f97316'],
  primary:  '#2563eb',  /* blue-600  */
  positive: '#10b981',  /* emerald-500 */
  negative: '#ef4444',  /* red-500    */
  gridDash: '3 3',
  barRadius: 4,
};

const DARK: ChartTheme = {
  isDark: true,
  axis: {
    stroke: '#1e293b',   /* slate-800 */
    tick:   '#94a3b8',   /* slate-400  — 8.0:1 on slate-900 ✓ */
    grid:   '#1e293b',   /* slate-800 */
  },
  tooltip: {
    bg:        '#1e293b',
    border:    '#334155',
    text:      '#f1f5f9',
    mutedText: '#94a3b8',
  },
  /* 다크 모드 시리즈 — 밝기 올려서 어두운 배경에서 선명하게 */
  colors: ['#60a5fa','#34d399','#fbbf24','#f472b6','#a78bfa','#22d3ee','#fb923c'],
  primary:  '#3b82f6',  /* blue-500  */
  positive: '#34d399',  /* emerald-400 */
  negative: '#f87171',  /* red-400    */
  gridDash: '3 3',
  barRadius: 4,
};

// ── 훅 ───────────────────────────────────────────────────────────────────────

/**
 * 현재 테마에 맞는 차트 색상 팔레트를 반환한다.
 * recharts의 XAxis, YAxis, CartesianGrid, Tooltip, Bar, Line 등에 직접 전달한다.
 *
 * @example
 * const chart = useChartTheme();
 * <XAxis stroke={chart.axis.stroke} tick={{ fill: chart.axis.tick }} />
 * <Bar fill={chart.colors[0]} radius={chart.barRadius} />
 * <Tooltip contentStyle={{ background: chart.tooltip.bg, border: `1px solid ${chart.tooltip.border}` }} />
 */
export function useChartTheme(): ChartTheme {
  const { resolvedTheme } = useTheme();
  // resolvedTheme은 SSR 시 undefined → LIGHT 기본값, 클라이언트 hydration 후 자동 반응
  return useMemo(() => (resolvedTheme === 'dark' ? DARK : LIGHT), [resolvedTheme]);
}

// ── 색상 보간 유틸 ────────────────────────────────────────────────────────────

/**
 * 값의 비율(0~1)에 따라 danger → neutral → success 색으로 보간.
 * 예산 소진율 게이지, KPI 달성률 등에 활용.
 */
export function burnRateColor(rate: number, isDark: boolean): string {
  if (rate >= 0.8) return isDark ? '#4ade80' : '#16a34a';  /* green */
  if (rate >= 0.5) return isDark ? '#fbbf24' : '#d97706';  /* amber */
  return isDark ? '#f87171' : '#dc2626';                   /* red   */
}

/**
 * 증감률 숫자에 따라 색상 반환 (양수=green, 음수=red, 0=neutral).
 */
export function changeColor(value: number, isDark: boolean): string {
  if (value > 0) return isDark ? '#34d399' : '#10b981';
  if (value < 0) return isDark ? '#f87171' : '#ef4444';
  return isDark ? '#94a3b8' : '#64748b';
}
