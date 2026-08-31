'use client';

import type { ReactNode } from 'react';
import { cx } from '@/lib/cx';
import EmptyState from '@/components/ui/EmptyState';
import ScrollableTable from '@/components/ui/ScrollableTable';
import Spinner from '@/components/ui/Spinner';

/**
 * 목록 표.
 *
 * 관리자 화면 네 곳이 표 껍데기와 thead 클래스 뭉치를 글자 단위로 복붙하고 있었고,
 * 그중 어느 것도 globals.css 의 `.data-table` 체계에 들어와 있지 않아서 다크모드
 * 헤더 색·hover 를 못 받았다. 게다가 `min-w-200`(800px) 짜리 표가 좁은 화면에서
 * 잘리는데 스크롤할 수 있다는 단서조차 없었다.
 *
 * 컬럼 정의 하나로 데스크톱 표와 모바일 카드 목록을 **함께** 그린다 — 두 뷰를
 * 따로 적어 두면 컬럼을 추가할 때 한쪽만 고쳐 조용히 어긋난다(코드베이스에 그런
 * 표가 이미 있었다).
 */

export interface Column<T> {
  /** 헤더 텍스트. 모바일 카드에서는 항목 레이블로 쓰인다 */
  header: string;
  cell: (row: T) => ReactNode;
  align?: 'left' | 'right';
  /** 셀에 덧붙일 클래스 (`max-w-50 truncate`, `whitespace-nowrap` 등) */
  className?: string;
  /** 잘린 내용을 hover 로 볼 수 있게 하는 title 속성 */
  title?: (row: T) => string | undefined;
  /**
   * 모바일 카드에서 레이블 없이 제목 줄로 올린다.
   * 보통 그 행을 식별하는 값(시각·이름·기간)에 준다.
   */
  primary?: boolean;
  /** 모바일 카드에서 생략한다 (좁은 화면에 다 넣으면 오히려 안 읽힌다) */
  hideOnMobile?: boolean;
}

interface DataTableProps<T> {
  /** null · undefined 는 "아직 불러오는 중"으로 본다 */
  rows: T[] | null | undefined;
  rowKey: (row: T) => string | number;
  columns: Column<T>[];
  /** 표가 찌그러지지 않는 최소 폭 (예: 'min-w-200') */
  minWidth?: string;
  empty: { icon: string; title: string; description?: ReactNode };
  /** 좁은 화면에서 표가 넘칠 때만 보이는 안내 */
  hint?: string;
}

export default function DataTable<T>({
  rows,
  rowKey,
  columns,
  minWidth = 'min-w-full',
  empty,
  hint = '옆으로 밀어서 나머지 열을 볼 수 있어요',
}: DataTableProps<T>) {
  if (rows == null) {
    return (
      <div className="flex justify-center py-10">
        <Spinner />
      </div>
    );
  }

  if (rows.length === 0) {
    return <EmptyState icon={empty.icon} title={empty.title} description={empty.description} />;
  }

  const mobileColumns = columns.filter((c) => !c.hideOnMobile);
  const primaryColumns = mobileColumns.filter((c) => c.primary);
  const detailColumns = mobileColumns.filter((c) => !c.primary);

  return (
    <>
      {/* ── 모바일: 카드 목록 ─────────────────────────────────────────────── */}
      <ul className="space-y-2 sm:hidden">
        {rows.map((row) => (
          <li
            key={rowKey(row)}
            className="rounded-xl border border-border bg-surface px-4 py-3 space-y-2"
          >
            {primaryColumns.length > 0 && (
              <div className="flex flex-wrap items-center gap-2 text-sm font-semibold text-fg">
                {primaryColumns.map((col) => (
                  <span key={col.header}>{col.cell(row)}</span>
                ))}
              </div>
            )}
            <dl className="space-y-1">
              {detailColumns.map((col) => (
                <div key={col.header} className="flex items-start justify-between gap-3 text-xs">
                  <dt className="text-fg-subtle shrink-0">{col.header}</dt>
                  <dd className="text-fg-muted text-right min-w-0 break-words">{col.cell(row)}</dd>
                </div>
              ))}
            </dl>
          </li>
        ))}
      </ul>

      {/* ── 데스크톱: 표 ──────────────────────────────────────────────────── */}
      <div className="hidden sm:block">
        <ScrollableTable hint={hint}>
          <table className={cx('w-full text-sm', minWidth)}>
            <thead>
              <tr className="text-left text-xs font-semibold uppercase tracking-wide">
                {columns.map((col) => (
                  <th
                    key={col.header}
                    scope="col"
                    className={cx('px-4 py-3', col.align === 'right' && 'text-right')}
                  >
                    {col.header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={rowKey(row)}>
                  {columns.map((col) => (
                    <td
                      key={col.header}
                      title={col.title?.(row)}
                      className={cx(
                        'px-4 py-3',
                        col.align === 'right' && 'text-right',
                        col.className,
                      )}
                    >
                      {col.cell(row)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </ScrollableTable>
      </div>
    </>
  );
}
