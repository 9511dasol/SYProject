'use client';

import { useState } from 'react';
import { usePathname } from 'next/navigation';
import Sidebar from '@/components/layout/Sidebar';
import Header from '@/components/layout/Header';

interface AppShellProps {
  children: React.ReactNode;
}

// 자체 헤더를 가진 페이지들 — 앱 셸(사이드바 + 헤더)을 씌우지 않는다.
const FULL_BLEED_PATHS = ['/', '/login'];

export default function AppShell({ children }: AppShellProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const pathname = usePathname();

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
      />

      {/* 메인 컨텐츠 영역 */}
      <div className="flex-1 flex flex-col min-w-0 lg:ml-64">
        <Header onMenuClick={() => setSidebarOpen((prev) => !prev)} />
        <main className="flex-1">{children}</main>
      </div>
    </div>
  );
}
