import type { ReactNode } from 'react';

interface ChartCardProps {
  title: string;
  /** 제목 오른쪽 도구 자리 — 보통 지표 토글 */
  toolbar?: ReactNode;
  /** true 면 children 대신 안내 문구를 그린다 */
  isEmpty?: boolean;
  emptyText?: string;
  children: ReactNode;
}

/**
 * 차트 한 개를 감싸는 껍데기 — 제목 · 도구 · 빈 상태.
 *
 * 차트마다 헤더를 다시 짜면 제목 크기와 여백이 조금씩 어긋난다. 표(`SummaryTable`)
 * 위의 `<h3>` 과 같은 서체를 쓰도록 여기서 한 번만 정한다.
 */
export default function ChartCard({
  title,
  toolbar,
  isEmpty = false,
  emptyText = '표시할 데이터가 없습니다',
  children,
}: ChartCardProps) {
  return (
    <div className="rounded-xl border border-border bg-surface-2/40 px-4 py-3.5">
      <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
        <h3 className="text-sm font-medium text-fg-muted">{title}</h3>
        {toolbar}
      </div>

      {isEmpty ? (
        <p className="py-8 text-center text-xs text-fg-subtle">{emptyText}</p>
      ) : (
        children
      )}
    </div>
  );
}
