'use client';

import { useMutation } from '@tanstack/react-query';
import Alert from '@/components/ui/Alert';
import Button from '@/components/ui/Button';
import { downloadBlob, exportToExcel, previewReport } from '@/lib/marketingClient';

interface CsvUploadFlowProps {
  files: File[];
  /** CSV 는 여러 개를 이어 붙일 수 있다 */
  onAddFiles: (files: File[]) => void;
  /** 저장 성공 — 상위가 파일 선택을 초기화한다 */
  onSaved: (message: string, undoId?: string) => void;
  onError?: (message: string) => void;
}

/**
 * 매체·전환 CSV 업로드 흐름.
 *
 * 서버가 분석해 바로 DB에 저장한다. 기간을 고르는 단계가 없다 — 파일 안의 날짜를
 * 서버가 읽어 알아서 넣기 때문이다. Excel 흐름과는 엔드포인트도 절차도 다르다.
 */
export default function CsvUploadFlow({
  files,
  onAddFiles,
  onSaved,
  onError,
}: CsvUploadFlowProps) {
  const save = useMutation({
    mutationFn: () => previewReport(files),
    onSuccess: (data) => onSaved('데이터가 DB에 저장되었습니다.', data.undo_id),
    onError: (err) => onError?.(err.message),
  });

  const exportOnly = useMutation({
    mutationFn: () => exportToExcel(files),
    onSuccess: (blob) =>
      downloadBlob(blob, `마케팅분석_${new Date().toISOString().slice(0, 10)}.xlsx`),
  });

  const busy = save.isPending || exportOnly.isPending;
  const error = save.error ?? exportOnly.error;

  return (
    <>
      <button
        type="button"
        onClick={() => document.getElementById('csv-add-more')?.click()}
        className="w-full rounded-lg border border-dashed border-border py-2.5 text-xs font-medium
          text-fg-muted hover:border-primary/60 hover:text-primary transition-colors
          focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
      >
        <i className="bx bx-plus mr-1" />
        CSV 파일 추가
      </button>
      <input
        id="csv-add-more"
        type="file"
        accept=".csv"
        multiple
        className="sr-only"
        onChange={(e) => {
          onAddFiles(Array.from(e.target.files ?? []));
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

      {error && <Alert>{error.message}</Alert>}

      <div className="flex flex-col-reverse sm:flex-row sm:items-center gap-2 pt-1">
        <Button
          variant="outline"
          className="sm:flex-1"
          onClick={() => exportOnly.mutate()}
          isLoading={exportOnly.isPending}
          disabled={busy}
        >
          {!exportOnly.isPending && <i className="bx bx-download text-lg" />}
          저장 없이 엑셀만 받기
        </Button>

        <Button
          className="sm:flex-1"
          onClick={() => save.mutate()}
          isLoading={save.isPending}
          disabled={busy}
        >
          {!save.isPending && <i className="bx bx-data text-lg" />}
          DB 저장 &amp; 리포트 보기
        </Button>
      </div>
    </>
  );
}
