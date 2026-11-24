'use client';

import { useEffect, useMemo, useState } from 'react';
import Button from '@/components/ui/Button';
import RatioGlyph from '@/components/image-resize/RatioGlyph';
import type { MediaPreset, OutputFormat } from '@/types/imageResize';
import { batchResizeToZip, fetchMediaPresets } from '@/lib/imageResizeClient';

/**
 * 매체 규격 일괄 변환 — 소재 1장을 Meta·Google·Naver·Kakao 지면 크기들로
 * 한 번에 변환해 zip 으로 받는다. 비율 유지 중앙 크롭(cover) 방식이라
 * 찌그러짐이 없고, AI 를 쓰지 않아 과금도 없다.
 */
export default function MediaPresetBatch({
  file,
  outputFormat,
}: {
  file: File;
  outputFormat: OutputFormat;
}) {
  const [presets, setPresets] = useState<MediaPreset[] | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [doneMsg, setDoneMsg] = useState<string | null>(null);

  useEffect(() => {
    // 응답이 돌아오기 전에 화면을 떠나면 사라진 컴포넌트에 setState 하게 된다
    let cancelled = false;
    fetchMediaPresets()
      .then((list) => { if (!cancelled) setPresets(list); })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : '규격 목록 로드 실패');
      });
    return () => { cancelled = true; };
  }, []);

  // 파일이 바뀌면 완료 메시지는 무효.
  // effect 대신 렌더 중에 맞춘다 — 프리셋 목록은 파일과 무관해서 key 로 통째로
  // 다시 마운트하면 매번 다시 받아오게 되고, effect + setState 는 렌더를 한 번 더 돌린다.
  const [lastFile, setLastFile] = useState(file);
  if (lastFile !== file) {
    setLastFile(file);
    setDoneMsg(null);
  }

  const byMedia = useMemo(() => {
    const groups = new Map<string, MediaPreset[]>();
    for (const p of presets ?? []) {
      groups.set(p.media, [...(groups.get(p.media) ?? []), p]);
    }
    return [...groups.entries()];
  }, [presets]);

  const toggle = (key: string) => {
    setDoneMsg(null);
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const selectAll = () => {
    setDoneMsg(null);
    setSelected((prev) =>
      prev.size === (presets?.length ?? 0)
        ? new Set()
        : new Set((presets ?? []).map((p) => p.key)),
    );
  };

  const handleDownload = async () => {
    if (selected.size === 0) return;
    setLoading(true);
    setError(null);
    setDoneMsg(null);
    try {
      await batchResizeToZip(file, [...selected], outputFormat);
      setDoneMsg(`${selected.size}개 규격을 zip 으로 내려받았습니다.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : '일괄 변환에 실패했습니다.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <p className="text-xs text-fg-subtle">
        선택한 지면 크기로 비율을 유지한 채(중앙 크롭) 한 번에 변환해 zip 으로 받습니다.
        출력 포맷은 위에서 고른 값을 따릅니다.
      </p>

      {error && (
        <div className="flex items-start gap-3 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-100 dark:border-red-900/60 px-4 py-3">
          <i className="bx bx-error-circle text-red-400 shrink-0 mt-0.5" />
          <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
        </div>
      )}

      {presets && (
        <>
          <div className="space-y-3">
            {byMedia.map(([media, items]) => (
              <div key={media}>
                <p className="text-[11px] font-semibold text-fg-subtle uppercase tracking-wider mb-1.5">
                  {media}
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {items.map((p) => {
                    const on = selected.has(p.key);
                    return (
                      <button
                        key={p.key}
                        type="button"
                        onClick={() => toggle(p.key)}
                        disabled={loading}
                        className={`inline-flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg border transition-colors tabular-nums ${
                          on
                            ? 'bg-indigo-500 text-white border-indigo-500'
                            : 'bg-surface-2 text-fg-muted border-border hover:border-indigo-300'
                        }`}
                      >
                        <RatioGlyph w={p.width} h={p.height} filled={on} />
                        {p.label} · {p.width}×{p.height}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <Button variant="outline" size="sm" onClick={selectAll} disabled={loading}>
              {selected.size === presets.length ? '전체 해제' : '전체 선택'}
            </Button>
            <Button
              size="sm"
              onClick={handleDownload}
              isLoading={loading}
              disabled={selected.size === 0 || loading}
            >
              {!loading && <i className="bx bx-archive-in text-base" />}
              {selected.size > 0 ? `${selected.size}개 규격 ZIP 다운로드` : '규격을 선택하세요'}
            </Button>
            {doneMsg && <span className="text-xs text-badge-success-fg">{doneMsg}</span>}
          </div>
        </>
      )}
    </div>
  );
}
