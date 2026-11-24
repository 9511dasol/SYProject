'use client';

import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import AgentComposer from '@/components/image-filter/AgentComposer';
import Button from '@/components/ui/Button';
import type {
  BackgroundStyle,
  FilterFormState,
  FilterProcessingState,
  ImageElement,
  PromptDrafts,
} from '@/types/imageFilter';
import { ALL_ELEMENTS_KEY, draftKeyOf } from '@/types/imageFilter';
import { ACCEPTED_IMAGE_HINT, validateImageFile } from '@/lib/imageFile';
import { useAspectRatioInputs } from '@/hooks/useAspectRatioInputs';
import { useFileDrop } from '@/hooks/useFileDrop';
import { useImageUpload } from '@/hooks/useImageUpload';
import {
  analyzeElements,
  editAndResize,
  fetchBackgroundStyles,
  suggestBackgrounds,
} from '@/lib/imageFilterClient';
import { isUserCancel } from '@/lib/api/authFetch';
import { triggerDownload } from '@/lib/api/download';

const INITIAL_FORM: FilterFormState = {
  targetWidth: '',
  targetHeight: '',
  keepAspectRatio: true,
  outputFormat: 'jpeg',
  useAiUpscale: false,
};

const EXAMPLE_PROMPTS = [
  { icon: 'bx-landscape', text: '배경을 하얀색 배경으로 바꿔줘' },
  { icon: 'bx-adjust', text: '흑백 사진으로 변환해줘' },
  { icon: 'bx-eraser', text: '사진 속 워터마크나 텍스트를 제거해줘' },
  { icon: 'bx-sun', text: '더 화사하고 밝은 분위기로 보정해줘' },
  { icon: 'bx-aperture', text: '배경을 흐릿하게(아웃포커스) 처리해줘' },
  { icon: 'bx-film', text: '오래된 필름 사진 느낌으로 바꿔줘' },
] as const;

/** 배경 시안 1종 — base64 를 상태에 두면 렌더마다 수 MB 문자열을 재조립하므로 objectURL 로 변환해 보관 */
interface BackgroundView {
  style: string;
  label: string;
  url: string;
  blob: Blob;
}

/** 대화 피드 한 줄 — 사용자 요청과 에이전트 응답(결과·오류·배경 시안) */
type FeedItem =
  | { id: number; role: 'user'; prompt: string; thumbUrl: string | null; chips: string[] }
  | {
      id: number;
      role: 'agent';
      kind: 'result';
      imageUrl: string;
      blob: Blob;
      filename: string;
      provider: string;
    }
  | { id: number; role: 'agent'; kind: 'error'; message: string }
  | { id: number; role: 'agent'; kind: 'notice'; message: string }
  | {
      id: number;
      role: 'agent';
      kind: 'backgrounds';
      variants: BackgroundView[];
      baseName: string;
    };

/** id 는 pushItem 이 붙인다 — 유니언이라 Omit 이 분배되지 않아 직접 펼친다 */
type NewFeedItem = FeedItem extends infer T ? (T extends { id: number } ? Omit<T, 'id'> : never) : never;

export default function ImageFilterClient() {
  const [form, setForm] = useState<FilterFormState>(INITIAL_FORM);
  const [processing, setProcessing] = useState<FilterProcessingState>('idle');
  const [analyzing, setAnalyzing] = useState(false);
  const [bgLoading, setBgLoading] = useState(false);
  const [backgroundStyles, setBackgroundStyles] = useState<BackgroundStyle[]>([]);
  const [feed, setFeed] = useState<FeedItem[]>([]);

  // 요소 분석 — null 은 "아직 분석 안 함" (빈 배열과 구분)
  const [elements, setElements] = useState<ImageElement[] | null>(null);
  const [selectedElementId, setSelectedElementId] = useState<number | null>(null);

  /* 프롬프트는 "지금 고른 대상"의 것만 보인다 — 요소를 바꿔도 각자 쓰던 글이 남고,
     선택을 풀면 이미지 전체에 대한 글로 돌아온다. */
  const [drafts, setDrafts] = useState<PromptDrafts>({});
  const draftKey = draftKeyOf(selectedElementId);
  const prompt = drafts[draftKey] ?? '';
  const setPrompt = useCallback(
    (value: string) => setDrafts((prev) => ({ ...prev, [draftKey]: value })),
    [draftKey],
  );
  // 글이 남아 있는 요소는 선택 목록에서 표시해 준다 (안 그러면 저장된 줄 모른다).
  // 매 렌더 새 Set 을 만들면 키 입력마다 ElementPicker(memo)가 깨진다 — 집합의
  // "내용"은 글이 생기거나 비워질 때만 바뀌므로, 내용 키로 참조를 안정시킨다.
  const draftedIdsKey = Object.entries(drafts)
    .filter(([key, text]) => key !== ALL_ELEMENTS_KEY && text.trim())
    .map(([key]) => key)
    .sort()
    .join(',');
  const draftedElementIds = useMemo(
    () => new Set(draftedIdsKey ? draftedIdsKey.split(',').map(Number) : []),
    [draftedIdsKey],
  );

  // 진행 중인 AI 요청의 취소 핸들 — 이미지 생성은 수십 초라 끊을 수단이 필요하다
  const abortRef = useRef<AbortController | null>(null);

  // 피드가 들고 있는 objectURL 들 — 파일을 바꿔도 지난 대화의 썸네일·결과는
  // 계속 보여야 하므로 즉시 해제하지 않고 모아 뒀다 초기화·언마운트 때 해제한다.
  const urlsRef = useRef<string[]>([]);
  const idRef = useRef(0);
  const endRef = useRef<HTMLDivElement>(null);

  const busy = processing !== 'idle' || analyzing || bgLoading;

  /* ── 파일 선택 (업로드·미리보기·치수 측정은 공용 훅) ────────── */
  const { file, previewUrl, dimensions: originalDimensions, select, clear } = useImageUpload(
    (dims) =>
      setForm((prev) => ({
        ...prev,
        targetWidth: String(dims.width),
        targetHeight: String(dims.height),
      })),
  );

  // 분석 응답이 돌아온 시점에 파일이 바뀌었으면 결과를 버리기 위한 최신 파일 추적
  const latestFileRef = useRef<File | null>(null);
  useEffect(() => {
    latestFileRef.current = file;
  }, [file]);

  // 배경 스타일 목록은 서버가 단일 출처 — 실패해도 화면은 그대로 쓸 수 있어야 해서
  // 조용히 넘기고, 목록이 비면 배경 시안 패널만 안내 문구를 띄운다.
  useEffect(() => {
    let alive = true;
    fetchBackgroundStyles()
      .then((styles) => alive && setBackgroundStyles(styles))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  const pushItem = useCallback((item: NewFeedItem) => {
    idRef.current += 1;
    setFeed((prev) => [...prev, { ...item, id: idRef.current }]);
  }, []);

  const trackUrl = useCallback((url: string) => {
    urlsRef.current.push(url);
    return url;
  }, []);

  /* ── 이미지 첨부 (버튼·드래그·붙여넣기 공통 진입점) ─────────── */
  /** 첨부에 성공하면 true — 호출부가 후속 안내를 띄울지 판단한다. */
  const handleAttach = useCallback(
    (f: File): boolean => {
      const problem = validateImageFile(f);
      if (problem) {
        pushItem({ role: 'agent', kind: 'error', message: problem });
        return false;
      }
      setElements(null);
      setSelectedElementId(null);
      // 요소 id 는 이미지마다 새로 매겨진다 — 요소별 초안은 버리고 전체 프롬프트만 남긴다
      setDrafts((prev) => ({ [ALL_ELEMENTS_KEY]: prev[ALL_ELEMENTS_KEY] ?? '' }));
      setForm((prev) => ({ ...prev, targetWidth: '', targetHeight: '' }));
      select(f);
      return true;
    },
    [pushItem, select],
  );

  /**
   * 편집 결과(또는 배경 시안)를 다음 작업의 입력으로 삼는다.
   *
   * 편집·분석은 언제나 "현재 첨부된 파일" 하나만 보기 때문에, 결과를 File 로
   * 바꿔 첨부 자리에 넣어 주면 요소 분석·요소 지정 편집이 그대로 결과물 기준으로
   * 돌아간다. 자동으로 이어받지 않고 버튼을 거치게 둔 건, 원본에서 다시
   * 시도하는 분기를 사용자가 잃지 않게 하기 위해서다.
   */
  const handleContinueFrom = useCallback(
    (blob: Blob, filename: string) => {
      if (busy) return;
      // 서버가 붙인 _resized_WxH 를 걷어내지 않으면 이어받을 때마다 이름이 길어진다
      const nextName = stripResizeSuffix(filename);
      const attached = handleAttach(
        new File([blob], nextName, { type: blob.type || 'image/png' }),
      );
      if (!attached) return;
      pushItem({
        role: 'agent',
        kind: 'notice',
        message: `이제 이 결과를 편집합니다. 요소 선택도 이 이미지 기준으로 다시 분석돼요.`,
      });
    },
    [busy, handleAttach, pushItem],
  );

  const handleClearFile = useCallback(() => {
    clear();
    setElements(null);
    setSelectedElementId(null);
    setForm((prev) => ({ ...prev, targetWidth: '', targetHeight: '' }));
  }, [clear]);

  /* ── 대화 초기화 ────────────────────────────────────────────── */
  const handleReset = useCallback(() => {
    abortRef.current?.abort();
    urlsRef.current.forEach((url) => URL.revokeObjectURL(url));
    // 재할당하면 언마운트 정리가 들고 있는 배열 참조와 끊어져 이후 URL이 샌다
    urlsRef.current.length = 0;
    setFeed([]);
    clear();
    setForm(INITIAL_FORM);
    setDrafts({});
    setElements(null);
    setSelectedElementId(null);
  }, [clear]);

  /* ── 요소 분석 ──────────────────────────────────────────────── */
  const handleAnalyze = useCallback(async (): Promise<boolean> => {
    if (!file || busy) return false;
    setAnalyzing(true);

    const controller = new AbortController();
    abortRef.current = controller;
    const target = file;

    try {
      const found = await analyzeElements(target, controller.signal);
      // 분석 중 파일이 교체됐으면(붙여넣기 등) 이전 이미지의 박스를 새 이미지에 붙이지 않는다
      if (latestFileRef.current !== target) return false;
      setElements(found);
      setSelectedElementId(null);
      // 다시 분석하면 요소 id 가 새로 매겨져 예전 초안이 엉뚱한 요소에 붙는다
      setDrafts((prev) => ({ [ALL_ELEMENTS_KEY]: prev[ALL_ELEMENTS_KEY] ?? '' }));
      return true;
    } catch (err) {
      if (!isUserCancel(err)) {
        pushItem({
          role: 'agent',
          kind: 'error',
          message: err instanceof Error ? err.message : '요소 분석에 실패했습니다.',
        });
      }
      return false;
    } finally {
      abortRef.current = null;
      setAnalyzing(false);
    }
  }, [file, busy, pushItem]);

  /* ── 가로·세로 변경 (비율 유지 계산은 공용 훅) ──────────────── */
  const { onWidthChange: handleWidthChange, onHeightChange: handleHeightChange } =
    useAspectRatioInputs(originalDimensions, setForm);

  /* ── 편집 요청 전송 ─────────────────────────────────────────── */

  /**
   * 지금 보내야 할 지시들 — 지금 보고 있는 칸뿐 아니라 요소별로 써 둔 글을 모두 모은다.
   * 요소마다 따로 적어 두고 한 번에 보내는 게 자연스러운데, 매번 한 건씩 보내면
   * 이미지 생성 비용도 건수만큼 들고 앞 결과가 뒤 편집에 깔리지 않는다.
   */
  const pending: EditInstruction[] = Object.entries(drafts)
    .filter(([, text]) => text.trim())
    .map(([key, text]) => ({
      key,
      element: key === ALL_ELEMENTS_KEY ? null : elements?.find((el) => String(el.id) === key) ?? null,
      text: text.trim(),
    }))
    // 분석을 다시 돌려 사라진 요소의 초안은 버린다 (전체 지시는 element 가 null 이 정상)
    .filter((part) => part.key === ALL_ELEMENTS_KEY || part.element);

  // 지금 칸이 비어 있어도 다른 곳에 써 둔 지시가 있으면 보낼 수 있다
  const otherPending = pending.filter((part) => part.key !== draftKey);

  const handleSend = async () => {
    if (!file || busy || !pending.length) return;
    // 전송 시점의 지시 묶음 — 기다리는 동안 선택이 바뀌어도 제자리에 되돌린다
    const sent = pending;

    const w = parseInt(form.targetWidth, 10) || 0;
    const h = parseInt(form.targetHeight, 10) || 0;

    const targeted = sent.filter((part) => part.element);
    const chips: string[] = [];
    if (targeted.length) chips.push(`대상: ${targeted.map((t) => t.element!.label).join(', ')}`);
    if (w > 0 && h > 0) chips.push(`${w}×${h}px`);
    chips.push(form.outputFormat.toUpperCase());

    pushItem({
      role: 'user',
      prompt: describeInstructions(sent),
      thumbUrl: trackUrl(URL.createObjectURL(file)),
      chips,
    });
    setDrafts((prev) => {
      const next = { ...prev };
      sent.forEach((part) => (next[part.key] = ''));
      return next;
    });

    // 요소를 고른 지시는 "그 영역만 수정" 좌표 설명을 입힌다 —
    // 백엔드 편집 엔드포인트는 그대로 두고 지시만 정밀해진다
    const fullPrompt = composeEditPrompt(sent);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const { provider, blob, filename } = await editAndResize(
        file,
        fullPrompt,
        w,
        h,
        form.outputFormat,
        () => setProcessing('compressing'),
        () => setProcessing('editing'),
        controller.signal,
      );
      pushItem({
        role: 'agent',
        kind: 'result',
        imageUrl: trackUrl(URL.createObjectURL(blob)),
        blob,
        filename,
        provider,
      });
    } catch (err) {
      // 수십 초 기다린 끝의 실패·취소다 — 입력을 되살려 바로 고쳐 재시도할 수 있게 한다
      setDrafts((prev) => {
        const next = { ...prev };
        sent.forEach((part) => {
          if (!next[part.key]?.trim()) next[part.key] = part.text;
        });
        return next;
      });
      // 사용자가 직접 취소한 건 실패가 아니므로 오류 응답으로 남기지 않는다
      if (!isUserCancel(err)) {
        pushItem({
          role: 'agent',
          kind: 'error',
          message: err instanceof Error ? err.message : '알 수 없는 오류가 발생했습니다.',
        });
      }
    } finally {
      abortRef.current = null;
      setProcessing('idle');
    }
  };

  /* ── 배경 시안 생성 ─────────────────────────────────────────── */
  const handleBackgrounds = useCallback(async (styles: string[]) => {
    if (!file || busy || !styles.length) return;

    const labels = styles
      .map((key) => backgroundStyles.find((s) => s.key === key)?.label ?? key)
      .join(', ');
    pushItem({
      role: 'user',
      prompt: `피사체는 그대로 두고, 배경을 바꾼 시안을 만들어줘 (${labels})`,
      thumbUrl: trackUrl(URL.createObjectURL(file)),
      chips: [`배경 시안 ${styles.length}종`],
    });

    setBgLoading(true);
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const variants = await suggestBackgrounds(file, styles, controller.signal);
      // base64 를 상태에 두면 렌더마다 수 MB 문자열을 재조립한다 — Blob/objectURL 로 바꿔 보관
      const views: BackgroundView[] = await Promise.all(
        variants.map(async (v) => {
          const blob = await (await fetch(`data:${v.mime};base64,${v.image_base64}`)).blob();
          return {
            style: v.style,
            label: v.label,
            url: trackUrl(URL.createObjectURL(blob)),
            blob,
          };
        }),
      );
      pushItem({
        role: 'agent',
        kind: 'backgrounds',
        variants: views,
        baseName: file.name.replace(/\.[^.]+$/, ''),
      });
    } catch (err) {
      if (!isUserCancel(err)) {
        pushItem({
          role: 'agent',
          kind: 'error',
          message: err instanceof Error ? err.message : '배경 시안 생성에 실패했습니다.',
        });
      }
    } finally {
      abortRef.current = null;
      setBgLoading(false);
    }
  }, [file, busy, backgroundStyles, pushItem, trackUrl]);

  /** 진행 중인 AI 요청을 끊는다. */
  const handleCancel = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  /* ── 페이지 전체 드래그&드롭 ────────────────────────────────── */
  const onFiles = useCallback((files: File[]) => handleAttach(files[0]), [handleAttach]);
  const { isDragging, handlers } = useFileDrop(onFiles, busy);

  /* ── 진행 상태 문구 ─────────────────────────────────────────── */
  const statusText = analyzing
    ? '이미지 속 요소를 분석하는 중...'
    : bgLoading
      ? '배경 시안을 만드는 중 — 수십 초 걸릴 수 있어요'
      : processing === 'compressing'
        ? '이미지를 압축하는 중...'
        : processing === 'editing'
          ? 'Gemini가 이미지를 편집하는 중 — 보통 5~10초 걸려요'
          : null;

  /* ── 새 메시지가 오면 피드 맨 아래로 ────────────────────────── */
  useEffect(() => {
    if (feed.length > 0 || statusText) {
      endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
    }
  }, [feed.length, statusText]);

  /* ── 언마운트 정리 ──────────────────────────────────────────── */
  useEffect(() => {
    const urls = urlsRef.current;
    return () => {
      abortRef.current?.abort();
      urls.forEach((url) => URL.revokeObjectURL(url));
    };
  }, []);

  /* ── 렌더 ───────────────────────────────────────────────────── */
  return (
    <div
      {...handlers}
      className="min-h-screen bg-linear-to-br from-bg via-surface to-indigo-50/30 dark:to-indigo-950/20"
    >
      {/* 드래그 중 오버레이 */}
      {isDragging && (
        <div className="fixed inset-0 z-50 bg-indigo-500/10 backdrop-blur-[2px] flex items-center justify-center pointer-events-none">
          <div className="flex items-center gap-3 rounded-2xl border-2 border-dashed border-indigo-400 bg-surface px-8 py-6 shadow-xl">
            <i className="bx bx-image-add text-3xl text-indigo-500" />
            <p className="font-semibold text-fg">여기에 놓으면 이미지가 첨부됩니다</p>
          </div>
        </div>
      )}

      <div className="max-w-3xl mx-auto px-4 flex flex-col min-h-screen">
        {/* 헤더 */}
        <header className="flex items-center justify-between gap-3 py-5">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-linear-to-br from-indigo-500 to-violet-500 flex items-center justify-center shadow-card shrink-0">
              <i className="bx bxs-magic-wand text-xl text-white" />
            </div>
            <div className="min-w-0">
              <h1 className="text-lg font-bold text-fg tracking-tight truncate">이미지 정제</h1>
              <p className="text-xs text-fg-muted truncate">
                채팅하듯 지시하면 Gemini가 이미지를 편집해 드려요
              </p>
            </div>
          </div>
          {feed.length > 0 && (
            <Button variant="outline" size="sm" onClick={handleReset} className="shrink-0">
              <i className="bx bx-plus text-base" />
              새 대화
            </Button>
          )}
        </header>

        {/* 대화 피드 */}
        <main className="flex-1 flex flex-col">
          {feed.length === 0 && !statusText ? (
            <EmptyState
              hasFile={!!file}
              onAttach={handleAttach}
              onExample={setPrompt}
              disabled={busy}
            />
          ) : (
            <div role="log" aria-label="편집 대화 내역" className="space-y-4 py-2">
              {feed.map((item) =>
                item.role === 'user' ? (
                  <UserBubble key={item.id} item={item} />
                ) : (
                  <AgentBubble
                    key={item.id}
                    item={item}
                    onContinue={handleContinueFrom}
                    disabled={busy}
                  />
                ),
              )}

              {/* 진행 중 상태 버블 */}
              {statusText && (
                <div className="flex items-start gap-3">
                  <AgentAvatar />
                  <div className="rounded-2xl rounded-tl-md border border-indigo-200 dark:border-indigo-800 bg-indigo-50 dark:bg-indigo-950/30 px-4 py-3 flex items-center gap-3">
                    <span className="relative flex w-2.5 h-2.5 shrink-0">
                      <span className="absolute inset-0 rounded-full bg-indigo-400 animate-ping opacity-60" />
                      <span className="relative w-2.5 h-2.5 rounded-full bg-indigo-500" />
                    </span>
                    <p className="text-sm text-indigo-700 dark:text-indigo-300">{statusText}</p>
                  </div>
                </div>
              )}
            </div>
          )}
          <div ref={endRef} />
        </main>

        {/* 하단 고정 컴포저 */}
        <div className="sticky bottom-0 z-20 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))] bg-linear-to-t from-bg via-bg/95 to-transparent">
          <AgentComposer
            file={file}
            previewUrl={previewUrl}
            originalDimensions={originalDimensions}
            prompt={prompt}
            onPromptChange={setPrompt}
            onAttach={handleAttach}
            onClearFile={handleClearFile}
            targetWidth={form.targetWidth}
            targetHeight={form.targetHeight}
            keepAspectRatio={form.keepAspectRatio}
            outputFormat={form.outputFormat}
            onWidthChange={handleWidthChange}
            onHeightChange={handleHeightChange}
            onToggleAspectRatio={() =>
              setForm((prev) => ({ ...prev, keepAspectRatio: !prev.keepAspectRatio }))
            }
            onFormatChange={(fmt) => setForm((prev) => ({ ...prev, outputFormat: fmt }))}
            elements={elements}
            selectedElementId={selectedElementId}
            onSelectElement={setSelectedElementId}
            draftedElementIds={draftedElementIds}
            pendingLabels={otherPending.map((part) =>
              part.element ? part.element.label : '이미지 전체',
            )}
            analyzing={analyzing}
            onAnalyze={handleAnalyze}
            backgroundStyles={backgroundStyles}
            onSuggestBackgrounds={handleBackgrounds}
            onSubmit={handleSend}
            onCancel={handleCancel}
            busy={busy}
          />
        </div>
      </div>
    </div>
  );
}

/* ── 파일명 정리 ─────────────────────────────────────────────── */

/**
 * 서버가 덧붙인 `_resized_640x400` 접미사를 걷어낸다.
 *
 * 편집 결과를 다시 입력으로 쓰면 서버가 그 이름 뒤에 또 붙이기 때문에,
 * 두세 번만 이어가도 `a_resized_640x400_resized_640x400...` 이 된다.
 * 배경 시안의 `_bg_<style>` 은 어느 시안에서 나왔는지 알려주므로 남긴다.
 */
function stripResizeSuffix(filename: string): string {
  const dot = filename.lastIndexOf('.');
  const stem = dot > 0 ? filename.slice(0, dot) : filename;
  const ext = dot > 0 ? filename.slice(dot) : '';
  const cleaned = stem.replace(/(?:_resized_\d+x\d+)+$/, '');
  return `${cleaned || stem}${ext}`;
}

/* ── 요소 지정 프롬프트 조합 ─────────────────────────────────── */

/** 보낼 지시 한 건 — element 가 null 이면 이미지 전체에 대한 지시 */
interface EditInstruction {
  key: string;
  element: ImageElement | null;
  text: string;
}

/** 요소 박스를 "가로 12%~45%, 세로 30%~40%" 같은 자연어로 */
function boxText(el: ImageElement): string {
  const range = (start: number, size: number) =>
    `${Math.round(start * 100)}%~${Math.round((start + size) * 100)}%`;
  return `가로 ${range(el.box.x, el.box.w)}, 세로 ${range(el.box.y, el.box.h)} 영역`;
}

/**
 * 지시 묶음을 편집 모델에 보낼 한 덩어리 프롬프트로 만든다.
 *
 * 백엔드 편집 엔드포인트는 자유 프롬프트 하나만 받으므로, 요소별 지시를
 * 좌표 설명과 함께 번호 매겨 늘어놓는다. 요소 하나만 보낼 때는 기존에 쓰던
 * 문장 그대로 둔다 — 모델이 가장 잘 따르던 형태라 굳이 바꾸지 않는다.
 */
function composeEditPrompt(parts: EditInstruction[]): string {
  const general = parts.find((part) => !part.element)?.text ?? '';
  const targeted = parts.filter((part) => part.element);

  if (!targeted.length) return general;

  if (targeted.length === 1 && !general) {
    const only = targeted[0];
    return (
      `이미지 속 "${only.element!.label}" 요소(${boxText(only.element!)})만 ` +
      `다음 지시대로 수정해주세요: ${only.text}. ` +
      `그 외 영역은 원본과 똑같이 유지해주세요.`
    );
  }

  const lines = targeted.map(
    (part, i) => `${i + 1}) "${part.element!.label}" 요소(${part.element ? boxText(part.element) : ''}): ${part.text}`,
  );
  return [
    '이미지에서 아래 영역들을 각각 지시대로 수정해주세요.',
    ...lines,
    general && `전체 적용: ${general}`,
    '지시하지 않은 영역은 원본과 똑같이 유지해주세요.',
  ]
    .filter(Boolean)
    .join('\n');
}

/** 대화 버블에 보여 줄 사람이 읽기 좋은 요약 (모델에 보내는 문장과 별개) */
function describeInstructions(parts: EditInstruction[]): string {
  const general = parts.find((part) => !part.element)?.text ?? '';
  const targeted = parts.filter((part) => part.element);
  if (!targeted.length) return general;
  return [general, ...targeted.map((part) => `${part.element!.label} → ${part.text}`)]
    .filter(Boolean)
    .join('\n');
}

/* ── 피드 버블 ───────────────────────────────────────────────── */

function AgentAvatar() {
  return (
    <div className="w-8 h-8 rounded-full bg-indigo-100 dark:bg-indigo-900/50 ring-1 ring-indigo-200 dark:ring-indigo-800 flex items-center justify-center shrink-0">
      <i className="bx bx-bot text-lg text-indigo-500 dark:text-indigo-400" />
    </div>
  );
}

/* 피드 항목은 불변 객체라 memo 가 그대로 먹힌다 — 프롬프트 상태가 이 페이지에
   있어 키 입력마다 리렌더되는데, 묶지 않으면 타이핑 한 번에 대화 전체가 다시 그려진다. */
const UserBubble = memo(function UserBubble({
  item,
}: {
  item: Extract<FeedItem, { role: 'user' }>;
}) {
  return (
    <div className="flex justify-end">
      <div className="max-w-[85%] sm:max-w-[75%] rounded-2xl rounded-br-md bg-indigo-600 dark:bg-indigo-500 text-white px-4 py-3 space-y-2 shadow-card">
        {item.thumbUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={item.thumbUrl}
            alt="첨부 이미지"
            className="rounded-lg max-h-40 w-auto max-w-full border border-white/20"
          />
        )}
        <p className="text-sm leading-relaxed whitespace-pre-wrap break-words">{item.prompt}</p>
        {item.chips.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {item.chips.map((chip) => (
              <span
                key={chip}
                className="text-[10px] font-medium bg-white/15 rounded-md px-1.5 py-0.5"
              >
                {chip}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
});

/** AI 모델명 → 아이콘 / 색상 매핑 */
const PROVIDER_META: Record<string, { icon: string; color: string }> = {
  Gemini: { icon: 'bx-diamond', color: 'text-blue-500' },
};

function ProviderBadge({ provider }: { provider: string }) {
  if (!provider) return null;
  const key = Object.keys(PROVIDER_META).find((k) => provider.startsWith(k));
  const meta = (key && PROVIDER_META[key]) || { icon: 'bx-chip', color: 'text-fg-subtle' };
  return (
    <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-fg-muted bg-surface-3 rounded-md px-1.5 py-0.5">
      <i className={`bx ${meta.icon} text-xs ${meta.color}`} />
      {provider}
    </span>
  );
}

const AgentBubble = memo(function AgentBubble({
  item,
  onContinue,
  disabled,
}: {
  item: Extract<FeedItem, { role: 'agent' }>;
  onContinue: (blob: Blob, filename: string) => void;
  disabled: boolean;
}) {
  return (
    <div className="flex items-start gap-3">
      <AgentAvatar />

      {item.kind === 'error' ? (
        <div className="max-w-[85%] sm:max-w-[75%] rounded-2xl rounded-tl-md border border-red-100 dark:border-red-900/60 bg-red-50 dark:bg-red-950/40 px-4 py-3 flex items-start gap-2.5">
          <i className="bx bx-error-circle text-red-400 shrink-0 mt-0.5" />
          <p className="text-sm text-red-600 dark:text-red-400">{item.message}</p>
        </div>
      ) : item.kind === 'notice' ? (
        <div className="max-w-[85%] sm:max-w-[75%] rounded-2xl rounded-tl-md border border-border bg-surface-2 px-4 py-2.5 flex items-start gap-2.5">
          <i className="bx bx-info-circle text-fg-subtle shrink-0 mt-0.5" />
          <p className="text-xs text-fg-muted leading-relaxed">{item.message}</p>
        </div>
      ) : item.kind === 'result' ? (
        <div className="max-w-[85%] sm:max-w-[75%] rounded-2xl rounded-tl-md border border-border bg-surface shadow-card px-4 py-3.5 space-y-3">
          <div className="flex items-center gap-2 flex-wrap">
            <i className="bx bx-check-shield text-emerald-500 text-lg" />
            <p className="text-sm font-semibold text-fg-body">편집이 완료됐어요</p>
            <ProviderBadge provider={item.provider} />
          </div>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={item.imageUrl}
            alt="편집 결과"
            className="rounded-xl border border-border max-h-80 w-auto max-w-full bg-surface-2"
          />
          <p className="text-xs text-fg-subtle truncate">{item.filename}</p>
          <div className="flex items-center gap-2 flex-wrap">
            <Button
              variant="outline"
              size="sm"
              onClick={() => triggerDownload(item.blob, item.filename)}
            >
              <i className="bx bx-download text-sm" />
              다운로드
            </Button>
            {/* 결과물을 다음 편집의 입력으로 — 이 버튼을 누르지 않으면 계속 원본을 편집한다 */}
            <Button
              variant="ghost"
              tone="indigo"
              size="sm"
              onClick={() => onContinue(item.blob, item.filename)}
              disabled={disabled}
            >
              <i className="bx bx-edit-alt text-sm" />
              이 결과로 계속 편집
            </Button>
          </div>
        </div>
      ) : (
        /* 배경 시안 */
        <div className="flex-1 max-w-full sm:max-w-[85%] rounded-2xl rounded-tl-md border border-border bg-surface shadow-card px-4 py-3.5 space-y-3">
          <div className="flex items-center gap-2">
            <i className="bx bx-landscape text-lg text-indigo-500" />
            <p className="text-sm font-semibold text-fg-body">
              배경 시안 {item.variants.length}종을 만들었어요
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {item.variants.map((v) => (
              <figure
                key={v.style}
                className="rounded-xl border border-border overflow-hidden bg-surface-2"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={v.url}
                  alt={`배경 시안 — ${v.label}`}
                  className="block w-full h-auto"
                />
                <figcaption className="flex items-center justify-between gap-1 px-3 py-2">
                  <span className="text-xs font-medium text-fg-muted truncate">{v.label}</span>
                  <span className="flex items-center gap-1 shrink-0">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => triggerDownload(v.blob, `${item.baseName}_bg_${v.style}.png`)}
                    >
                      <i className="bx bx-download text-sm" />
                      저장
                    </Button>
                    {/* 마음에 드는 시안을 고른 뒤 그 위에서 계속 다듬을 수 있게 한다 */}
                    <Button
                      variant="ghost"
                      tone="indigo"
                      size="sm"
                      title="이 시안을 편집 대상으로"
                      onClick={() => onContinue(v.blob, `${item.baseName}_bg_${v.style}.png`)}
                      disabled={disabled}
                    >
                      <i className="bx bx-edit-alt text-sm" />
                      편집
                    </Button>
                  </span>
                </figcaption>
              </figure>
            ))}
          </div>
        </div>
      )}
    </div>
  );
});

/* ── 빈 피드 첫 화면 ─────────────────────────────────────────── */

function EmptyState({
  hasFile,
  onAttach,
  onExample,
  disabled,
}: {
  hasFile: boolean;
  onAttach: (f: File) => void;
  onExample: (text: string) => void;
  disabled: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-6 py-10 text-center">
      <div className="w-16 h-16 rounded-2xl bg-linear-to-br from-indigo-500 to-violet-500 flex items-center justify-center shadow-lg shadow-indigo-200 dark:shadow-indigo-950">
        <i className="bx bxs-magic-wand text-3xl text-white" />
      </div>

      <div className="space-y-1.5">
        <h2 className="text-xl sm:text-2xl font-bold text-fg tracking-tight">
          무엇을 어떻게 바꿔볼까요?
        </h2>
        <p className="text-sm text-fg-muted max-w-sm mx-auto">
          이미지를 첨부하고 채팅하듯 지시하면, 결과를 대화로 바로 보여드려요.
        </p>
      </div>

      {!hasFile && (
        <>
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={disabled}
            className="group flex items-center gap-3 rounded-2xl border-2 border-dashed border-border hover:border-indigo-300 dark:hover:border-indigo-700 bg-surface hover:bg-indigo-50/30 dark:hover:bg-indigo-950/20 px-6 py-4 transition-all disabled:opacity-50"
          >
            <i className="bx bx-cloud-upload text-2xl text-indigo-400 group-hover:scale-110 transition-transform" />
            <span className="text-left">
              <span className="block text-sm font-semibold text-fg-body">
                이미지를 올리거나 여기로 드래그
              </span>
              <span className="block text-xs text-fg-subtle mt-0.5">
                {ACCEPTED_IMAGE_HINT} · 붙여넣기(Ctrl+V)도 돼요
              </span>
            </span>
          </button>
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            className="sr-only"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) onAttach(f);
              e.target.value = '';
            }}
          />
        </>
      )}

      <div className="w-full max-w-lg space-y-2">
        <p className="text-[10px] font-semibold text-fg-subtle uppercase tracking-wider">
          이런 것도 할 수 있어요
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {EXAMPLE_PROMPTS.map((ex) => (
            <button
              key={ex.text}
              type="button"
              onClick={() => onExample(ex.text)}
              disabled={disabled}
              className="flex items-center gap-3 rounded-xl border border-border bg-surface hover:border-indigo-200 dark:hover:border-indigo-700 hover:bg-indigo-50/40 dark:hover:bg-indigo-950/30 px-4 py-3 text-left transition-colors disabled:opacity-50"
            >
              <i className={`bx ${ex.icon} text-lg text-indigo-400 shrink-0`} />
              <span className="text-xs sm:text-sm text-fg-muted leading-snug">{ex.text}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
