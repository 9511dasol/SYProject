'use client';

import { useCallback, useState } from 'react';
import Alert from '@/components/ui/Alert';
import CsvUploadFlow from '@/components/marketing/upload/CsvUploadFlow';
import ExcelUploadFlow from '@/components/marketing/upload/ExcelUploadFlow';
import { CSV_EXT, XLSX_EXT, kindOf } from '@/components/marketing/upload/fileKind';
import { FileRow, Steps, UploadDropZone } from '@/components/marketing/upload/UploadPieces';

interface UploadPanelProps {
  onSuccess?: (message: string, undoId?: string) => void;
  onError?: (message: string) => void;
  /** 엑셀 리포트를 대시보드 탭으로 여는 경로 (DashboardClient 가 백그라운드로 처리) */
  onRequestLoad?: (file: File, fileName: string) => void;
  /** 홈 카드에 파일을 떨궈 열렸을 때 미리 채워지는 파일 */
  initialFiles?: File[];
}

/**
 * 업로드 패널 — 파일을 고르는 데까지가 이 컴포넌트의 일이다.
 *
 * 고른 파일의 확장자에 따라 완전히 다른 흐름으로 넘긴다. 예전에는 `kind` 변수 하나
 * 뒤에 두 흐름(CSV·Excel)이 한 파일 안에 나란히 있어서, 실제로는 화면이 둘인 컴포넌트
 * 하나였다:
 *   - CSV  → 서버가 분석해 바로 저장. 고를 것이 없다
 *   - XLSX → 담긴 기간을 먼저 읽고, 저장할 달·저장 방식·코멘트 여부를 고른다
 */
export default function UploadPanel({
  onSuccess,
  onError,
  onRequestLoad,
  initialFiles,
}: UploadPanelProps = {}) {
  const [files, setFiles] = useState<File[]>(initialFiles ?? []);
  const [selectionError, setSelectionError] = useState<string | null>(null);

  const kind = kindOf(files);
  const step: 1 | 2 = files.length === 0 ? 1 : 2;

  const reset = useCallback(() => {
    setFiles([]);
    setSelectionError(null);
  }, []);

  /*
    setFiles 의 업데이터 안에서 에러 state 를 건드리지 않는다 — 업데이터는 순수해야 하고
    StrictMode 에서 두 번 실행되므로, 안에서 다른 state 를 바꾸면 동작이 어긋난다.
    현재 files 를 읽어 다음 값을 먼저 계산한 뒤 한 번에 반영한다.
  */
  const handleFiles = useCallback(
    (incoming: File[]) => {
      const accepted = incoming.filter((f) => CSV_EXT.test(f.name) || XLSX_EXT.test(f.name));
      if (accepted.length === 0) {
        setSelectionError('.csv 또는 .xlsx 파일만 올릴 수 있습니다.');
        return;
      }

      const next = XLSX_EXT.test(accepted[0].name)
        ? accepted.slice(0, 1) // 엑셀은 한 번에 한 개만
        : [...files.filter((f) => CSV_EXT.test(f.name)), ...accepted.filter((f) => CSV_EXT.test(f.name))]
            // 같은 파일을 두 번 올려도 한 번만 남긴다
            .filter((f, i, all) => all.findIndex((o) => o.name === f.name && o.size === f.size) === i);

      if (kindOf(next) === null) {
        setSelectionError('CSV 와 Excel 은 함께 올릴 수 없습니다. 한 종류씩 올려 주세요.');
        return;
      }

      setSelectionError(null);
      setFiles(next);
    },
    [files],
  );

  const handleSaved = useCallback(
    (message: string, undoId?: string) => {
      onSuccess?.(message, undoId);
      reset();
    },
    [onSuccess, reset],
  );

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <Steps step={step} />
        {step === 2 && (
          <button
            type="button"
            onClick={reset}
            className="text-xs font-medium text-fg-subtle hover:text-fg transition-colors"
          >
            <i className="bx bx-refresh mr-1" />
            다시 선택
          </button>
        )}
      </div>

      {step === 1 && <UploadDropZone onFiles={handleFiles} />}

      {step === 2 && (
        <div className="space-y-4">
          <ul className="space-y-1.5">
            {files.map((f, i) => (
              <FileRow
                key={`${f.name}-${i}`}
                file={f}
                // 엑셀은 한 개뿐이라 제거 버튼 대신 '다시 선택' 을 쓴다
                onRemove={
                  kind === 'csv'
                    ? () => setFiles((prev) => prev.filter((_, idx) => idx !== i))
                    : undefined
                }
              />
            ))}
          </ul>

          {selectionError && <Alert>{selectionError}</Alert>}

          {kind === 'csv' && (
            <CsvUploadFlow
              files={files}
              onAddFiles={handleFiles}
              onSaved={handleSaved}
              onError={onError}
            />
          )}

          {kind === 'xlsx' && (
            <ExcelUploadFlow
              file={files[0]}
              onSaved={handleSaved}
              onError={onError}
              onRequestLoad={onRequestLoad}
            />
          )}
        </div>
      )}
    </div>
  );
}
