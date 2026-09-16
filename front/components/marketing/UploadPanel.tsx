'use client';

import { useCallback, useState } from 'react';
import Alert from '@/components/ui/Alert';
import CsvUploadFlow from '@/components/marketing/upload/CsvUploadFlow';
import ExcelUploadFlow from '@/components/marketing/upload/ExcelUploadFlow';
import { type Selection, kindOf, selectFiles } from '@/components/marketing/upload/fileKind';
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
  /*
    홈 카드에 떨군 파일도 드롭존을 거친 것과 똑같이 검사한다 — 예전에는 initialFiles 만
    검사 없이 상태로 바로 들어가서, 지원하지 않는 파일을 카드에 떨구면 아무 안내 없는
    빈 화면에 갇혔다.
  */
  const [selection, setSelection] = useState<Selection>(() => selectFiles([], initialFiles ?? []));
  const { files, error: selectionError } = selection;

  const kind = kindOf(files);
  const step: 1 | 2 = files.length === 0 ? 1 : 2;

  const reset = useCallback(() => setSelection({ files: [], error: null }), []);

  const handleFiles = useCallback(
    (incoming: File[]) => setSelection((cur) => selectFiles(cur.files, incoming)),
    [],
  );

  const removeFile = useCallback(
    (index: number) =>
      setSelection((cur) => ({
        files: cur.files.filter((_, i) => i !== index),
        error: null,
      })),
    [],
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

      {/* 1단계에서도 보여야 한다 — 고른 파일이 규칙에 걸려 선택이 비어 있을 때가 여기다 */}
      {selectionError && <Alert>{selectionError}</Alert>}

      {step === 1 && <UploadDropZone onFiles={handleFiles} />}

      {step === 2 && (
        <div className="space-y-4">
          <ul className="space-y-1.5">
            {files.map((f, i) => (
              <FileRow
                key={`${f.name}-${i}`}
                file={f}
                // 엑셀은 한 개뿐이라 제거 버튼 대신 '다시 선택' 을 쓴다
                onRemove={kind === 'csv' ? () => removeFile(i) : undefined}
              />
            ))}
          </ul>

          {/* selectFiles 가 한 종류만 남기므로 여기에 닿을 일은 없다. 그래도 남겨 둔다 —
              이 화면이 비어 버리는 것이 원래 증상이었고, 빈 화면보다는 설명이 낫다. */}
          {kind === null && (
            <Alert>
              고른 파일을 함께 처리할 수 없습니다. &apos;다시 선택&apos; 을 눌러 CSV 여러 개
              또는 Excel 한 개로 다시 올려 주세요.
            </Alert>
          )}

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
