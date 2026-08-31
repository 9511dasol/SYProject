'use client';

import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import ToastContainer, { type ToastItem, type ToastType } from '@/components/ui/Toast';

/**
 * 전역 토스트.
 *
 * ToastContainer 는 표시 전용 컴포넌트였고 상태·push·remove 는 화면마다 각자
 * 구현했다 — 같은 보일러플레이트가 8곳에 복제됐고 함수 이름도 addToast /
 * pushToast 로 갈렸다. 게다가 DashboardClient 와 그 안의 DbDashboard 가 각각
 * 컨테이너를 띄워서 토스트 무리가 두 겹으로 쌓였다.
 *
 * 여기로 올리면 호출부는 useToast() 한 줄이면 되고, 화면 전환 중에 뜬 토스트도
 * 사라지지 않는다(컨테이너가 페이지 트리 밖에 있으므로).
 */

interface ToastAction {
  label: string;
  onClick: () => void;
}

interface ToastContextValue {
  /** 예전 pushToast · addToast 와 인자 순서가 같다 */
  toast: (type: ToastType, message: string, action?: ToastAction) => void;
  dismiss: (id: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export default function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  // id 는 단순 증가 카운터로 만든다. 예전에는 `${Date.now()}-${Math.random()}` 을
  // 썼는데, 서버·클라이언트 렌더가 다른 값을 내는 종류의 값이라 굳이 쓸 이유가 없다.
  const seq = useRef(0);

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const toast = useCallback((type: ToastType, message: string, action?: ToastAction) => {
    seq.current += 1;
    const id = `toast-${seq.current}`;
    setToasts((prev) => [...prev, { id, type, message, action }]);
  }, []);

  const value = useMemo(() => ({ toast, dismiss }), [toast, dismiss]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <ToastContainer toasts={toasts} onRemove={dismiss} />
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error('useToast는 ToastProvider 안에서만 쓸 수 있습니다. app/layout.tsx를 확인하세요.');
  }
  return ctx;
}
