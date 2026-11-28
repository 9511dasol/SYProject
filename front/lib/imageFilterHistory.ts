import { readableLogPrompt } from '@/lib/imageFilterPrompt';
import type { EditPromptRecord } from '@/types/imageFilter';

/** 대화 한 줄 — 전송 1회 (지시 + 보관된 결과 이미지) */
export interface HistoryEntry {
  recordId: number;
  text: string;
  at: number;
  /** 생성 당시 시안 장수 */
  variantCount: number;
  /** false 면 보관 기간(14일)이 지나 이미지가 삭제된 것 */
  imagesAvailable: boolean;
  /** 실제 보관된 장수 — 썸네일은 이 수만큼만 그린다 */
  imageCount: number;
}

/** 지난 작업 묶음 하나 — 한 작업에서 이어 보낸 지시들을 한 "대화"로 본다 */
export interface HistoryGroup {
  /** 목록·선택 표시에 쓰는 고유 키 — 대화 id 가 있으면 그것, 없으면 파일명 기반 */
  key: string;
  /** 서버가 아는 대화 id — 이어서 작업할 때 이 값을 다시 보내 같은 대화에 쌓는다.
   *  null 이면 대화 id 가 생기기 전 기록(파일명 묶음)이다 */
  threadId: string | null;
  /** 대화 이름 — 가장 최근 전송의 파일명 */
  filename: string;
  latestAt: number;
  /** 최신순 — 화면 목록용. 대화(스레드)로 볼 때는 뒤집어 시간순으로 쓴다 */
  items: HistoryEntry[];
}

/**
 * 기록을 대화별로 묶는다.
 *
 * 대화 id(`thread_id`)가 있으면 그것으로 묶는다 — 화면이 작업을 시작할 때 만들어
 * 전송마다 함께 보내는 값이다. 예전에는 파일명으로 묶었는데 두 가지가 어긋났다:
 * 이름이 같은 다른 이미지가 한 대화로 합쳐졌고, 결과를 이어 편집해 파일명이
 * 달라지면 같은 작업이 여러 대화로 쪼개졌다.
 *
 * 대화 id 가 없는 예전 기록은 그대로 파일명으로 묶는다 — 그때의 전송이 어느
 * 작업에 속했는지는 복원할 수 없다. 두 종류의 키가 겹치지 않게 접두어를 단다.
 * 순서는 묶음·묶음 안 모두 최신이 먼저다(서버가 최신순을 준다).
 */
export function groupHistory(records: EditPromptRecord[]): HistoryGroup[] {
  const groups = new Map<string, HistoryGroup>();
  for (const record of records) {
    const filename = record.image_filename || '(이름 없는 이미지)';
    const threadId = record.thread_id || null;
    const key = threadId ? `t:${threadId}` : `f:${filename}`;
    const entry: HistoryEntry = {
      recordId: record.id,
      text: readableLogPrompt(record.prompt),
      at: Date.parse(record.created_at),
      variantCount: record.variant_count ?? 0,
      imagesAvailable: record.images_available ?? false,
      imageCount: record.image_count ?? 0,
    };
    const found = groups.get(key);
    if (found) found.items.push(entry);
    // 최신순으로 들어오므로 처음 본 기록의 파일명이 곧 "가장 최근 파일명"이다
    else groups.set(key, { key, threadId, filename, latestAt: entry.at, items: [entry] });
  }
  return [...groups.values()];
}

/** "3시간 전" 처럼 읽기 — 시각만 보여 주면 언제였는지 가늠이 안 된다 */
export function sinceText(savedAt: number): string {
  const minutes = Math.floor((Date.now() - savedAt) / 60000);
  if (minutes < 1) return '방금';
  if (minutes < 60) return `${minutes}분 전`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}시간 전`;
  return `${Math.floor(hours / 24)}일 전`;
}
