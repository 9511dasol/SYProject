'use client';

import { useRef, useState } from 'react';
import { downloadBlob, loadExcelReport, saveExcelData } from '@/lib/marketingClient';
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
  const [report, setReport] = useState<ExcelReport | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);

  function handleFile(f: File) {
    setFile(f);
    setReport(null);
    setError(null);
    setSaveMsg(null);
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
      const data = await loadExcelReport(file);
      setReport(data);
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
    setIsSaving(true);
    setSaveMsg(null);
    setError(null);
    try {
      const result = await saveExcelData(file);
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
    downloadBlob(file, file.name);
  }

  function handleReset() {
    setFile(null);
    setReport(null);
    setError(null);
    setSaveMsg(null);
  }

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-slate-200/60 bg-slate-50/30 p-5 sm:p-6">
        <p className="text-xs text-slate-500 mb-4 leading-relaxed">
          매체 모니터링 Excel(.xlsx)을 올려 미리보기한 뒤, 필요하면 DB에 저장하세요.
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
                className="flex-1 border border-emerald-200 text-emerald-700 hover:bg-emerald-50"
                onClick={handleSaveDb}
                isLoading={isSaving}
                disabled={isLoading || isSaving}
              >
                {!isSaving && <i className="bx bx-data text-lg" />}
                {isSaving ? '저장 중...' : 'DB 저장'}
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

      {report && <ExcelReportView data={report} onClose={() => setReport(null)} />}
    </div>
  );
}
