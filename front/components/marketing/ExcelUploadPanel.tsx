'use client';

import { useRef, useState } from 'react';
import { loadExcelReports, saveExcelData, saveFileWithPicker } from '@/lib/marketingClient';
import type { ExcelReport } from '@/types/marketing';
import ExcelReportView from '@/components/marketing/ExcelReportView';
import Button from '@/components/ui/Button';

interface ExcelUploadPanelProps {
  onSuccess?: (message: string) => void;
  onError?: (message: string) => void;
  /** 제공 시 로딩을 호출자(HomeClient)가 백그라운드로 처리함 */
  onRequestLoad?: (file: File, fileName: string) => void;
}

export default function ExcelUploadPanel({
  onSuccess,
  onError,
  onRequestLoad,
}: ExcelUploadPanelProps = {}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  // 한 파일에 5월·6월처럼 여러 달이 있으면 리포트도 달마다 하나씩 들어온다
  const [reports, setReports] = useState<ExcelReport[]>([]);
  const [activePeriod, setActivePeriod] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);
  // 저장 대상으로 고른 기간. 불러오기 직후에는 전체 선택 상태로 시작한다.
  const [selected, setSelected] = useState<string[]>([]);
  const [replace, setReplace] = useState(false);
  const [confirmReplace, setConfirmReplace] = useState(false);

  const activeReport = reports.find((r) => r.period === activePeriod) ?? reports[0] ?? null;
  const allChecked = reports.length > 0 && selected.length === reports.length;

  function clearReports() {
    setReports([]);
    setActivePeriod(null);
    setSelected([]);
    setConfirmReplace(false);
  }

  function handleFile(f: File) {
    setFile(f);
    clearReports();
    setError(null);
    setSaveMsg(null);
  }

  function togglePeriod(period: string) {
    setConfirmReplace(false);
    setSelected((prev) =>
      prev.includes(period) ? prev.filter((p) => p !== period) : [...prev, period],
    );
  }

  function toggleAll() {
    setConfirmReplace(false);
    setSelected(allChecked ? [] : reports.map((r) => r.period));
  }

  async function handleLoad() {
    if (!file) return;
    if (onRequestLoad) {
      onRequestLoad(file, file.name);
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      const data = await loadExcelReports(file);
      setReports(data);
      setActivePeriod(data[0]?.period ?? null);
      setSelected(data.map((r) => r.period));
    } catch (err) {
      const msg = err instanceof Error ? err.message : '불러오기 실패';
      setError(msg);
      onError?.(msg);
    } finally {
      setIsLoading(false);
    }
  }

  async function handleSaveDb() {
    if (!file) return;
    // 아직 불러오기 전이면 기간을 모르니 파일 전체를 그대로 저장한다.
    const periods = reports.length > 0 ? selected : undefined;
    if (periods && periods.length === 0) {
      setError('저장할 기간을 하나 이상 선택하세요.');
      return;
    }
    // 덮어쓰기는 되돌릴 수 없으므로 한 번 더 확인받는다.
    if (replace && !confirmReplace) {
      setConfirmReplace(true);
      return;
    }

    setConfirmReplace(false);
    setIsSaving(true);
    setSaveMsg(null);
    setError(null);
    try {
      const result = await saveExcelData(file, replace, periods);
      setSaveMsg(result.message);
      onSuccess?.(result.message);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'DB 저장 실패';
      setError(msg);
      onError?.(msg);
    } finally {
      setIsSaving(false);
    }
  }

  function handleDownload() {
    if (!file) return;
    // 클릭 핸들러에서 곧바로 호출 — 사이에 await가 없어야 저장 위치 대화상자가 뜬다
    saveFileWithPicker(file, file.name).catch(() => {
      setError('파일 저장에 실패했습니다.');
    });
  }

  function handleReset() {
    setFile(null);
    clearReports();
    setError(null);
    setSaveMsg(null);
  }

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-slate-200/60 bg-slate-50/30 p-5 sm:p-6">
        <p className="text-xs text-slate-500 mb-4 leading-relaxed">
          매체 모니터링 Excel(.xlsx)을 올려 미리보기한 뒤, 필요하면 DB에 저장하세요.
          한 파일에 여러 달(예: 5월·6월)이 들어 있으면 달마다 나눠서 보여주고, 저장도 달별로 나눠 들어갑니다.
        </p>

        {/* 드롭존 */}
        <div
          onClick={() => inputRef.current?.click()}
          className={`rounded-xl border-2 border-dashed cursor-pointer transition-colors flex flex-col items-center justify-center py-10 gap-3
            ${file ? 'border-emerald-300 bg-emerald-50/40' : 'border-slate-200 hover:border-emerald-300 hover:bg-emerald-50/20'}`}
        >
          {file ? (
            <>
              <i className="bx bx-check-circle text-4xl text-emerald-500" />
              <p className="font-medium text-slate-700">{file.name}</p>
              <p className="text-xs text-slate-400">{(file.size / 1024 / 1024).toFixed(1)} MB</p>
            </>
          ) : (
            <>
              <i className="bx bx-cloud-upload text-4xl text-slate-300" />
              <p className="text-sm text-slate-500">Excel 파일을 클릭해서 선택하세요</p>
              <p className="text-xs text-slate-400">.xlsx 형식만 지원</p>
            </>
          )}
        </div>
        <input
          ref={inputRef}
          type="file"
          accept=".xlsx"
          className="sr-only"
          onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
        />

        {error && (
          <div className="mt-4 flex items-center gap-2 rounded-xl bg-red-50 border border-red-100 px-4 py-3">
            <i className="bx bx-error-circle text-red-500 shrink-0" />
            <p className="text-sm text-red-600">{error}</p>
          </div>
        )}
        {saveMsg && (
          <div className="mt-4 flex items-center gap-2 rounded-xl bg-emerald-50 border border-emerald-100 px-4 py-3">
            <i className="bx bx-check-circle text-emerald-500 shrink-0" />
            <p className="text-sm text-emerald-700">{saveMsg}</p>
          </div>
        )}

        {/* 저장 범위 — 불러온 뒤에만, 기간이 여러 개일 때 의미가 있다 */}
        {reports.length > 0 && (
          <div className="mt-4 rounded-xl border border-slate-200 bg-white px-4 py-3.5">
            <div className="flex items-center justify-between gap-3 mb-2.5">
              <p className="text-xs font-semibold text-slate-600">저장할 기간</p>
              {reports.length > 1 && (
                <button
                  onClick={toggleAll}
                  className="text-xs font-medium text-blue-600 hover:text-blue-700 transition-colors"
                >
                  {allChecked ? '전체 해제' : '전체 선택'}
                </button>
              )}
            </div>

            <div className="flex flex-wrap gap-2">
              {reports.map((r) => {
                const checked = selected.includes(r.period);
                return (
                  <label
                    key={r.period}
                    className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-xs font-semibold cursor-pointer transition-all ${
                      checked
                        ? 'border-emerald-300 bg-emerald-50 text-emerald-800'
                        : 'border-slate-200 bg-slate-50 text-slate-500 hover:border-slate-300'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => togglePeriod(r.period)}
                      className="w-3.5 h-3.5 rounded accent-emerald-600"
                    />
                    {r.period}
                    <span className="font-normal text-slate-400">
                      {r.daily_total.length}일
                    </span>
                  </label>
                );
              })}
            </div>

            <label className="mt-3 flex items-center gap-2 text-xs text-slate-600 cursor-pointer w-fit">
              <input
                type="checkbox"
                checked={replace}
                onChange={(e) => {
                  setReplace(e.target.checked);
                  setConfirmReplace(false);
                }}
                className="w-3.5 h-3.5 rounded accent-red-600"
              />
              기존 데이터 덮어쓰기
              <span className="text-slate-400">
                (선택한 기간의 기존 행을 지우고 이 파일로 교체)
              </span>
            </label>
          </div>
        )}

        {/* 덮어쓰기 확인 — 되돌릴 수 없으므로 한 번 더 묻는다 */}
        {confirmReplace && (
          <div className="mt-3 flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
            <i className="bx bx-error text-amber-500 text-lg shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-amber-800">기존 데이터를 교체하시겠습니까?</p>
              <p className="text-xs text-amber-700 mt-0.5">
                <strong>{selected.join(', ')}</strong> 기간의 기존 데이터를 모두 삭제하고 이 파일로
                교체합니다. 이 작업은 되돌릴 수 없습니다. 아래 &lsquo;덮어쓰기 저장&rsquo;을 한 번 더
                누르면 실행됩니다.
              </p>
            </div>
            <button
              onClick={() => setConfirmReplace(false)}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-white border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors shrink-0"
            >
              취소
            </button>
          </div>
        )}

        <div className="mt-5 flex gap-2">
          <Button
            className="flex-1"
            onClick={handleLoad}
            isLoading={isLoading}
            disabled={!file || isLoading || isSaving}
          >
            {!isLoading && <i className="bx bx-bar-chart-alt-2 text-lg" />}
            {isLoading ? '불러오는 중...' : '리포트 보기'}
          </Button>
          {file && (
            <>
              <Button
                variant="ghost"
                className={`flex-1 border ${
                  replace
                    ? 'border-red-200 text-red-700 hover:bg-red-50'
                    : 'border-emerald-200 text-emerald-700 hover:bg-emerald-50'
                }`}
                onClick={handleSaveDb}
                isLoading={isSaving}
                disabled={isLoading || isSaving || (reports.length > 0 && selected.length === 0)}
                title={
                  reports.length > 0
                    ? `${selected.join(', ') || '선택 없음'} 저장`
                    : '파일 전체 저장'
                }
              >
                {!isSaving && <i className="bx bx-data text-lg" />}
                {isSaving
                  ? '저장 중...'
                  : replace
                    ? confirmReplace
                      ? '덮어쓰기 저장'
                      : '덮어쓰기'
                    : 'DB 저장'}
              </Button>
              <Button
                variant="ghost"
                className="border border-slate-200"
                onClick={handleDownload}
                disabled={isLoading || isSaving}
                title="파일 다운로드"
              >
                <i className="bx bx-download text-lg" />
              </Button>
              <Button
                variant="ghost"
                className="border border-slate-200"
                onClick={handleReset}
                title="초기화"
              >
                <i className="bx bx-refresh text-lg" />
              </Button>
            </>
          )}
        </div>
      </div>

      {/* 기간이 2개 이상이면 달 선택 바를 먼저 보여준다 */}
      {reports.length > 1 && (
        <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5">
          {reports.map((r) => (
            <button
              key={r.period}
              onClick={() => setActivePeriod(r.period)}
              className={`px-3.5 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition-all shrink-0 ${
                activeReport?.period === r.period
                  ? 'bg-indigo-600 text-white shadow-sm shadow-indigo-600/20'
                  : 'bg-slate-100 text-slate-500 hover:bg-slate-200 hover:text-slate-700'
              }`}
            >
              {r.period}
            </button>
          ))}
        </div>
      )}

      {activeReport && <ExcelReportView data={activeReport} onClose={clearReports} />}
    </div>
  );
}
