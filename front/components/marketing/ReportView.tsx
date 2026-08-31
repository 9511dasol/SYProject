'use client';

import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import CommentSection from '@/components/marketing/CommentSection';
import RowEditorModal from '@/components/marketing/RowEditorModal';
import DailyTable from '@/components/marketing/report/DailyTable';
import KpiGrid from '@/components/marketing/report/KpiGrid';
import ReportTabs from '@/components/marketing/report/ReportTabs';
import SummaryTable from '@/components/marketing/report/SummaryTable';
import Alert from '@/components/ui/Alert';
import Button from '@/components/ui/Button';
import { usePendingRows } from '@/hooks/usePendingRows';
import { updateComment } from '@/lib/marketingClient';
import { MEDIA_ORDER, orderedMediaKeys } from '@/lib/marketingMeta';
import { displayRowToForm, emptyRowForm, hasAnyMetric } from '@/lib/marketingMetrics';
import type { MediaDailyRow, ReportData, RowFormData } from '@/types/marketing';

interface ReportViewProps {
  data: ReportData;
  onClose?: () => void;
  /** true 면 행 추가·수정·삭제와 DB 저장이 가능해진다 */
  editable?: boolean;
  year?: number;
  month?: number;
  onRefresh?: () => void;
}

type EditorState = { mode: 'edit' | 'add'; data: RowFormData } | null;

const SUMMARY_TAB = 'summary';

/**
 * 기간 하나의 분석 리포트 — 요약 탭 + 매체별 일별 탭.
 *
 * 이 파일은 껍데기다. 실제 일은 나눠져 있다:
 *   - 미저장 편집 상태머신 → hooks/usePendingRows.ts
 *   - 파생지표 계산        → lib/marketingMetrics.ts
 *   - 표·모달·배지         → components/marketing/report/*
 */
export default function ReportView({
  data,
  onClose,
  editable = false,
  year,
  month,
  onRefresh,
}: ReportViewProps) {
  // editable 이면 데이터가 없는 매체도 탭으로 띄운다 — 첫 행을 추가할 자리가 필요하다
  const mediaTabs = editable ? MEDIA_ORDER : orderedMediaKeys(data.daily);

  const [activeTab, setActiveTab] = useState<string>(SUMMARY_TAB);
  const [editor, setEditor] = useState<EditorState>(null);

  const pendingRows = usePendingRows(data.daily, onRefresh);

  const comment = useMutation({
    mutationFn: () => updateComment(year!, month!),
    onSuccess: () => onRefresh?.(),
  });

  const handleTabChange = (tab: string) => {
    setActiveTab(tab);
    // 탭을 옮기면 코멘트 생성 오류는 지운다 (그 탭에서만 의미 있는 메시지)
    comment.reset();
  };

  const openEdit = (tab: string, row: MediaDailyRow) => {
    setEditor({ mode: 'edit', data: displayRowToForm(row, tab) });
  };

  const openAdd = (tab: string) => {
    const today = new Date().toISOString().slice(0, 10);
    setEditor({ mode: 'add', data: emptyRowForm(tab, today) });
  };

  const hasDiff = Object.values(data.diff ?? {}).some(
    (d) => d.added.length + d.updated.length > 0,
  );

  // DB 저장에 일부 실패하면 무엇이 남았는지 알려준다 — 다시 누르면 실패분만 재시도된다
  const commitFailureMessage =
    pendingRows.failures.length > 0
      ? `${pendingRows.failures.length}건을 저장하지 못했습니다: ` +
        pendingRows.failures.map((f) => `${f.campaignType} ${f.date}`).join(', ')
      : null;

  return (
    <>
      {editor && (
        <RowEditorModal
          mode={editor.mode}
          initialData={editor.data}
          year={year}
          month={month}
          onClose={() => setEditor(null)}
          onSubmit={async (formData) => {
            pendingRows.stage(formData);
            setEditor(null);
          }}
        />
      )}

      <div className="mt-6 rounded-2xl bg-surface shadow-card border border-border overflow-hidden">
        {/* 리포트 헤더 */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-surface-2/40 gap-3">
          <div className="flex items-center gap-2 flex-wrap min-w-0">
            <i className="bx bx-bar-chart-alt-2 text-xl text-primary shrink-0" />
            <span className="font-semibold text-fg">{data.period} 분석 리포트</span>
            {hasDiff && <span className="badge badge-warn shrink-0">DB 반영됨</span>}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {editable && pendingRows.pendingCount > 0 && (
              <Button
                size="sm"
                onClick={() => pendingRows.commit()}
                isLoading={pendingRows.isCommitting}
              >
                {!pendingRows.isCommitting && <i className="bx bx-save text-base" />}
                DB 저장
                <span className="bg-white/20 text-[10px] font-bold px-1.5 py-0.5 rounded-full leading-none">
                  {pendingRows.pendingCount}
                </span>
              </Button>
            )}
            {onClose && (
              <button
                onClick={onClose}
                className="text-fg-subtle hover:text-fg transition-colors"
                aria-label="닫기"
              >
                <i className="bx bx-x text-xl" />
              </button>
            )}
          </div>
        </div>

        <ReportTabs
          mediaTabs={mediaTabs}
          activeTab={activeTab}
          onChange={handleTabChange}
          diff={data.diff}
          pendingCountOf={pendingRows.tabPendingCount}
        />

        <div className="p-5 space-y-5">
          {commitFailureMessage && <Alert>{commitFailureMessage}</Alert>}

          {activeTab === SUMMARY_TAB ? (
            <>
              <KpiGrid total={data.total} />

              <div>
                <h3 className="text-sm font-medium text-fg-muted mb-2">매체별 현황</h3>
                <SummaryTable rows={data.by_media} />
              </div>

              <div className="space-y-2">
                {editable && year && month && (
                  <div className="flex justify-end">
                    <Button
                      tone="amber"
                      size="sm"
                      onClick={() => comment.mutate()}
                      isLoading={comment.isPending}
                    >
                      {!comment.isPending && <i className="bx bx-comment-detail text-sm" />}
                      코멘트 업데이트
                    </Button>
                  </div>
                )}
                {comment.error && <Alert>{comment.error.message}</Alert>}
                <CommentSection text={data.comment ?? ''} updatedAt={data.comment_updated_at} />
              </div>
            </>
          ) : (
            <MediaTabPanel
              campaignType={activeTab}
              data={data}
              editable={editable}
              pendingRows={pendingRows}
              onRequestEdit={(row) => openEdit(activeTab, row)}
              onRequestAdd={() => openAdd(activeTab)}
            />
          )}
        </div>
      </div>
    </>
  );
}

// ── 매체별 일별 탭 ────────────────────────────────────────────────────────────

interface MediaTabPanelProps {
  campaignType: string;
  data: ReportData;
  editable: boolean;
  pendingRows: ReturnType<typeof usePendingRows>;
  onRequestEdit: (row: MediaDailyRow) => void;
  onRequestAdd: () => void;
}

function MediaTabPanel({
  campaignType,
  data,
  editable,
  pendingRows,
  onRequestEdit,
  onRequestAdd,
}: MediaTabPanelProps) {
  const tabDiff = data.diff?.[campaignType];
  const addedCount = tabDiff?.added.length ?? 0;
  const updatedCount = tabDiff?.updated.length ?? 0;

  const rows = pendingRows.mergedRows(campaignType);
  // 표가 실제로 그리는 행 수와 같은 기준을 쓴다 — 어긋나면 표에는 31일이 보이는데
  // 머리말은 "0일" 이라고 말하게 된다
  const visibleCount = rows.filter((r) => r.pendingStatus !== undefined || hasAnyMetric(r)).length;

  return (
    <div>
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <div className="flex items-center gap-2 flex-wrap">
          <h3 className="text-sm font-medium text-fg-muted">{campaignType} 일별 데이터</h3>
          {addedCount > 0 && (
            <span className="badge badge-success">
              <i className="bx bx-plus text-[10px]" />신규 {addedCount}일
            </span>
          )}
          {updatedCount > 0 && (
            <span className="badge badge-warn">
              <i className="bx bx-refresh text-[10px]" />교체 {updatedCount}일
            </span>
          )}
          {visibleCount > 0 && (
            <span className="text-xs text-fg-subtle">{visibleCount}일 데이터</span>
          )}
          {editable && visibleCount > 0 && (
            <span className="text-xs text-fg-subtle">· 행 클릭 시 상세 보기</span>
          )}
        </div>

        {editable && (
          <Button variant="outline" size="sm" onClick={onRequestAdd}>
            <i className="bx bx-plus text-sm" />
            행 추가
          </Button>
        )}
      </div>

      <DailyTable
        rows={rows}
        diff={tabDiff}
        mediaLabel={campaignType}
        editable={editable}
        onEdit={onRequestEdit}
        onDelete={(date) => pendingRows.stageDelete(campaignType, date)}
        onRestoreDelete={(date) => pendingRows.unstage(campaignType, date)}
      />
    </div>
  );
}
