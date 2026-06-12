import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import { cookies } from 'next/headers';
import './globals.css';
import 'boxicons/css/boxicons.min.css';
import AppShell from '@/components/layout/AppShell';
import AuthProvider from '@/components/providers/AuthProvider';
import QueryProvider from '@/components/providers/QueryProvider';
import ThemeProvider from '@/components/providers/ThemeProvider';
import { TASK_ID_COOKIE } from '@/lib/taskCookieUtils';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  title: {
    default: '마케팅 AI 분석기',
    template: '%s | 마케팅 AI',
  },
  description: '매체·전환 데이터 분석, 이미지 정제, 헤딩 문구 추천까지 한곳에서',
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // SSR 단계에서 쿠키를 읽어 task_id를 클라이언트 위젯에 주입
  // → 새로고침 시에도 위젯이 깜빡임 없이 바로 렌더링됨
  const cookieStore = await cookies();
  const initialTaskId = cookieStore.get(TASK_ID_COOKIE)?.value ?? null;

  return (
    <html
      lang="ko"
      suppressHydrationWarning
      data-scroll-behavior="smooth"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full">
        <ThemeProvider>
          <AuthProvider>
            <QueryProvider>
              <AppShell>{children}</AppShell>
            </QueryProvider>
          </AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
