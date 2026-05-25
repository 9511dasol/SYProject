'use client';

import { useState } from 'react';
import {
  downloadBlob,
  exportToExcel,
  previewReport,
} from '@/lib/marketingClient';
import type { ReportData } from '@/types/marketing';
import FileInput from '@/components/marketing/FileInput';
import ReportView from '@/components/marketing/ReportView';
import Button from '@/components/ui/Button';

interface UploadFormProps {
  onSuccess?: (message: string, undoId?: string) => void;
  onError?: (message: string) => void;
}

export default function UploadForm({ onSuccess, onError }: UploadFormProps = {}) {
  const [files, setFiles] = useState<File[]>([]);
  const [isExporting, setIsExporting] = useState(false);
  const [isPreviewing, setIsPreviewing] = useState(false);
  const [report, setReport] = useState<ReportData | null>(null);
  const [error, setError] = useState<string | null>(null);

  const isReady = files.length > 0;
  const isBusy = isExporting || isPreviewing;

  async function handleExport() {
    if (!isReady) return;
    setIsExporting(true);
    setError(null);
    try {
      const blob = await exportToExcel(files);
      const now = new Date().toISOString().slice(0, 10);
      downloadBlob(blob, `마케팅분석_${now}.xlsx`);
    } catch (err) {
      setError(err instanceof Error ? err.message : '엑셀 생성 중 오류가 발생했습니다.');
    } finally {
      setIsExporting(false);
    }
  }

  async function handlePreview() {
    if (!isReady) return;
    setIsPreviewing(true);
    setError(null);
    setReport(null);
    try {
      const data = await previewReport(files);
      setReport(data);
      onSuccess?.('데이터가 DB에 저장되었습니다.', data.undo_id);
    } catch (err) {
      const msg = err instanceof Error ? err.message : '리포트 생성 중 오류가 발생했습니다.';
      setError(msg);
      onError?.(msg);
    } finally {
      setIsPreviewing(false);
    }
  }

  return (
    <section className="w-full">
      <div className="rounded-xl border border-slate-200/60 bg-slate-50/30 p-5 sm:p-6">
        <p className="text-xs text-slate-500 mb-4 leading-relaxed">
          매체·전환 CSV를 함께 선택하면 자동으로 분류한 뒤 DB에 저장하고 리포트를 표시합니다.
        </p>

        {/* 파일 선택 */}
        <FileInput
          id="marketing-files"
          label="CSV 파일 선택"
          icon="bx-spreadsheet"
          files={files}
          onChange={setFiles}
        />

        {/* 에러 메시지 */}
        {error && (
          <div className="mt-4 flex items-center gap-2 rounded-xl bg-red-50 border border-red-100 px-4 py-3">
            <i className="bx bx-error-circle text-red-500 shrink-0" />
            <p className="text-sm text-red-600">{error}</p>
          </div>
        )}

        {/* 액션 버튼 */}
        <div className="mt-6 flex flex-col sm:flex-row gap-3">
          <Button
            className="flex-1"
            onClick={handlePreview}
            isLoading={isPreviewing}
            disabled={!isReady || (isBusy && !isPreviewing)}
          >
            {!isPreviewing && <i className="bx bx-bar-chart-alt-2 text-lg" />}
            {isPreviewing
              ? '분석 중...'
              : isReady
                ? `총 ${files.length}개 · DB 저장 & 리포트 보기`
                : 'DB 저장 & 리포트 보기'}
          </Button>

          <Button
            variant="ghost"
            className="flex-1 border border-blue-200 hover:border-blue-400"
            onClick={handleExport}
            isLoading={isExporting}
            disabled={!isReady || (isBusy && !isExporting)}
          >
            {!isExporting && <i className="bx bx-spreadsheet text-lg" />}
            {isExporting ? '생성 중...' : '엑셀 다운로드'}
          </Button>
        </div>

        {!isReady && (
          <p className="text-xs text-center text-slate-400 mt-3">
            CSV 파일을 1개 이상 선택하세요
          </p>
        )}
      </div>

      {/* 리포트 뷰 */}
      {report && <ReportView data={report} onClose={() => setReport(null)} />}
    </section>
  );
}
