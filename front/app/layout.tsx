import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import './globals.css';
import 'boxicons/css/boxicons.min.css';
import AppShell from '@/components/layout/AppShell';
import AuthProvider from '@/components/providers/AuthProvider';
import FeatureFlagProvider from '@/components/providers/FeatureFlagProvider';
import QueryProvider from '@/components/providers/QueryProvider';
import ThemeProvider from '@/components/providers/ThemeProvider';
import ToastProvider from '@/components/providers/ToastProvider';

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

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
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
              <FeatureFlagProvider>
                {/* 토스트 컨테이너는 페이지 트리 밖에 있어야 화면을 옮겨도 안 사라진다 */}
                <ToastProvider>
                  <AppShell>{children}</AppShell>
                </ToastProvider>
              </FeatureFlagProvider>
            </QueryProvider>
          </AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
