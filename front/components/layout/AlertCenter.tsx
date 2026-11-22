'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useSession } from 'next-auth/react';
import { useQuery } from '@tanstack/react-query';
import { fetchJson } from '@/lib/api/authFetch';
import { formatCount, formatDateTime } from '@/lib/format';
import { queryKeys } from '@/lib/queryKeys';
import { cx } from '@/lib/cx';
import type { AIUsageSummary } from '@/types/aiUsageLog';
import type { ReportLogListResponse } from '@/types/reportLog';

/**
 * 헤더의 알림 센터.
 *
 * 리포트 메일은 백그라운드로 나가고, AI 토큰 예산도 조용히 차오른다 — 둘 다 해당
 * 관리자 페이지에 **직접 들어가야만** 알 수 있었다. 아무도 그 페이지를 열지 않으면
 * 고객에게 리포트가 안 나간 걸 며칠 뒤에 아는 구조였다. 여기서 모아 띄운다.
 *
 * 관리자에게만 보인다 — 신호의 출처가 전부 관리자 전용 엔드포인트다.
 */

/** 이보다 오래된 발송 실패는 "지금 손볼 일"이 아니라고 본다 */
const FAILURE_WINDOW_DAYS = 7;
/** 예산을 이 비율 이상 쓰면 미리 알린다 */
const BUDGET_WARN_RATIO = 0.9;
/** 목록을 다시 읽는 주기 — 발송은 분 단위로 일어난다 */
const POLL_MS = 60_000;

interface Signal {
  id: string;
  tone: 'danger' | 'warn';
  icon: string;
  title: string;
  detail: string;
  href: string;
}

export default function AlertCenter() {
  const { data: session } = useSession();
  const isAdmin = session?.user.role === 'admin';

  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  // 최근 발송 실패
  const failuresQuery = useQuery({
    queryKey: queryKeys.adminRecentSendFailures(),
    queryFn: () =>
      fetchJson<ReportLogListResponse>(
        '/api/admin/report-logs?status=error&limit=20&offset=0',
        undefined,
        '발송 실패 조회 실패',
      ),
    enabled: isAdmin,
    refetchInterval: POLL_MS,
  });

  // AI 토큰 예산 — 관리자 사용 이력 화면과 같은 키라 캐시를 공유한다
  const usageQuery = useQuery({
    queryKey: queryKeys.adminAiUsageSummary(),
    queryFn: () =>
      fetchJson<AIUsageSummary>(
        '/api/admin/ai-usage-logs/summary',
        undefined,
        '사용량 요약 조회 실패',
      ),
    enabled: isAdmin,
    refetchInterval: POLL_MS,
  });

  // 패널 밖을 누르면 닫는다
  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    window.addEventListener('mousedown', onDown);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('mousedown', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  if (!isAdmin) return null;

  const signals = buildSignals(failuresQuery.data, usageQuery.data);

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-label={signals.length > 0 ? `확인할 알림 ${signals.length}건` : '알림 없음'}
        className="relative flex items-center justify-center w-8 h-8 rounded-lg
          text-fg-muted hover:text-fg hover:bg-surface-2 transition-colors"
      >
        <i className={`bx ${signals.length > 0 ? 'bxs-bell-ring' : 'bx-bell'} text-lg`} />
        {signals.length > 0 && (
          <span
            className="absolute -top-0.5 -right-0.5 min-w-4 h-4 px-1 rounded-full
              bg-red-600 text-white text-[10px] font-bold leading-4 text-center"
          >
            {signals.length}
          </span>
        )}
      </button>

      {open && (
        <div
          role="region"
          aria-label="알림"
          className="absolute right-0 top-10 w-80 max-w-[calc(100vw-2rem)] z-[var(--z-popover)]
            rounded-xl border border-border bg-surface shadow-overlay overflow-hidden"
        >
          <p className="px-4 py-2.5 text-xs font-semibold text-fg-muted border-b border-border-soft">
            확인이 필요한 항목
          </p>

          {signals.length === 0 ? (
            <p className="px-4 py-6 text-center text-xs text-fg-subtle">
              <i className="bx bx-check-circle text-base block mb-1" aria-hidden />
              지금 손볼 일이 없습니다.
            </p>
          ) : (
            <ul className="divide-y divide-border-soft max-h-96 overflow-y-auto">
              {signals.map((s) => (
                <li key={s.id}>
                  <Link
                    href={s.href}
                    onClick={() => setOpen(false)}
                    className="flex items-start gap-2.5 px-4 py-3 hover:bg-surface-2 transition-colors"
                  >
                    <i
                      className={cx(
                        `bx ${s.icon} text-base shrink-0 mt-0.5`,
                        s.tone === 'danger' ? 'text-badge-danger-fg' : 'text-badge-amber-fg',
                      )}
                      aria-hidden
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block text-xs font-semibold text-fg">{s.title}</span>
                      <span className="block text-[11px] text-fg-subtle mt-0.5 leading-relaxed">
                        {s.detail}
                      </span>
                    </span>
                    <i className="bx bx-chevron-right text-fg-subtle shrink-0 mt-0.5" aria-hidden />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

/** 조회 결과를 "지금 손볼 일" 목록으로 번역한다. 조회에 실패했으면 그 신호는 건너뛴다 */
function buildSignals(
  failures: ReportLogListResponse | undefined,
  usage: AIUsageSummary | undefined,
): Signal[] {
  const out: Signal[] = [];

  if (failures) {
    const cutoff = Date.now() - FAILURE_WINDOW_DAYS * 24 * 60 * 60 * 1000;
    const recent = failures.items.filter((l) => new Date(l.created_at).getTime() >= cutoff);
    if (recent.length > 0) {
      out.push({
        id: 'send-failures',
        tone: 'danger',
        icon: 'bx-mail-send',
        title: `리포트 발송 실패 ${recent.length}건`,
        detail: `최근 ${FAILURE_WINDOW_DAYS}일 · 마지막 ${formatDateTime(recent[0].created_at)}`,
        href: '/admin/report-logs',
      });
    }
  }

  if (usage && usage.monthly_token_budget > 0) {
    const ratio = usage.total_tokens / usage.monthly_token_budget;
    if (ratio >= 1) {
      out.push({
        id: 'budget-over',
        tone: 'danger',
        icon: 'bx-coin-stack',
        title: 'AI 토큰 예산 초과',
        detail: `${usage.month} · ${formatCount(usage.total_tokens)} / ${formatCount(usage.monthly_token_budget)} 토큰`,
        href: '/admin/ai-usage-logs',
      });
    } else if (ratio >= BUDGET_WARN_RATIO) {
      out.push({
        id: 'budget-near',
        tone: 'warn',
        icon: 'bx-coin-stack',
        title: `AI 토큰 예산 ${Math.round(ratio * 100)}% 사용`,
        detail: `${usage.month} · ${formatCount(usage.total_tokens)} / ${formatCount(usage.monthly_token_budget)} 토큰`,
        href: '/admin/ai-usage-logs',
      });
    }
  }

  return out;
}
