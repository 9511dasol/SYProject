'use client';

import { useEffect, useRef, useState } from 'react';
import Button from '@/components/ui/Button';
import type { BackgroundVariant } from '@/types/imageFilter';
import { isUserCancel } from '@/lib/api/authFetch';
import { suggestBackgrounds } from '@/lib/imageFilterClient';

/**
 * 배경 시안 제안 — 업로드한 이미지의 피사체는 그대로 두고 배경만 바꾼
 * 시안 여러 장을 생성해 그리드로 보여준다. 마음에 드는 시안은 바로 다운로드.
 *
 * 이미지 생성 모델을 시안 수만큼 호출하므로 버튼에 비용이 드는 작업임을 밝힌다.
 */
export default function BackgroundSuggest({ file }: { file: File }) {
  const [variants, setVariants] = useState<BackgroundVariant[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 다른 파일로 바뀌면 이전 시안은 무효다 — 부모가 key 로 묶어 두어 이 컴포넌트가
  // 통째로 새로 마운트되므로 여기서 따로 비울 필요가 없다.

  // 시안 생성은 이미지 모델을 여러 번 부르는 작업이라 상한을 두지 않는다.
  // 대신 끊을 수단이 없으면 응답이 오지 않을 때 새로고침 말고는 방법이 없다.
  const abortRef = useRef<AbortController | null>(null);
  useEffect(() => () => abortRef.current?.abort(), []);

  const handleGenerate = async () => {
    setLoading(true);
    setError(null);

    const controller = new AbortController();
    abortRef.current = controller;
    try {
      setVariants(await suggestBackgrounds(file, controller.signal));
    } catch (err) {
      // 사용자가 직접 끊은 건 실패가 아니다
      if (!isUserCancel(err)) {
        setError(err instanceof Error ? err.message : '배경 시안 생성에 실패했습니다.');
      }
    } finally {
      abortRef.current = null;
      setLoading(false);
    }
  };

  const handleCancel = () => abortRef.current?.abort();

  const download = (v: BackgroundVariant) => {
    const anchor = document.createElement('a');
    anchor.href = `data:${v.mime};base64,${v.image_base64}`;
    const base = file.name.replace(/\.[^.]+$/, '');
    anchor.download = `${base}_bg_${v.style}.png`;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
  };

  return (
    <div className="rounded-2xl border border-border bg-surface shadow-card overflow-hidden">
      <div className="p-6 space-y-4">
        <div className="flex items-center gap-2">
          <i className="bx bx-landscape text-xl text-indigo-500" />
          <span className="text-sm font-semibold text-fg-body">배경 시안 제안</span>
          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-indigo-100 dark:bg-indigo-900/50 text-indigo-600 dark:text-indigo-400 tracking-wide">
            Gemini
          </span>
        </div>
        <p className="text-xs text-fg-subtle">
          피사체(제품·인물·문구)는 그대로 두고 배경만 바꾼 시안을 여러 장 만들어 보여드립니다.
          시안 수만큼 AI 이미지 생성이 호출됩니다.
        </p>

        {variants === null && (
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={handleGenerate} isLoading={loading}>
              {!loading && <i className="bx bx-images text-base" />}
              {loading ? '배경 시안을 만드는 중... (수십 초 소요)' : '배경 시안 만들기'}
            </Button>
            {loading && (
              <Button variant="outline" size="sm" onClick={handleCancel}>
                <i className="bx bx-x text-base" />
                취소
              </Button>
            )}
          </div>
        )}

        {error && (
          <div className="flex items-start gap-3 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-100 dark:border-red-900/60 px-4 py-3">
            <i className="bx bx-error-circle text-red-400 shrink-0 mt-0.5" />
            <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
          </div>
        )}

        {variants && (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {variants.map((v) => (
                <figure key={v.style} className="rounded-xl border border-border overflow-hidden bg-surface-2">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={`data:${v.mime};base64,${v.image_base64}`}
                    alt={`배경 시안 — ${v.label}`}
                    className="block w-full h-auto"
                  />
                  <figcaption className="flex items-center justify-between px-3 py-2">
                    <span className="text-xs font-medium text-fg-muted">{v.label}</span>
                    <Button variant="outline" size="sm" onClick={() => download(v)}>
                      <i className="bx bx-download text-sm" />
                      다운로드
                    </Button>
                  </figcaption>
                </figure>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={handleGenerate} isLoading={loading}>
                {!loading && <i className="bx bx-refresh text-base" />}
                {loading ? '배경 시안을 만드는 중...' : '다시 만들기'}
              </Button>
              {loading && (
                <Button variant="outline" size="sm" onClick={handleCancel}>
                  <i className="bx bx-x text-base" />
                  취소
                </Button>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
