'use client';

import { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import Alert from '@/components/ui/Alert';
import Button from '@/components/ui/Button';
import { getPeriods, loadExcelReports, saveExcelData } from '@/lib/marketingClient';
import { queryKeys } from '@/lib/queryKeys';
import { parsePeriodLabel } from './fileKind';
import PeriodSelectList from './PeriodSelectList';

interface ExcelUploadFlowProps {
  file: File;
  onSaved: (message: string) => void;
  onError?: (message: string) => void;
  /** 저장하지 않고 대시보드 탭으로 열어보는 경로 */
  onRequestLoad?: (file: File, fileName: string) => void;
}

/**
 * 리포트 엑셀(.xlsx) 업로드 흐름.
 *
 * CSV 와 달리 먼저 파일을 읽어 담긴 기간을 보여주고, 사용자가 저장할 달을 고른다.
 * 기존 데이터를 지우고 교체하는 선택지가 있어 확인 단계도 따로 있다.
 */
export default function ExcelUploadFlow({
  file,
  onSaved,
  onError,
  onRequestLoad,
}: ExcelUploadFlowProps) {
  const [selected, setSelected] = useState<string[] | null>(null);
  const [replace, setReplace] = useState(false);
  const [saveComment, setSaveComment] = useState(true);
  const [confirming, setConfirming] = useState(false);

  /*
    파일에 담긴 기간을 먼저 읽는다. 파일 자체를 키로 쓰므로(name+size+lastModified)
    같은 파일을 다시 열면 캐시가 재사용되고, 다른 파일이면 새로 읽는다.
  */
  const analysis = useQuery({
    queryKey: ['excelAnalysis', file.name, file.size, file.lastModified],
    queryFn: () => loadExcelReports(file),
    staleTime: Infinity,
    retry: false,
  });

  const reports = analysis.data ?? null;

  // 분석 결과가 처음 도착하면 전체 선택으로 시작한다. 이후 선택은 사용자 것이다.
  const effectiveSelected = selected ?? reports?.map((r) => r.period) ?? [];

  // 이미 DB에 있는 기간 — 저장 전에 "덮어쓰게 되는지"를 알려준다
  const { data: dbPeriods = [] } = useQuery({
    queryKey: queryKeys.periods(),
    queryFn: getPeriods,
  });
  const existingPeriods = new Set(dbPeriods.map((p) => `${p.year}-${p.month}`));

  const hasExistingData = (label: string) => {
    const parsed = parsePeriodLabel(label);
    return parsed ? existingPeriods.has(`${parsed.year}-${parsed.month}`) : false;
  };
  const overwriting = effectiveSelected.filter(hasExistingData);

  /*
    파일에 코멘트(summary B32)가 담긴 기간. 엑셀 내보내기가 이 값을 다시 써 넣으므로,
    저장하지 않으면 업로드 → 내보내기를 한 바퀴 돌 때마다 코멘트가 사라진다.
  */
  const withComment = (reports ?? []).filter(
    (r) => effectiveSelected.includes(r.period) && r.comment?.trim(),
  );

  const save = useMutation({
    mutationFn: () => {
      // 기간을 못 읽었으면 undefined 를 보내 파일 전체를 저장한다
      const periods = reports && reports.length > 0 ? effectiveSelected : undefined;
      return saveExcelData(file, replace, periods, saveComment);
    },
    onSuccess: (result) => onSaved(result.message),
    onError: (err) => onError?.(err.message),
  });

  /** 교체 저장은 되돌릴 수 없으므로 실행 버튼과 분리해 한 번 더 묻는다 */
  const handleSaveClick = () => {
    if (replace && !confirming) {
      setConfirming(true);
      return;
    }
    setConfirming(false);
    save.mutate();
  };

  const updateSelection = (next: string[]) => {
    setSelected(next);
    setConfirming(false);
  };

  const nothingSelected =
    reports !== null && reports.length > 0 && effectiveSelected.length === 0;
  const error = analysis.error ?? save.error;

  return (
    <>
      <div className="rounded-xl border border-border bg-surface-2 px-4 py-3.5">
        {analysis.isPending ? (
          <div className="flex items-center gap-2 py-1 text-xs text-fg-muted">
            <span className="w-3.5 h-3.5 rounded-full border-2 border-border border-t-primary animate-spin" />
            파일에 담긴 기간을 읽는 중…
          </div>
        ) : reports && reports.length > 0 ? (
          <>
            <PeriodSelectList
              reports={reports}
              selected={effectiveSelected}
              onChange={updateSelection}
              hasExistingData={hasExistingData}
            />

            <fieldset className="mt-3.5 pt-3 border-t border-border-soft">
              <legend className="sr-only">저장 방식</legend>
              <div className="flex flex-col sm:flex-row gap-2">
                {([
                  { value: false, label: '새 데이터만 추가', hint: '같은 날짜는 최신 값으로 갱신' },
                  { value: true, label: '기존 지우고 교체', hint: '선택한 기간의 기존 행을 삭제' },
                ] as const).map((option) => (
                  <label
                    key={String(option.value)}
                    className={`flex-1 flex items-start gap-2 rounded-lg border px-3 py-2.5 cursor-pointer transition-colors
                      ${replace === option.value
                        ? option.value
                          ? 'border-badge-danger-bdr bg-badge-danger-bg'
                          : 'border-primary/60 bg-primary-soft/50 dark:bg-primary-soft/15'
                        : 'border-border hover:border-fg-subtle/40'}`}
                  >
                    <input
                      type="radio"
                      name="save-mode"
                      checked={replace === option.value}
                      onChange={() => {
                        setReplace(option.value);
                        setConfirming(false);
                      }}
                      className={`mt-0.5 w-3.5 h-3.5 ${option.value ? 'accent-red-600' : 'accent-primary'}`}
                    />
                    <span className="min-w-0">
                      <span className="block text-xs font-semibold text-fg">{option.label}</span>
                      <span className="block text-[11px] text-fg-subtle mt-0.5">{option.hint}</span>
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>

            {/* 코멘트는 실적과 별개로 marketing_period_meta 에 들어간다.
                파일에 코멘트가 담긴 기간이 있을 때만 물어본다. */}
            {withComment.length > 0 && (
              <label className="mt-3 flex items-start gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={saveComment}
                  onChange={(e) => setSaveComment(e.target.checked)}
                  className="mt-0.5 w-3.5 h-3.5 rounded accent-primary"
                />
                <span className="min-w-0">
                  <span className="block text-xs font-medium text-fg">
                    파일에 담긴 코멘트도 함께 저장
                    <span className="ml-1 font-normal text-fg-subtle">
                      {withComment.length}개 기간
                    </span>
                  </span>
                  <span className="block text-[11px] text-fg-subtle mt-0.5 leading-relaxed">
                    {withComment.map((r) => r.period).join(', ')} — 이미 저장된 코멘트가 있으면
                    덮어씁니다. 끄면 실적만 저장합니다.
                  </span>
                </span>
              </label>
            )}
          </>
        ) : (
          <p className="text-xs text-fg-muted leading-relaxed">
            기간을 읽지 못했습니다. 그대로 저장하면 파일에 담긴 모든 기간이 들어갑니다.
          </p>
        )}
      </div>

      {confirming && (
        <Alert tone="warn">
          <p className="font-semibold">기존 데이터를 지우고 교체합니다</p>
          <p className="mt-1 text-xs leading-relaxed">
            {overwriting.length > 0 ? (
              <>
                <strong>{overwriting.join(', ')}</strong> 의 기존 행이 삭제됩니다. 되돌릴 수 없습니다.
              </>
            ) : (
              <>선택한 기간의 기존 행이 삭제됩니다. 되돌릴 수 없습니다.</>
            )}
          </p>
          <div className="mt-3 flex gap-2">
            <Button variant="outline" size="sm" onClick={() => setConfirming(false)}>
              취소
            </Button>
            <Button tone="danger" size="sm" onClick={handleSaveClick} isLoading={save.isPending}>
              지우고 저장
            </Button>
          </div>
        </Alert>
      )}

      {error && <Alert>{error.message}</Alert>}

      <div className="flex flex-col-reverse sm:flex-row sm:items-center gap-2 pt-1">
        {onRequestLoad && (
          <Button
            variant="outline"
            className="sm:flex-1"
            onClick={() => onRequestLoad(file, file.name)}
            disabled={save.isPending}
          >
            <i className="bx bx-bar-chart-alt-2 text-lg" />
            리포트로 열기
          </Button>
        )}

        <Button
          className="sm:flex-1"
          onClick={handleSaveClick}
          isLoading={save.isPending}
          disabled={save.isPending || analysis.isPending || confirming || nothingSelected}
        >
          {!save.isPending && <i className="bx bx-data text-lg" />}
          {effectiveSelected.length > 0 ? `${effectiveSelected.length}개 기간 저장` : 'DB에 저장'}
        </Button>
      </div>
    </>
  );
}
