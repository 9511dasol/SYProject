'use client';

/**
 * 데스크톱 사이드바 접힘 상태 (localStorage 영속).
 *
 * AppShell 안에 있던 것을 모듈로 뺀 이유 — 이미지 정제 화면이 "접혔을 때만
 * 지난 작업 레일을 왼쪽에 띄우는" 식으로 이 상태에 반응해야 한다. props 로
 * 내려보내려면 AppShell → page → client 전부를 지나야 하는데, 접힘은 셸의
 * 전역 상태라 구독으로 읽는 쪽이 맞다.
 *
 * localStorage 는 서버에 없다 — effect 로 읽어 setState 하면 렌더가 한 번 더
 * 돌고, 렌더 중에 읽으면 서버와 클라이언트가 달라 hydration 이 깨진다.
 * useSyncExternalStore(subscribe, peek, () => false) 로 쓰면 둘 다 피한다
 * (lib/imageFilterStorage 의 세션 복구와 같은 패턴이다).
 */

const COLLAPSED_KEY = 'appshell:sidebar-collapsed';

let collapsedCache = false;
let collapsedRead = false;
const listeners = new Set<() => void>();

export function peekSidebarCollapsed(): boolean {
  if (!collapsedRead) {
    try {
      collapsedCache = localStorage.getItem(COLLAPSED_KEY) === '1';
    } catch {
      /* 저장소 접근 불가 환경 — 기본값(펼침) 유지 */
    }
    collapsedRead = true;
  }
  return collapsedCache;
}

export function subscribeSidebarCollapsed(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function toggleSidebarCollapsed(): void {
  collapsedCache = !peekSidebarCollapsed();
  try {
    localStorage.setItem(COLLAPSED_KEY, collapsedCache ? '1' : '0');
  } catch {
    /* 기억하지 못할 뿐 동작은 한다 */
  }
  listeners.forEach((listener) => listener());
}
