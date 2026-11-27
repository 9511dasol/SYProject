'use client';

import { useRef } from 'react';
import { sinceText } from '@/lib/imageFilterHistory';
import type { HistoryEntry, HistoryGroup } from '@/lib/imageFilterHistory';
import { editHistoryImageUrl } from '@/lib/imageFilterClient';
import { ACCEPTED_IMAGE_HINT } from '@/lib/imageFile';

interface ThreadViewProps {
  group: HistoryGroup;
  /** 보관 일수 — 만료 안내 문구가 서버 설정과 어긋나지 않게 내려받는다 */
  retentionDays: number;
  /** 대화창 안에서 새 이미지를 올리면 작업 화면이 열린다 — 지시는 이미 시드돼 있다 */
  onAttach: (file: File) => boolean;
  /** 보관된 결과 이미지 하나를 골라 그 이미지로 이어서 작업한다 (시드 없음 —
   *  그 이미지에는 이 지시들이 이미 적용돼 있다) */
  onContinueFrom: (entry: HistoryEntry, index: number) => void;
  /** 기록 한 건 삭제 (결과 이미지 포함) */
  onDeleteRecord: (entry: HistoryEntry) => void;
  onClose: () => void;
  disabled: boolean;
}

/**
 * 지난 작업 한 건을 DM 대화처럼 펼쳐 보여 준다.
 *
 * 전송 1회가 말풍선 한 쌍이다 — 오른쪽은 그때 보낸 지시, 그 아래는 보관된
 * **결과 이미지들**(②-B, 2026-11-28 사용자 결정으로 보관 시작). 이미지를
 * 누르면 그 이미지를 새 원본으로 이어서 작업한다. 보관 기간이 지난 기록은
 * 이미지 대신 만료 안내가 선다 — 지시는 남아 있으므로 대화는 계속 읽힌다.
 *
 * 전체 드래그 앤 드롭·붙여넣기(Ctrl+V)는 페이지 공통 핸들러가 이미 받는다.
 */
export default function ThreadView({
  group,
  retentionDays,
  onAttach,
  onContinueFrom,
  onDeleteRecord,
  onClose,
  disabled,
}: ThreadViewProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  // 기록은 최신순으로 쌓이지만 대화는 시간순으로 읽는 것이다
  const timeline = [...group.items].reverse();

  return (
    <div className="flex-1 min-h-0 flex flex-col">
      {/* ── 스레드 헤더 ── */}
      <div className="h-11 shrink-0 px-4 flex items-center gap-2 border-b border-border bg-surface">
        <i className="bx bx-image-alt text-base text-indigo-400 shrink-0" />
        <span className="text-sm font-semibold text-fg truncate" title={group.filename}>
          {group.filename}
        </span>
        <span className="text-[11px] text-fg-subtle shrink-0">
          {sinceText(group.latestAt)} · 지시 {group.items.length}건
        </span>
        <div className="flex-1" />
        <button
          type="button"
          onClick={onClose}
          aria-label="대화 닫기"
          className="flex items-center justify-center w-7 h-7 rounded-lg text-fg-subtle
            hover:text-fg hover:bg-surface-2 transition-colors"
        >
          <i className="bx bx-x text-lg" />
        </button>
      </div>

      {/* ── 말풍선 ── */}
      <div className="flex-1 min-h-0 overflow-y-auto px-4 py-5 space-y-4">
        <div className="flex">
          <div className="max-w-[75%] rounded-2xl rounded-bl-md border border-border bg-surface px-3.5 py-2.5">
            <p className="text-xs text-fg-muted leading-relaxed">
              그때의 지시와 결과 시안이에요. 결과 이미지는{' '}
              <strong className="text-fg-body font-medium">{retentionDays}일 보관</strong>
              되고, 시안을 누르면 그 이미지로 이어서 작업합니다. 새 이미지로 같은 지시를
              다시 돌리려면 아래에 이미지를 올리세요.
            </p>
          </div>
        </div>

        {timeline.map((entry) => (
          <div key={entry.recordId} className="space-y-1.5">
            {/* 지시 — 사용자 말풍선 */}
            <div className="flex justify-end">
              <div className="max-w-[75%]">
                <div className="group/bubble relative rounded-2xl rounded-br-md bg-indigo-600 dark:bg-indigo-500 px-3.5 py-2.5">
                  <p className="text-xs text-white leading-relaxed whitespace-pre-line wrap-break-word">
                    {entry.text}
                  </p>
                  <button
                    type="button"
                    onClick={() => onDeleteRecord(entry)}
                    disabled={disabled}
                    aria-label="이 기록 삭제"
                    title="이 기록 삭제 (보관된 시안 포함)"
                    className="absolute -left-7 top-1/2 -translate-y-1/2 hidden group-hover/bubble:flex
                      items-center justify-center w-6 h-6 rounded-lg text-fg-subtle
                      hover:text-red-500 hover:bg-surface-2 transition-colors
                      disabled:opacity-50 disabled:pointer-events-none"
                  >
                    <i className="bx bx-trash text-sm" />
                  </button>
                </div>
                <p className="mt-0.5 text-right text-[10px] text-fg-subtle">
                  {sinceText(entry.at)}
                </p>
              </div>
            </div>

            {/* 결과 시안 — 보관돼 있으면 썸네일, 만료됐으면 안내 */}
            {entry.imagesAvailable ? (
              <div className="flex justify-end">
                <div className="flex flex-wrap justify-end gap-1.5 max-w-[75%]">
                  {Array.from({ length: entry.imageCount }, (_, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => onContinueFrom(entry, i)}
                      disabled={disabled}
                      title="이 시안으로 이어서 작업하기"
                      className="group/thumb relative rounded-xl overflow-hidden border border-border
                        hover:border-indigo-400 transition-colors
                        disabled:opacity-50 disabled:pointer-events-none"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={editHistoryImageUrl(entry.recordId, i)}
                        alt={`시안 ${i + 1}`}
                        loading="lazy"
                        className="block h-28 w-auto max-w-40 object-cover bg-surface-2"
                      />
                      <span
                        className="absolute inset-0 hidden group-hover/thumb:flex items-center justify-center
                          bg-black/45 text-[11px] font-semibold text-white"
                      >
                        이어서 작업
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="flex justify-end">
                <p className="max-w-[75%] rounded-xl border border-dashed border-border px-3 py-1.5 text-[11px] text-fg-subtle">
                  보관 기간({retentionDays}일)이 지나 시안 {entry.variantCount}장은
                  삭제됐어요 — 지시는 그대로 다시 쓸 수 있어요
                </p>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* ── 입력대 — 새 이미지로 같은 지시를 다시 돌린다 ── */}
      <div className="shrink-0 border-t border-border bg-surface-2/60 p-3">
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={disabled}
          className="group flex w-full items-center gap-3 rounded-2xl border-2 border-dashed
            border-border hover:border-indigo-300 dark:hover:border-indigo-700 bg-surface
            hover:bg-indigo-50/30 dark:hover:bg-indigo-950/20 px-4 py-3 transition-all
            disabled:opacity-50 disabled:pointer-events-none"
        >
          <i className="bx bx-image-add text-xl text-indigo-400 group-hover:scale-110 transition-transform shrink-0" />
          <span className="text-left min-w-0">
            <span className="block text-sm font-semibold text-fg-body">
              새 이미지를 올려 같은 지시로 작업하기
            </span>
            <span className="block text-xs text-fg-subtle mt-0.5 truncate">
              {ACCEPTED_IMAGE_HINT} · 드래그·붙여넣기(Ctrl+V)도 돼요
            </span>
          </span>
        </button>
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          className="sr-only"
          onChange={(e) => {
            const picked = e.target.files?.[0];
            if (picked) onAttach(picked);
            e.target.value = '';
          }}
        />
      </div>
    </div>
  );
}
