'use client';

import { useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { signOut, useSession } from 'next-auth/react';

/** 사이드바 하단 고정 프로필 영역 — 사용자 정보 표시 및 로그아웃 */
export default function SidebarProfile() {
  // 세션을 그대로 읽는다. 예전에는 zustand 스토어에 복사해 두고 그걸 읽었는데,
  // 같은 값의 출처가 둘로 갈리는 데다 persist 때문에 로그아웃 후에도 localStorage 에
  // 사용자 정보가 남았다.
  const { data: session } = useSession();
  const [loggingOut, setLoggingOut] = useState(false);

  const user = session?.user;
  if (!user) return null;

  const name = user.name ?? '';
  const initial = name.trim().charAt(0).toUpperCase() || '?';

  const handleLogout = async () => {
    if (loggingOut) return;
    setLoggingOut(true);
    try {
      // 로그아웃하면 로그인 폼이 아니라 제품 소개 페이지로 나간다.
      await signOut({ callbackUrl: '/' });
    } catch {
      setLoggingOut(false);
    }
  };

  return (
    <div className="sticky bottom-0 px-3 py-3 border-t border-border-soft bg-surface shrink-0">
      <div className="flex items-center gap-3 px-2 py-2 rounded-xl">
        {/* 아바타 */}
        {user.image ? (
          <Image
            src={user.image}
            alt={name}
            width={36}
            height={36}
            unoptimized
            className="w-9 h-9 rounded-full object-cover shrink-0"
          />
        ) : (
          <div
            className="flex items-center justify-center w-9 h-9 rounded-full shrink-0
              bg-linear-to-br from-blue-600 to-indigo-600 text-white text-sm font-bold"
          >
            {initial}
          </div>
        )}

        {/* 이름 / 이메일 */}
        <Link href="/profile" className="flex-1 min-w-0 group" title="프로필 설정">
          <p className="text-sm font-semibold text-fg truncate group-hover:text-primary transition-colors">{name}</p>
          <p className="text-xs text-fg-subtle truncate">{user.email}</p>
        </Link>

        {/* 프로필 설정 */}
        <Link
          href="/profile"
          aria-label="프로필 설정"
          title="프로필 설정"
          className="flex items-center justify-center w-8 h-8 rounded-lg shrink-0
            text-fg-subtle hover:text-fg hover:bg-surface-2 transition-colors"
        >
          <i className="bx bx-cog text-lg" />
        </Link>

        {/* 로그아웃 */}
        <button
          onClick={handleLogout}
          disabled={loggingOut}
          aria-label="로그아웃"
          title="로그아웃"
          className="flex items-center justify-center w-8 h-8 rounded-lg shrink-0
            text-fg-subtle hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20
            transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <i className={`bx ${loggingOut ? 'bx-loader-alt animate-spin' : 'bx-log-out'} text-lg`} />
        </button>
      </div>
    </div>
  );
}
