'use client';

import { useState, useSyncExternalStore } from 'react';
import { usePathname } from 'next/navigation';
import Sidebar from '@/components/layout/Sidebar';
import Header from '@/components/layout/Header';
import {
  peekSidebarCollapsed,
  subscribeSidebarCollapsed,
  toggleSidebarCollapsed,
} from '@/lib/sidebarStore';

interface AppShellProps {
  children: React.ReactNode;
}

// 자체 헤더를 가진 페이지들 — 앱 셸(사이드바 + 헤더)을 씌우지 않는다.
// /automation 은 광고 트래픽을 받는 판매 페이지라 방문자 대부분이 로그인 전이다.
const FULL_BLEED_PATHS = ['/', '/login', '/automation'];

export default function AppShell({ children }: AppShellProps) {
  // 모바일: 오버레이 서랍(열림/닫힘) · 데스크톱: 본문을 미는 고정 패널(펼침/접힘).
  // 같은 사이드바지만 두 동작은 독립이라 상태를 나눠 둔다 — 하나로 합치면
  // 모바일에서 닫은 것이 데스크톱 접힘으로 번지는 식으로 서로를 오염시킨다.
  // 접힘은 다른 화면(이미지 정제의 지난 작업 레일)도 반응해야 해서 공용 스토어다.
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const collapsed = useSyncExternalStore(
    subscribeSidebarCollapsed,
    peekSidebarCollapsed,
    () => false,
  );
  const pathname = usePathname();

  // 햄버거 버튼 하나가 두 동작을 맡는다 — 어느 쪽을 움직일지는 그 시점의
  // 뷰포트가 정한다. 이벤트 핸들러 안이므로 window 를 읽어도 안전하다.
  const handleMenuClick = () => {
    if (window.matchMedia('(min-width: 1024px)').matches) toggleSidebarCollapsed();
    else setSidebarOpen((prev) => !prev);
  };

  // 로그인 · 제품 소개(랜딩) 페이지는 사이드바/헤더 없이 전체 화면으로 표시
  if (FULL_BLEED_PATHS.includes(pathname)) {
    return <>{children}</>;
  }

  return (
    <div className="min-h-screen flex bg-bg transition-colors duration-200">
      {/* 사이드바 */}
      <Sidebar
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        collapsed={collapsed}
        onCollapse={toggleSidebarCollapsed}
      />

      {/* 메인 컨텐츠 영역 — 사이드바 접힘에 맞춰 여백도 함께 움직인다 */}
      <div
        className={`flex-1 flex flex-col min-w-0 transition-[margin] duration-300 ease-in-out ${
          collapsed ? '' : 'lg:ml-64'
        }`}
      >
        <Header onMenuClick={handleMenuClick} />
        <main className="flex-1">{children}</main>
      </div>
    </div>
  );
}
