'use client';

import { useEffect, useMemo, useRef } from 'react';
import { editHistoryImageUrl } from '@/lib/imageFilterClient';
import type { HistoryGroup } from '@/lib/imageFilterHistory';
import type { ImageVersion } from '@/types/imageFilter';

interface SessionThreadProps {
  versions: ImageVersion[];
  activeId: string;
  onSelectVersion: (id: string) => void;
  /** 시안을 원본 해상도로 크게 본다 (그 버전을 고른 뒤 확대 창을 연다) */
  onZoom: (id: string) => void;
  /** 시안 한 장을 파일로 저장한다 — 캔버스로 옮겨 가지 않고 말풍선에서 바로 */
  onDownload: (version: ImageVersion) => void;
  /** 이 작업이 이어받은 지난 대화 — 스레드에서 이미지를 올려 시작했을 때만 있다 */
  past: HistoryGroup | null;
  retentionDays: number;
  /** AI 가 답을 만드는 중이면 그 안내 문구 — 왼쪽 "입력 중" 말풍선으로 선다 */
  pendingText: string | null;
  /** 전송 중에는 다른 버전으로 넘어가지 못하게 한다 (캔버스 레일과 같은 규칙) */
  disabled: boolean;
}

/** 대화 한 차례 — 내가 보낸 요청 하나와 그 답으로 온 시안들 */
interface Turn {
  key: string;
  text: string;
  /** 바로 앞 차례의 결과가 아닌 다른 버전에서 갈라져 나왔을 때만 채운다 */
  from: string | null;
  results: ImageVersion[];
}

/**
 * 버전 계보를 대화 차례로 묶는다.
 *
 * 편집 1회의 시안 N장, 배경 시안 N종은 각각 요청 한 번의 답이라 한 말풍선에
 * 모은다 — 훅이 매긴 `batch` 가 그 경계다.
 */
function toTurns(versions: ImageVersion[]): Turn[] {
  const turns: Turn[] = [];
  let prevBatch: number | undefined;

  for (const version of versions) {
    if (version.kind === 'original') continue;
    const last = turns[turns.length - 1];
    if (last && version.batch !== undefined && version.batch === prevBatch) {
      last.results.push(version);
    } else {
      turns.push({ key: version.id, text: version.note ?? '', from: null, results: [version] });
      prevBatch = version.batch;
    }
  }

  // 바로 앞 차례의 결과(첫 차례라면 원본)에서 이어졌으면 표시하지 않는다 —
  // 대화가 순서대로 흐르는 평범한 경우다. 예전 버전으로 돌아가 갈라졌을 때만 알린다.
  const labelOf = new Map(versions.map((v) => [v.id, v.label]));
  let previous = new Set<string>(versions[0] ? [versions[0].id] : []);
  for (const turn of turns) {
    const parentId = turn.results[0].parentId;
    if (parentId && !previous.has(parentId)) turn.from = labelOf.get(parentId) ?? null;
    previous = new Set(turn.results.map((v) => v.id));

    // 배경 시안은 장마다 note 가 다르다 — 요청 한 번으로 읽히게 한 문장으로 합친다
    if (turn.results[0].kind === 'background') {
      turn.text = `배경만 바꾼 시안을 만들어줘 — ${turn.results.map((v) => v.label).join(', ')}`;
    }
  }
  return turns;
}

/**
 * 지금 작업을 DM 대화로 보여 준다 — 작업 화면의 대화 열 맨 위에 선다.
 *
 * 내가 보낸 것(이미지 · 지시)은 오른쪽, AI 가 돌려준 시안은 왼쪽이다. 시안을
 * 누르면 캔버스가 그 버전으로 바뀐다 — 큰 화면으로 확인하는 일은 캔버스가
 * 맡고, 스레드는 "무엇을 시켜 무엇이 왔는지"의 흐름을 맡는다.
 *
 * 예전에는 이미지를 올리는 순간 지난 대화(ThreadView)가 닫히고 작업대로
 * 넘어가 대화가 끊겼다. 이어받은 지난 대화도 위쪽에 읽기 전용으로 남긴다.
 */
export default function SessionThread({
  versions,
  activeId,
  onSelectVersion,
  onZoom,
  onDownload,
  past,
  retentionDays,
  pendingText,
  disabled,
}: SessionThreadProps) {
  const original = versions[0] ?? null;
  const turns = useMemo(() => toTurns(versions), [versions]);
  const pastTimeline = useMemo(() => (past ? [...past.items].reverse() : []), [past]);

  // 새 답이 오거나 AI 가 작업을 시작하면 대화 끝으로 내려간다 — DM 의 기본 동작
  const endRef = useRef<HTMLDivElement>(null);
  const tail = `${versions.length}:${pendingText ? 1 : 0}`;
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [tail]);

  if (!original) return null;

  return (
    <div className="px-3 pt-3 pb-1 space-y-3" aria-label="작업 대화">
      {/* ── 이어받은 지난 대화 (읽기 전용) ── */}
      {pastTimeline.length > 0 && (
        <>
          {pastTimeline.map((entry) => (
            <div key={entry.recordId} className="space-y-1.5 opacity-70">
              <div className="flex justify-end">
                <p className="max-w-[85%] rounded-2xl rounded-br-md bg-indigo-600 dark:bg-indigo-500 px-3 py-2 text-xs text-white leading-relaxed whitespace-pre-line wrap-break-word">
                  {entry.text}
                </p>
              </div>
              <div className="flex">
                {entry.imagesAvailable ? (
                  <div className="flex flex-wrap gap-1 max-w-[85%] rounded-2xl rounded-bl-md border border-border bg-surface-2 p-1.5">
                    {Array.from({ length: entry.imageCount }, (_, i) => (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        key={i}
                        src={editHistoryImageUrl(entry.recordId, i)}
                        alt={`지난 시안 ${i + 1}`}
                        loading="lazy"
                        className="block h-14 w-14 rounded-lg object-cover bg-surface-3"
                      />
                    ))}
                  </div>
                ) : (
                  <p className="max-w-[85%] rounded-2xl rounded-bl-md border border-dashed border-border px-3 py-1.5 text-[11px] text-fg-subtle">
                    보관 기간({retentionDays}일)이 지나 시안은 삭제됐어요
                  </p>
                )}
              </div>
            </div>
          ))}
          <p className="flex items-center gap-2 text-[10px] text-fg-subtle">
            <span className="h-px flex-1 bg-border-soft" />
            여기부터 이번 작업
            <span className="h-px flex-1 bg-border-soft" />
          </p>
        </>
      )}

      {/* ── 내가 올린 이미지 ── */}
      <div className="flex justify-end">
        <ThumbButton
          version={original}
          selected={original.id === activeId}
          onSelect={onSelectVersion}
          onZoom={onZoom}
          onDownload={onDownload}
          disabled={disabled}
          className="rounded-2xl rounded-br-md"
          size="h-24 w-24"
        />
      </div>

      {turns.length === 0 && !pendingText && (
        <div className="flex">
          <p className="max-w-[85%] rounded-2xl rounded-bl-md border border-border bg-surface-2 px-3 py-2 text-xs text-fg-muted leading-relaxed">
            이미지를 받았어요. 어떻게 바꿀지 아래에 적어 보내 주세요.
          </p>
        </div>
      )}

      {turns.map((turn) => (
        <div key={turn.key} className="space-y-1.5">
          {/* 지시 — 내 말풍선 */}
          <div className="flex justify-end">
            <div className="max-w-[85%]">
              {turn.from && (
                <p className="mb-0.5 text-right text-[10px] text-fg-subtle">
                  {turn.from} 에서 이어서
                </p>
              )}
              <p className="rounded-2xl rounded-br-md bg-indigo-600 dark:bg-indigo-500 px-3 py-2 text-xs text-white leading-relaxed whitespace-pre-line wrap-break-word">
                {turn.text || '편집 요청'}
              </p>
            </div>
          </div>

          {/* 시안 — AI 의 답. 누르면 캔버스가 그 버전으로 바뀐다 */}
          <div className="flex">
            <div className="flex flex-wrap gap-1 max-w-[85%] rounded-2xl rounded-bl-md border border-border bg-surface-2 p-1.5">
              {turn.results.map((version) => (
                <ThumbButton
                  key={version.id}
                  version={version}
                  selected={version.id === activeId}
                  onSelect={onSelectVersion}
                  onZoom={onZoom}
                  onDownload={onDownload}
                  disabled={disabled}
                  className="rounded-lg"
                  size="h-20 w-20"
                  showLabel
                />
              ))}
            </div>
          </div>
        </div>
      ))}

      {/* ── AI 가 답을 만드는 중 ── */}
      {pendingText && (
        <div className="flex" role="status">
          <div className="max-w-[85%] rounded-2xl rounded-bl-md border border-border bg-surface-2 px-3 py-2">
            <span className="flex items-center gap-1" aria-hidden>
              {[0, 150, 300].map((delay) => (
                <span
                  key={delay}
                  className="h-1.5 w-1.5 rounded-full bg-fg-subtle animate-bounce"
                  style={{ animationDelay: `${delay}ms` }}
                />
              ))}
            </span>
            <p className="mt-1 text-[11px] text-fg-subtle leading-relaxed">{pendingText}</p>
          </div>
        </div>
      )}

      <div ref={endRef} />
    </div>
  );
}

/* ── 말풍선 속 이미지 한 장 ─────────────────────────────────── */

function ThumbButton({
  version,
  selected,
  onSelect,
  onZoom,
  onDownload,
  disabled,
  className,
  size,
  showLabel = false,
}: {
  version: ImageVersion;
  selected: boolean;
  onSelect: (id: string) => void;
  onZoom: (id: string) => void;
  onDownload: (version: ImageVersion) => void;
  disabled: boolean;
  className: string;
  size: string;
  showLabel?: boolean;
}) {
  const actionClass =
    'flex h-6 w-6 items-center justify-center rounded-md bg-black/60 text-white hover:bg-black/80 transition-colors disabled:opacity-50 disabled:pointer-events-none';

  return (
    // 버튼 안에 버튼을 넣을 수 없어 바깥을 div 로 두고, 고르기 버튼과 메뉴를 형제로 둔다
    <div
      className={[
        'group/thumb relative overflow-hidden transition-shadow',
        selected ? 'ring-2 ring-indigo-400' : 'ring-1 ring-border hover:ring-indigo-300',
        className,
      ].join(' ')}
    >
      <button
        type="button"
        onClick={() => onSelect(version.id)}
        disabled={disabled}
        aria-pressed={selected}
        title={
          selected ? `${version.label} — 캔버스에 표시 중` : `${version.label} — 눌러서 캔버스에 보기`
        }
        className="block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary disabled:opacity-60 disabled:pointer-events-none"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={version.url}
          alt={version.label}
          className={`block ${size} object-cover bg-surface-3`}
        />
        {showLabel && (
          <span className="absolute inset-x-0 bottom-0 truncate bg-black/55 px-1 py-0.5 text-center text-[10px] font-semibold text-white">
            {version.label}
          </span>
        )}
      </button>

      {/* 말풍선 메뉴 — 마우스를 올리면 나타난다. 터치 화면에는 호버가 없어 늘 보인다. */}
      <span className="absolute right-1 top-1 flex gap-1 opacity-0 transition-opacity group-hover/thumb:opacity-100 group-focus-within/thumb:opacity-100 max-lg:opacity-100">
        <button
          type="button"
          onClick={() => onZoom(version.id)}
          disabled={disabled}
          aria-label={`${version.label} 크게 보기`}
          title="크게 보기"
          className={actionClass}
        >
          <i className="bx bx-expand-alt text-sm" />
        </button>
        <button
          type="button"
          onClick={() => onDownload(version)}
          aria-label={`${version.label} 저장`}
          title="저장"
          className={actionClass}
        >
          <i className="bx bx-download text-sm" />
        </button>
      </span>
    </div>
  );
}
