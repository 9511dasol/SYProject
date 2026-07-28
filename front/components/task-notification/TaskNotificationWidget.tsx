'use client';

import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'framer-motion';

import { fetchTaskStatus } from '@/lib/taskClient';
import {
  clearTaskIdCookie,
  getTaskIdFromCookie,
} from '@/lib/taskCookieUtils';
import type { TaskStatus } from '@/types/task';
import ProgressBar from './ProgressBar';
import ProgressRing from './ProgressRing';

const LS_KEY = 'task_notification_minimized';
const MINIMIZED_EVENT = 'task-notification-minimized';

function isTerminal(status?: TaskStatus): boolean {
  return status === 'completed' || status === 'failed';
}

// ── 최소화 상태: localStorage를 외부 스토어로 구독한다 ────────────────────────
// 이펙트에서 localStorage를 읽어 setState 하면 마운트마다 렌더가 한 번 더 돌고,
// 서버/클라이언트 첫 렌더를 맞추려고 별도의 "준비됨" 플래그까지 필요했다.
// useSyncExternalStore는 서버 스냅샷을 따로 주므로 두 문제가 함께 없어지고,
// 덤으로 다른 탭에서의 변경(storage 이벤트)까지 반영된다.

function subscribeMinimized(onStoreChange: () => void): () => void {
  window.addEventListener('storage', onStoreChange);        // 다른 탭
  window.addEventListener(MINIMIZED_EVENT, onStoreChange);  // 같은 탭
  return () => {
    window.removeEventListener('storage', onStoreChange);
    window.removeEventListener(MINIMIZED_EVENT, onStoreChange);
  };
}

function readMinimized(): boolean {
  return window.localStorage.getItem(LS_KEY) === 'true';
}

function setMinimized(value: boolean): void {
  window.localStorage.setItem(LS_KEY, String(value));
  window.dispatchEvent(new Event(MINIMIZED_EVENT));
}

function clearMinimized(): void {
  window.localStorage.removeItem(LS_KEY);
  window.dispatchEvent(new Event(MINIMIZED_EVENT));
}

// 하이드레이션이 끝나야 localStorage 값을 알 수 있다 — 그 전에는 렌더하지 않아
// 접힘/펼침이 바뀌며 생기는 레이아웃 시프트를 막는다.
const subscribeNever = () => () => {};

interface Props {
  /** 서버 컴포넌트(layout)에서 SSR 단계에 읽어 온 초기 task_id */
  initialTaskId: string | null;
}

export default function TaskNotificationWidget({ initialTaskId }: Props) {
  const [taskId, setTaskId] = useState<string | null>(initialTaskId);
  const prevStatusRef = useRef<TaskStatus | undefined>(undefined);

  const isHydrated = useSyncExternalStore(subscribeNever, () => true, () => false);
  const isMinimized = useSyncExternalStore(subscribeMinimized, readMinimized, () => false);

  // 1) 다른 컴포넌트에서 task-started 이벤트를 보내면 위젯 활성화
  useEffect(() => {
    const handler = (e: Event) => {
      const { taskId: id } = (e as CustomEvent<{ taskId: string }>).detail;
      setTaskId(id);
      setMinimized(false);
    };
    window.addEventListener('task-started', handler);
    return () => window.removeEventListener('task-started', handler);
  }, []);

  // 2) 페이지 포커스 시 쿠키 재확인 (다른 탭에서 작업 시작한 경우 대비)
  useEffect(() => {
    const sync = () => {
      const id = getTaskIdFromCookie();
      if (id && id !== taskId) setTaskId(id);
    };
    window.addEventListener('focus', sync);
    return () => window.removeEventListener('focus', sync);
  }, [taskId]);

  // 3) TanStack Query 폴링
  const { data } = useQuery({
    queryKey: ['taskStatus', taskId],
    queryFn: () => fetchTaskStatus(taskId!),
    enabled: !!taskId,
    refetchInterval: (query) => {
      if (!taskId) return false;
      const status = query.state.data?.status;
      return isTerminal(status) ? false : 3000;
    },
  });

  // 4) 완료/실패 시 최소화 해제 (접혀 있었다면 펼쳐서 결과 보여주기)
  useEffect(() => {
    if (!data) return;
    if (isTerminal(data.status) && !isTerminal(prevStatusRef.current)) {
      setMinimized(false);
    }
    prevStatusRef.current = data.status;
  }, [data]);

  const handleClose = () => {
    clearTaskIdCookie();
    setTaskId(null);
    clearMinimized();
  };

  // task_id 없거나 아직 최소화 상태를 모르면 아무것도 렌더링하지 않음
  if (!taskId || !isHydrated) return null;

  const progress = data?.progress ?? 0;
  const status: TaskStatus = data?.status ?? 'processing';
  const message = data?.message ?? '처리 중...';
  const step = data?.step;
  const totalSteps = data?.total_steps;

  const statusColor =
    status === 'completed'
      ? 'from-emerald-500 to-green-500'
      : status === 'failed'
        ? 'from-red-500 to-rose-500'
        : 'from-blue-600 to-indigo-600';

  return (
    <div className="fixed bottom-4 right-4 z-50">
      <AnimatePresence mode="wait" initial={false}>
        {/* ── 최소화 상태: 원형 프로그레스 버튼 ── */}
        {isMinimized ? (
          <motion.button
            key="minimized"
            initial={{ scale: 0.6, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.6, opacity: 0 }}
            transition={{ type: 'spring', damping: 20, stiffness: 300 }}
            onClick={() => setMinimized(false)}
            aria-label="알림창 열기"
            className={`relative w-14 h-14 rounded-full bg-gradient-to-br ${statusColor} shadow-lg shadow-blue-500/30 flex items-center justify-center cursor-pointer`}
          >
            <span className="absolute inset-0 flex items-center justify-center">
              <ProgressRing value={progress} size={56} strokeWidth={3} />
            </span>
            <span className="relative z-10 text-white text-[11px] font-bold leading-none">
              {progress}%
            </span>
          </motion.button>
        ) : (
          /* ── 최대화 상태: 알림 카드 ── */
          <motion.div
            key="expanded"
            initial={{ scale: 0.88, opacity: 0, y: 16 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.88, opacity: 0, y: 16 }}
            transition={{ type: 'spring', damping: 26, stiffness: 320 }}
            className="w-80 rounded-2xl overflow-hidden shadow-2xl shadow-black/15 border border-white/10"
          >
            {/* 헤더 */}
            <div
              className={`flex items-center justify-between px-4 py-3 bg-gradient-to-r ${statusColor}`}
            >
              <div className="flex items-center gap-2 min-w-0">
                {status === 'processing' && (
                  <motion.span
                    animate={{ rotate: 360 }}
                    transition={{ duration: 1.4, repeat: Infinity, ease: 'linear' }}
                    className="shrink-0 w-4 h-4 border-2 border-white border-t-transparent rounded-full inline-block"
                  />
                )}
                {status === 'completed' && (
                  <motion.span
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    className="shrink-0 text-white text-base"
                  >
                    ✓
                  </motion.span>
                )}
                {status === 'failed' && (
                  <span className="shrink-0 text-white text-base">✕</span>
                )}
                <span className="text-white text-sm font-semibold truncate">
                  {status === 'completed'
                    ? '처리 완료'
                    : status === 'failed'
                      ? '처리 실패'
                      : '백그라운드 처리 중'}
                </span>
              </div>

              <div className="flex items-center gap-0.5 shrink-0 ml-2">
                <button
                  onClick={() => setMinimized(true)}
                  className="text-white/70 hover:text-white p-1.5 rounded-lg hover:bg-white/10 transition-colors"
                  aria-label="최소화"
                >
                  {/* minus icon */}
                  <svg viewBox="0 0 24 24" className="w-4 h-4" fill="currentColor">
                    <path d="M19 13H5v-2h14v2z" />
                  </svg>
                </button>
                <button
                  onClick={handleClose}
                  className="text-white/70 hover:text-white p-1.5 rounded-lg hover:bg-white/10 transition-colors"
                  aria-label="닫기"
                >
                  {/* close icon */}
                  <svg viewBox="0 0 24 24" className="w-4 h-4" fill="currentColor">
                    <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
                  </svg>
                </button>
              </div>
            </div>

            {/* 본문 */}
            <div className="bg-white px-4 py-3.5 space-y-3">
              {/* 단계 + 메시지 */}
              <div className="space-y-0.5">
                {step != null && totalSteps != null && (
                  <p className="text-xs font-medium text-gray-400">
                    [{step}/{totalSteps}] 단계
                  </p>
                )}
                <p className="text-sm text-gray-700 leading-snug">{message}</p>
              </div>

              {/* 진행률 바 */}
              <div className="space-y-1.5">
                <div className="flex justify-between items-center">
                  <span className="text-xs text-gray-400">진행률</span>
                  <motion.span
                    key={progress}
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="text-xs font-semibold text-gray-600"
                  >
                    {progress}%
                  </motion.span>
                </div>
                <ProgressBar value={progress} />
              </div>
            </div>

            {/* 완료/실패 시 푸터 버튼 */}
            <AnimatePresence>
              {isTerminal(status) && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  className="bg-white overflow-hidden"
                >
                  <div className="px-4 pb-4 pt-0">
                    <button
                      onClick={handleClose}
                      className={`w-full py-2 rounded-xl text-sm font-semibold text-white transition-colors ${
                        status === 'completed'
                          ? 'bg-emerald-500 hover:bg-emerald-600'
                          : 'bg-red-500 hover:bg-red-600'
                      }`}
                    >
                      {status === 'completed' ? '확인 및 닫기' : '닫기'}
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
