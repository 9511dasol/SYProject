'use client';

import { useCallback, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  downloadBlob,
  exportToExcel,
  getPeriods,
  loadExcelReports,
  previewReport,
  saveExcelData,
} from '@/lib/marketingClient';
import { queryKeys } from '@/lib/queryKeys';
import type { ExcelReport } from '@/types/marketing';
import Button from '@/components/ui/Button';

interface UploadPanelProps {
  onSuccess?: (message: string, undoId?: string) => void;
  onError?: (message: string) => void;
  /** 엑셀 리포트를 대시보드 탭으로 여는 경로 (DashboardClient 가 백그라운드로 처리) */
  onRequestLoad?: (file: File, fileName: string) => void;
  /** 홈 카드에 파일을 떨궈 열렸을 때 미리 채워지는 파일 */
  initialFiles?: File[];
}

type Kind = 'csv' | 'xlsx';

const CSV_EXT = /\.csv$/i;
const XLSX_EXT = /\.xlsx$/i;
const PERIOD_LABEL = /(\d{2,4})\s*년\s*(\d{1,2})\s*월/;

function kindOf(files: File[]): Kind | null {
  if (files.length === 0) return null;
  if (files.every((f) => CSV_EXT.test(f.name))) return 'csv';
  if (files.length === 1 && XLSX_EXT.test(files[0].name)) return 'xlsx';
  return null;
}

/** "26년 5월" → {year: 2026, month: 5}. DB 기간 목록과 맞춰 보기 위한 것. */
function parsePeriodLabel(label: string): { year: number; month: number } | null {
  const m = PERIOD_LABEL.exec(label);
  if (!m) return null;
  const year = Number(m[1]);
  return { year: year < 100 ? 2000 + year : year, month: Number(m[2]) };
}

function formatSize(bytes: number): string {
  return bytes >= 1024 * 1024
    ? `${(bytes / 1024 / 1024).toFixed(1)} MB`
    : `${(bytes / 1024).toFixed(0)} KB`;
}

// ── 단계 표시 ─────────────────────────────────────────────────────────────────

function Steps({ step }: { step: 1 | 2 }) {
  const items = ['파일', '확인'] as const;
  return (
    <div className="flex items-center gap-2 text-xs">
      {items.map((label, i) => {
        const index = (i + 1) as 1 | 2;
        const done = step > index;
        const active = step === index;
        return (
          <div key={label} className="flex items-center gap-2">
            {i > 0 && <span className="w-6 h-px bg-border" />}
            <span
              className={`inline-flex items-center gap-1.5 font-medium
                ${active ? 'text-primary' : done ? 'text-fg-muted' : 'text-fg-subtle'}`}
            >
              <span
                className={`w-4.5 h-4.5 rounded-full flex items-center justify-center text-[10px] font-bold
                  ${active ? 'bg-primary text-white' : done ? 'bg-fg-subtle/30 text-fg-muted' : 'bg-surface-3 text-fg-subtle'}`}
              >
                {done ? <i className="bx bx-check" /> : index}
              </span>
              {label}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ── 드롭존 ────────────────────────────────────────────────────────────────────

function DropZone({ onFiles }: { onFiles: (files: File[]) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);

  return (
    <>
      <div
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          // preventDefault 를 빠뜨리면 브라우저가 그 파일로 페이지를 이동시켜
          // 작업하던 화면이 통째로 날아간다.
          e.preventDefault();
          setOver(false);
          onFiles(Array.from(e.dataTransfer.files));
        }}
        className={`rounded-xl border-2 border-dashed cursor-pointer transition-colors
          flex flex-col items-center justify-center py-12 gap-2 text-center
          ${over
            ? 'border-primary bg-primary-soft/40 dark:bg-primary-soft/10'
            : 'border-border hover:border-primary/60 hover:bg-surface-2'}`}
      >
        <i className={`bx bx-cloud-upload text-4xl ${over ? 'text-primary' : 'text-fg-subtle'}`} />
        <p className="text-sm font-medium text-fg">
          여기에 끌어다 놓거나 <span className="text-primary">클릭해서 선택</span>
        </p>
        <p className="text-xs text-fg-subtle">
          매체·전환 <strong className="font-semibold">.csv</strong> 여러 개 &nbsp;·&nbsp;
          리포트 <strong className="font-semibold">.xlsx</strong> 한 개
        </p>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept=".csv,.xlsx"
        multiple
        className="sr-only"
        onChange={(e) => {
          onFiles(Array.from(e.target.files ?? []));
          e.target.value = '';
        }}
      />
      <p className="mt-3 text-xs text-fg-subtle leading-relaxed">
        어떤 방식인지는 확장자로 알아서 판단합니다. CSV 는 분석해서 DB에 저장하고,
        엑셀은 담긴 기간을 읽어 원하는 달만 골라 저장합니다.
      </p>
    </>
  );
}

// ── 파일 목록 ─────────────────────────────────────────────────────────────────

function FileRow({ file, onRemove }: { file: File; onRemove?: () => void }) {
  return (
    <li className="flex items-center gap-2.5 rounded-lg border border-border bg-surface-2 px-3 py-2.5">
      <i className="bx bx-file-blank text-lg text-primary shrink-0" />
      <span className="flex-1 truncate text-sm text-fg">{file.name}</span>
      <span className="text-xs text-fg-subtle tabular-nums shrink-0">{formatSize(file.size)}</span>
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          aria-label={`${file.name} 제거`}
          className="shrink-0 text-fg-subtle hover:text-red-500 transition-colors"
        >
          <i className="bx bx-x text-lg" />
        </button>
      )}
    </li>
  );
}

// ── 메인 ─────────────────────────────────────────────────────────────────────

export default function UploadPanel({
  onSuccess,
  onError,
  onRequestLoad,
  initialFiles,
}: UploadPanelProps = {}) {
  const [files, setFiles] = useState<File[]>(initialFiles ?? []);
  const [error, setError] = useState<string | null>(null);

  // xlsx 분석 결과 — 어떤 기간이 담겼는지 보여주고 고르게 하려면 먼저 읽어야 한다
  const [reports, setReports] = useState<ExcelReport[] | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [replace, setReplace] = useState(false);
  const [saveComment, setSaveComment] = useState(true);
  const [confirming, setConfirming] = useState(false);

  const [busy, setBusy] = useState<null | 'save' | 'export'>(null);

  // 이미 DB에 있는 기간 — 저장 전에 "덮어쓰게 되는지"를 알려준다
  const { data: dbPeriods = [] } = useQuery({
    queryKey: queryKeys.periods(),
    queryFn: getPeriods,
  });

  const kind = kindOf(files);
  const step: 1 | 2 = files.length === 0 ? 1 : 2;

  const analyze = useCallback(async (file: File) => {
    setAnalyzing(true);
    try {
      const data = await loadExcelReports(file);
      setReports(data);
      setSelected(data.map((r) => r.period));
    } catch (err) {
      // 못 읽어도 막지는 않는다 — 기간을 못 고를 뿐 파일 전체 저장은 가능하다
      setError(err instanceof Error ? err.message : '엑셀을 읽지 못했습니다.');
      setReports([]);
    } finally {
      setAnalyzing(false);
    }
  }, []);

  const handleFiles = useCallback(
    (incoming: File[]) => {
      const accepted = incoming.filter((f) => CSV_EXT.test(f.name) || XLSX_EXT.test(f.name));
      if (accepted.length === 0) {
        setError('.csv 또는 .xlsx 파일만 올릴 수 있습니다.');
        return;
      }

      const next = XLSX_EXT.test(accepted[0].name)
        ? accepted.slice(0, 1) // 엑셀은 한 번에 한 개만
        : [...files.filter((f) => CSV_EXT.test(f.name)), ...accepted.filter((f) => CSV_EXT.test(f.name))]
            .filter((f, i, all) => all.findIndex((o) => o.name === f.name && o.size === f.size) === i);

      if (kindOf(next) === null) {
        setError('CSV 와 Excel 은 함께 올릴 수 없습니다. 한 종류씩 올려 주세요.');
        return;
      }

      setError(null);
      setReports(null);
      setSelected([]);
      setConfirming(false);
      setFiles(next);
      if (XLSX_EXT.test(next[0].name)) void analyze(next[0]);
    },
    [files, analyze],
  );

  function reset() {
    setFiles([]);
    setReports(null);
    setSelected([]);
    setReplace(false);
    setSaveComment(true);
    setConfirming(false);
    setError(null);
  }

  // ── CSV 경로 ───────────────────────────────────────────────────────────────

  async function handleCsvSave() {
    setBusy('save');
    setError(null);
    try {
      const data = await previewReport(files);
      onSuccess?.('데이터가 DB에 저장되었습니다.', data.undo_id);
      reset();
    } catch (err) {
      const msg = err instanceof Error ? err.message : '분석 중 오류가 발생했습니다.';
      setError(msg);
      onError?.(msg);
    } finally {
      setBusy(null);
    }
  }

  async function handleCsvExport() {
    setBusy('export');
    setError(null);
    try {
      const blob = await exportToExcel(files);
      downloadBlob(blob, `마케팅분석_${new Date().toISOString().slice(0, 10)}.xlsx`);
    } catch (err) {
      setError(err instanceof Error ? err.message : '엑셀 생성 중 오류가 발생했습니다.');
    } finally {
      setBusy(null);
    }
  }

  // ── Excel 경로 ─────────────────────────────────────────────────────────────

  const existingPeriods = new Set(dbPeriods.map((p) => `${p.year}-${p.month}`));
  const periodHasData = (label: string) => {
    const parsed = parsePeriodLabel(label);
    return parsed ? existingPeriods.has(`${parsed.year}-${parsed.month}`) : false;
  };
  const overwriting = selected.filter(periodHasData);

  // 파일에 코멘트(summary B32)가 담긴 기간. 엑셀 내보내기가 이 값을 다시 써 넣으므로,
  // 저장하지 않으면 업로드 → 내보내기를 한 바퀴 돌 때마다 코멘트가 사라진다.
  const withComment = (reports ?? []).filter(
    (r) => selected.includes(r.period) && r.comment?.trim(),
  );

  async function handleExcelSave() {
    if (replace && !confirming) {
      setConfirming(true);
      return;
    }
    setConfirming(false);
    setBusy('save');
    setError(null);
    try {
      const periods = reports && reports.length > 0 ? selected : undefined;
      const result = await saveExcelData(files[0], replace, periods, saveComment);
      onSuccess?.(result.message);
      reset();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'DB 저장 실패';
      setError(msg);
      onError?.(msg);
    } finally {
      setBusy(null);
    }
  }

  // ── 렌더 ───────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <Steps step={step} />
        {step === 2 && (
          <button
            onClick={reset}
            className="text-xs font-medium text-fg-subtle hover:text-fg transition-colors"
          >
            <i className="bx bx-refresh mr-1" />
            다시 선택
          </button>
        )}
      </div>

      {step === 1 && <DropZone onFiles={handleFiles} />}

      {step === 2 && (
        <div className="space-y-4">
          <ul className="space-y-1.5">
            {files.map((f, i) => (
              <FileRow
                key={`${f.name}-${i}`}
                file={f}
                onRemove={
                  kind === 'csv'
                    ? () => setFiles((prev) => prev.filter((_, idx) => idx !== i))
                    : undefined
                }
              />
            ))}
          </ul>

          {kind === 'csv' && (
            <>
              <button
                onClick={() => document.getElementById('upload-more')?.click()}
                className="w-full rounded-lg border border-dashed border-border py-2.5 text-xs font-medium
                  text-fg-muted hover:border-primary/60 hover:text-primary transition-colors"
              >
                <i className="bx bx-plus mr-1" />
                CSV 파일 추가
              </button>
              <input
                id="upload-more"
                type="file"
                accept=".csv"
                multiple
                className="sr-only"
                onChange={(e) => {
                  handleFiles(Array.from(e.target.files ?? []));
                  e.target.value = '';
                }}
              />
              <p className="rounded-lg bg-surface-2 px-3.5 py-3 text-xs text-fg-muted leading-relaxed">
                매체·전환 파일을 자동으로 분류해 분석한 뒤 <strong className="text-fg">바로 DB에 저장</strong>합니다.
                저장 직후 뜨는 알림에서 되돌릴 수 있습니다.
                <br />
                <strong className="text-fg">한 파일만 올려도 됩니다.</strong> 이번에 올리지 않은 쪽
                (전환만 올리면 노출·클릭·비용)은 이미 저장된 값을 그대로 두고, 저장된 값이 없으면 0으로 채웁니다.
              </p>
            </>
          )}

          {kind === 'xlsx' && (
            <div className="rounded-xl border border-border bg-surface-2 px-4 py-3.5">
              {analyzing ? (
                <div className="flex items-center gap-2 py-1 text-xs text-fg-muted">
                  <span className="w-3.5 h-3.5 rounded-full border-2 border-border border-t-primary animate-spin" />
                  파일에 담긴 기간을 읽는 중…
                </div>
              ) : reports && reports.length > 0 ? (
                <>
                  <div className="flex items-center justify-between gap-3 mb-2.5">
                    <p className="text-xs font-semibold text-fg">
                      저장할 기간
                      <span className="ml-1.5 font-normal text-fg-subtle">
                        {reports.length}개 중 {selected.length}개 선택
                      </span>
                    </p>
                    {reports.length > 1 && (
                      <button
                        onClick={() => {
                          setConfirming(false);
                          setSelected(
                            selected.length === reports.length ? [] : reports.map((r) => r.period),
                          );
                        }}
                        className="text-xs font-medium text-primary hover:brightness-110"
                      >
                        {selected.length === reports.length ? '전체 해제' : '전체 선택'}
                      </button>
                    )}
                  </div>

                  {/* 기간이 많은 파일(17개까지 봤다)은 목록만 스크롤시켜 모달이 늘어나지 않게 한다 */}
                  <div className="max-h-56 overflow-y-auto -mx-1 px-1 grid sm:grid-cols-2 gap-1.5">
                    {reports.map((r) => {
                      const checked = selected.includes(r.period);
                      const exists = periodHasData(r.period);
                      return (
                        <label
                          key={r.period}
                          className={`flex items-center gap-2 px-2.5 py-2 rounded-lg border text-xs cursor-pointer transition-colors
                            ${checked
                              ? 'border-primary/60 bg-primary-soft/50 dark:bg-primary-soft/15'
                              : 'border-border bg-surface hover:border-fg-subtle/40'}`}
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => {
                              setConfirming(false);
                              setSelected((prev) =>
                                prev.includes(r.period)
                                  ? prev.filter((p) => p !== r.period)
                                  : [...prev, r.period],
                              );
                            }}
                            className="w-3.5 h-3.5 rounded accent-primary"
                          />
                          <span className="font-semibold text-fg">{r.period}</span>
                          <span className="text-fg-subtle tabular-nums">
                            {r.daily_total.length}일
                          </span>
                          {exists && (
                            <span
                              className="ml-auto text-[10px] font-medium text-amber-600 dark:text-amber-400"
                              title="DB에 이미 이 기간의 데이터가 있습니다"
                            >
                              기존 있음
                            </span>
                          )}
                        </label>
                      );
                    })}
                  </div>

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
                                ? 'border-red-300 bg-red-50 dark:border-red-900/50 dark:bg-red-950/20'
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
          )}

          {/* 덮어쓰기 확인 — 되돌릴 수 없으므로 실행 버튼과 분리해 한 번 더 묻는다 */}
          {confirming && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3.5
              dark:border-amber-900/50 dark:bg-amber-950/20">
              <p className="text-sm font-semibold text-amber-800 dark:text-amber-300">
                기존 데이터를 지우고 교체합니다
              </p>
              <p className="mt-1 text-xs text-amber-700 dark:text-amber-400/90 leading-relaxed">
                {overwriting.length > 0 ? (
                  <>
                    <strong>{overwriting.join(', ')}</strong> 의 기존 행이 삭제됩니다.
                    되돌릴 수 없습니다.
                  </>
                ) : (
                  <>선택한 기간의 기존 행이 삭제됩니다. 되돌릴 수 없습니다.</>
                )}
              </p>
              <div className="mt-3 flex gap-2">
                <Button
                  variant="outline"
                  className="px-3! py-1.5! text-xs!"
                  onClick={() => setConfirming(false)}
                >
                  취소
                </Button>
                <button
                  onClick={handleExcelSave}
                  className="rounded-xl bg-red-600 px-3 py-1.5 text-xs font-semibold text-white
                    hover:brightness-110 transition-all"
                >
                  지우고 저장
                </button>
              </div>
            </div>
          )}

          {error && (
            <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3
              dark:border-red-900/50 dark:bg-red-950/20">
              <i className="bx bx-error-circle text-red-500 dark:text-red-400 shrink-0 mt-0.5" />
              <p className="text-sm text-red-600 dark:text-red-400 leading-relaxed">{error}</p>
            </div>
          )}

          {/* 액션 — 주 버튼 하나, 나머지는 보조 */}
          <div className="flex flex-col-reverse sm:flex-row sm:items-center gap-2 pt-1">
            {kind === 'csv' && (
              <Button
                variant="outline"
                className="sm:flex-1 py-2.5!"
                onClick={handleCsvExport}
                isLoading={busy === 'export'}
                disabled={busy !== null}
              >
                {busy !== 'export' && <i className="bx bx-download text-lg" />}
                저장 없이 엑셀만 받기
              </Button>
            )}
            {kind === 'xlsx' && onRequestLoad && (
              <Button
                variant="outline"
                className="sm:flex-1 py-2.5!"
                onClick={() => onRequestLoad(files[0], files[0].name)}
                disabled={busy !== null}
              >
                <i className="bx bx-bar-chart-alt-2 text-lg" />
                리포트로 열기
              </Button>
            )}

            <Button
              className="sm:flex-1 py-2.5!"
              onClick={kind === 'csv' ? handleCsvSave : handleExcelSave}
              isLoading={busy === 'save'}
              disabled={
                busy !== null
                || analyzing
                || confirming
                || (kind === 'xlsx' && reports !== null && reports.length > 0 && selected.length === 0)
              }
            >
              {busy !== 'save' && <i className="bx bx-data text-lg" />}
              {kind === 'csv'
                ? 'DB 저장 & 리포트 보기'
                : selected.length > 0
                  ? `${selected.length}개 기간 저장`
                  : 'DB에 저장'}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
