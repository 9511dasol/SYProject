'use client';

import { useCallback, useMemo, useRef, useState } from 'react'; // useRef는 EmailTagInput 내부에서 사용
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getPeriods } from '@/lib/marketingClient';
import { getReportLogs, sendReportMail } from '@/lib/reportMailClient';
import type { ReportLog } from '@/lib/reportMailClient';
import { queryKeys } from '@/lib/queryKeys';

// ── 유틸 ──────────────────────────────────────────────────────────────────────

type Period = { year: number; month: number };

function periodKey(p: Period) {
  return `${p.year}-${String(p.month).padStart(2, '0')}`;
}

function parsePeriodKey(key: string): Period {
  const [y, m] = key.split('-');
  return { year: Number(y), month: Number(m) };
}

function fmtDate(str: string) {
  try {
    const d = new Date(str);
    return d.toLocaleDateString('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
  } catch {
    return str;
  }
}

// ── 이메일 태그 입력 ─────────────────────────────────────────────────────────

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function EmailTagInput({
  value,
  onChange,
}: {
  value: string[];
  onChange: (v: string[]) => void;
}) {
  const [raw, setRaw] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  function commit(text: string) {
    const trimmed = text.trim().replace(/,+$/, '');
    if (!trimmed) return;
    const emails = trimmed.split(/[\s,]+/).filter((e) => EMAIL_RE.test(e));
    if (emails.length > 0) {
      onChange([...value, ...emails.filter((e) => !value.includes(e))]);
      setRaw('');
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      commit(raw);
    } else if (e.key === 'Backspace' && raw === '' && value.length > 0) {
      onChange(value.slice(0, -1));
    }
  }

  return (
    <div
      className="flex flex-wrap gap-1.5 min-h-10 w-full rounded-xl border border-slate-200 dark:border-border bg-white dark:bg-surface-2 px-3 py-2 text-sm focus-within:ring-2 focus-within:ring-blue-500 focus-within:border-blue-400 cursor-text transition-shadow"
      onClick={() => inputRef.current?.focus()}
    >
      {value.map((email) => (
        <span
          key={email}
          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-blue-50 dark:bg-blue-950/60 border border-blue-100 dark:border-blue-800 text-blue-700 dark:text-blue-300 text-xs font-medium"
        >
          {email}
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onChange(value.filter((v) => v !== email)); }}
            className="text-blue-400 dark:text-blue-500 hover:text-blue-700 dark:hover:text-blue-300 transition-colors"
            aria-label={`${email} 삭제`}
          >
            <i className="bx bx-x text-sm" />
          </button>
        </span>
      ))}
      <input
        ref={inputRef}
        value={raw}
        onChange={(e) => setRaw(e.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={() => commit(raw)}
        placeholder={value.length === 0 ? '이메일 입력 후 Enter 또는 쉼표' : ''}
        className="flex-1 min-w-32 bg-transparent outline-none text-sm text-slate-700 dark:text-fg placeholder:text-slate-400 dark:placeholder:text-fg-subtle"
      />
    </div>
  );
}

// ── 기간 선택 드롭다운 (DB 저장 기간만 표시) ──────────────────────────────────

function PeriodSelect({
  label,
  badge,
  value,
  onChange,
  periods,
  loading,
  excludeKey,
}: {
  label: string;
  badge?: React.ReactNode;
  value: Period | null;
  onChange: (p: Period) => void;
  periods: Period[];
  loading: boolean;
  excludeKey?: string;   // 당월 선택 시 전월 목록에서 제외할 키
}) {
  const options = excludeKey ? periods.filter((p) => periodKey(p) !== excludeKey) : periods;
  const selectedKey = value ? periodKey(value) : '';

  if (loading) {
    return (
      <div className="space-y-1.5">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-slate-600 dark:text-fg-muted">{label}</span>
          {badge}
        </div>
        <div className="h-10 rounded-xl border border-slate-200 dark:border-border bg-slate-50 dark:bg-surface-2 animate-pulse" />
      </div>
    );
  }

  if (periods.length === 0) {
    return (
      <div className="space-y-1.5">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-slate-600 dark:text-fg-muted">{label}</span>
          {badge}
        </div>
        <div className="flex items-center gap-2 h-10 rounded-xl border border-dashed border-slate-200 dark:border-border bg-slate-50/50 dark:bg-surface-2/30 px-3 text-xs text-slate-400 dark:text-fg-subtle">
          <i className="bx bx-data text-sm" />
          DB에 저장된 기간이 없습니다
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-2">
        <span className="text-xs font-semibold text-slate-600 dark:text-fg-muted">{label}</span>
        {badge}
      </div>
      <select
        value={selectedKey}
        onChange={(e) => onChange(parsePeriodKey(e.target.value))}
        className="w-full rounded-xl border border-slate-200 dark:border-border px-3.5 py-2.5 text-sm text-slate-700 dark:text-fg bg-white dark:bg-surface-2 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-400 transition-shadow appearance-none cursor-pointer"
        style={{ backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%2394a3b8' stroke-width='2'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E\")", backgroundRepeat: 'no-repeat', backgroundPosition: 'right 12px center', paddingRight: '36px' }}
      >
        {options.length === 0 ? (
          <option value="" disabled>선택 가능한 기간 없음</option>
        ) : (
          options.map((p) => (
            <option key={periodKey(p)} value={periodKey(p)}>
              {p.year}년 {p.month}월
            </option>
          ))
        )}
      </select>
    </div>
  );
}

// ── 발송 이력 테이블 ──────────────────────────────────────────────────────────

function LogBadge({ status }: { status: ReportLog['status'] }) {
  if (status === 'sent') {
    return (
      <span className="badge badge-success">
        <i className="bx bx-check-circle text-sm" /> 발송 완료
      </span>
    );
  }
  return (
    <span className="badge badge-danger">
      <i className="bx bx-error-circle text-sm" /> 오류
    </span>
  );
}

function LogTable({ logs }: { logs: ReportLog[] }) {
  if (logs.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-slate-200 dark:border-border bg-slate-50/50 dark:bg-surface-2/30 py-12 flex flex-col items-center gap-3 text-center">
        <span className="w-12 h-12 rounded-full bg-slate-100 dark:bg-surface-2 flex items-center justify-center">
          <i className="bx bx-mail-send text-2xl text-slate-300 dark:text-fg-subtle" />
        </span>
        <div>
          <p className="text-sm font-medium text-slate-600 dark:text-fg-muted">아직 발송 이력이 없습니다</p>
          <p className="text-xs text-slate-400 dark:text-fg-subtle mt-1">리포트 발송 후 이곳에 이력이 표시됩니다.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto data-table">
      <table className="min-w-full text-sm">
        <thead>
          <tr>
            <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider">비교 기간</th>
            <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider whitespace-nowrap">수신자</th>
            <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider">상태</th>
            <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider whitespace-nowrap">발송 시각</th>
          </tr>
        </thead>
        <tbody>
          {logs.map((log) => (
            <tr key={log.id}>
              <td className="px-4 py-3 whitespace-nowrap">
                <span className="font-medium">{log.curr_year}년 {log.curr_month}월</span>
                <span className="text-slate-400 dark:text-fg-subtle mx-1.5">vs</span>
                <span>{log.prev_year}년 {log.prev_month}월</span>
              </td>
              <td className="px-4 py-3 max-w-48 truncate" title={log.recipients}>
                {log.recipients}
              </td>
              <td className="px-4 py-3">
                <div className="space-y-1">
                  <LogBadge status={log.status} />
                  {log.error_msg && (
                    <p className="text-xs text-red-500 dark:text-red-400 max-w-48 truncate" title={log.error_msg}>
                      {log.error_msg}
                    </p>
                  )}
                </div>
              </td>
              <td className="px-4 py-3 text-xs whitespace-nowrap">
                {fmtDate(log.created_at)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── 섹션 헤더 ─────────────────────────────────────────────────────────────────

function SectionHeader({ step, title, description }: { step: string; title: string; description: string }) {
  return (
    <div className="flex items-start gap-4 mb-6">
      <span className="flex items-center justify-center w-9 h-9 rounded-full bg-blue-600 text-white text-xs font-bold shrink-0 mt-0.5">
        {step}
      </span>
      <div>
        <h2 className="text-lg font-semibold text-slate-900 dark:text-fg tracking-tight">{title}</h2>
        <p className="text-sm text-slate-500 dark:text-fg-muted mt-0.5 leading-relaxed">{description}</p>
      </div>
    </div>
  );
}

// ── 설정 안내 배너 ────────────────────────────────────────────────────────────

function ConfigBanner() {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-xl border border-blue-100 dark:border-blue-900/50 bg-blue-50/60 dark:bg-blue-950/30 px-4 py-3">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between text-sm font-semibold text-blue-800 dark:text-blue-300"
      >
        <span className="flex items-center gap-2">
          <i className="bx bx-info-circle text-base text-blue-500 dark:text-blue-400" />
          API 키 · 메일 설정 안내
        </span>
        <i className={`bx ${open ? 'bx-chevron-up' : 'bx-chevron-down'} text-blue-400 dark:text-blue-500`} />
      </button>
      {open && (
        <div className="mt-3 text-xs text-blue-700 dark:text-blue-300 space-y-1.5 leading-relaxed border-t border-blue-100 dark:border-blue-900/50 pt-3">
          <p>백엔드 서버 실행 전 <code className="bg-blue-100 dark:bg-blue-900/50 px-1 py-0.5 rounded font-mono">.env</code> 파일에 아래 환경변수를 설정하세요.</p>
          <pre className="bg-white/70 dark:bg-surface-2/70 border border-blue-100 dark:border-blue-900/50 rounded-lg p-3 font-mono text-[11px] overflow-x-auto leading-5">{`# LLM
OPENAI_API_KEY=sk-...
OPENAI_MODEL=gpt-4o-mini

# 메일 (SMTP / Gmail)
MAIL_PROVIDER=smtp
SMTP_HOST=smtp.gmail.com
SMTP_PORT=465
SMTP_USERNAME=you@gmail.com
SMTP_PASSWORD=앱비밀번호
SMTP_FROM=you@gmail.com

# 또는 Resend
# MAIL_PROVIDER=resend
# RESEND_API_KEY=re_...
# RESEND_FROM=noreply@domain.com`}</pre>
        </div>
      )}
    </div>
  );
}

// ── 메인 컴포넌트 ─────────────────────────────────────────────────────────────

export default function ReportEmailClient() {
  const queryClient = useQueryClient();

  const [currPeriod, setCurrPeriod] = useState<Period | null>(null);
  const [prevPeriod, setPrevPeriod] = useState<Period | null>(null);
  const [recipients, setRecipients] = useState<string[]>([]);
  const [subject, setSubject] = useState('');
  const [toast, setToast] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);

  // DB 저장 기간 목록 (최신순 정렬)
  const { data: periods = [], isLoading: periodsLoading } = useQuery({
    queryKey: queryKeys.periods(),
    queryFn: getPeriods,
    staleTime: 60_000,
    select: (data) => {
      // 초기 선택: 첫 번째(최신) = 당월, 두 번째 = 전월
      if (data.length > 0 && currPeriod === null) {
        setCurrPeriod(data[0]);
        setPrevPeriod(data[1] ?? null);
      }
      return data;
    },
  });

  // 당월 변경 → 목록에서 다음 항목을 전월로 자동 선택
  const handleCurrChange = useCallback((p: Period) => {
    setCurrPeriod(p);
    const idx = periods.findIndex((d) => periodKey(d) === periodKey(p));
    setPrevPeriod(periods[idx + 1] ?? null);
  }, [periods]);

  // 발송 이력
  const { data: logs = [], isFetching: logsFetching } = useQuery({
    queryKey: queryKeys.reportLogs(),
    queryFn: () => getReportLogs(30),
    refetchInterval: 10_000,
  });

  // 발송 mutation
  const sendMutation = useMutation({
    mutationFn: sendReportMail,
    onSuccess: (data) => {
      setToast({ type: 'success', msg: data.message ?? '리포트 메일 발송이 시작되었습니다.' });
      setTimeout(() => queryClient.invalidateQueries({ queryKey: queryKeys.reportLogs() }), 3000);
    },
    onError: (err: Error) => {
      setToast({ type: 'error', msg: err.message });
    },
  });

  const handleSubmit = useCallback((e: React.FormEvent) => {
    e.preventDefault();
    if (!currPeriod || !prevPeriod) {
      setToast({ type: 'error', msg: 'DB에 저장된 기간이 2개 이상 있어야 비교 발송이 가능합니다.' });
      return;
    }
    if (recipients.length === 0) {
      setToast({ type: 'error', msg: '수신자 이메일을 1개 이상 입력하세요.' });
      return;
    }
    sendMutation.mutate({
      curr_year: currPeriod.year,
      curr_month: currPeriod.month,
      prev_year: prevPeriod.year,
      prev_month: prevPeriod.month,
      recipients,
      subject: subject.trim(),
    });
  }, [currPeriod, prevPeriod, recipients, subject, sendMutation]);

  const defaultSubjectPreview = useMemo(
    () => currPeriod
      ? `[마케팅 리포트] ${currPeriod.year}년 ${currPeriod.month}월 성과 요약`
      : '[마케팅 리포트] 성과 요약',
    [currPeriod],
  );

  return (
    <>
      {/* 배경 그라디언트 */}
      <div className="fixed inset-0 -z-10 pointer-events-none" aria-hidden>
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_50%_at_50%_-20%,rgba(37,99,235,0.10),transparent)]" />
        <div className="absolute inset-0 bg-[linear-gradient(to_bottom,transparent,rgba(248,250,252,0.8))]" />
      </div>

      {/* 토스트 */}
      {toast && (
        <div
          role="alert"
          className={`fixed top-5 right-5 z-50 flex items-start gap-3 rounded-2xl px-4 py-3 shadow-xl text-sm font-medium w-80 transition-all
            ${toast.type === 'success' ? 'bg-emerald-600 text-white' : 'bg-red-600 text-white'}`}
        >
          <i className={`bx ${toast.type === 'success' ? 'bx-check-circle' : 'bx-error-circle'} text-xl shrink-0`} />
          <span className="flex-1 leading-snug">{toast.msg}</span>
          <button onClick={() => setToast(null)} className="opacity-70 hover:opacity-100 transition-opacity shrink-0">
            <i className="bx bx-x text-lg" />
          </button>
        </div>
      )}

      <div className="max-w-4xl w-full mx-auto px-4 sm:px-6 py-8 sm:py-10 space-y-8">
        {/* 페이지 헤더 */}
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-blue-600 mb-2">
            Report Mail System
          </p>
          <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 dark:text-fg tracking-tight mb-2">
            코멘트 & 리포트 메일
          </h1>
          <p className="text-sm text-slate-500 dark:text-fg-muted leading-relaxed max-w-xl">
            DB에 저장된 광고 데이터를 기간 비교 분석하고, AI가 자동으로 코멘트를 작성해 이메일로 발송합니다.
          </p>
        </div>

        {/* 설정 안내 */}
        <ConfigBanner />

        {/* 리포트 발송 폼 */}
        <section>
          <div className="rounded-2xl border border-slate-200/80 dark:border-border bg-white/90 dark:bg-surface shadow-sm shadow-slate-200/50 dark:shadow-black/20 p-5 sm:p-7">
            <SectionHeader
              step="01"
              title="리포트 발송"
              description="비교할 기간을 선택하고 수신자를 입력한 뒤 발송 버튼을 누르세요. AI 코멘트 생성 후 메일이 자동 발송됩니다."
            />

            <form onSubmit={handleSubmit} className="space-y-5">
              {/* 기간 선택 */}
              <div className="grid sm:grid-cols-2 gap-4">
                <PeriodSelect
                  label="당월 (기준)"
                  badge={
                    <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-blue-600 bg-blue-50 border border-blue-100 px-1.5 py-0.5 rounded-md">
                      <i className="bx bx-calendar text-xs" /> 비교 기준
                    </span>
                  }
                  value={currPeriod}
                  onChange={handleCurrChange}
                  periods={periods}
                  loading={periodsLoading}
                  excludeKey={prevPeriod ? periodKey(prevPeriod) : undefined}
                />
                <PeriodSelect
                  label="전월 (비교 대상)"
                  badge={
                    <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-slate-500 bg-slate-50 border border-slate-200 px-1.5 py-0.5 rounded-md">
                      <i className="bx bx-history text-xs" /> 이전 기간
                    </span>
                  }
                  value={prevPeriod}
                  onChange={setPrevPeriod}
                  periods={periods}
                  loading={periodsLoading}
                  excludeKey={currPeriod ? periodKey(currPeriod) : undefined}
                />
              </div>

              {/* 수신자 */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-600 dark:text-fg-muted">
                  수신자 <span className="text-red-500">*</span>
                </label>
                <EmailTagInput value={recipients} onChange={setRecipients} />
                <p className="text-xs text-slate-400 dark:text-fg-subtle">이메일을 입력하고 Enter 또는 쉼표로 추가합니다. 여러 명 등록 가능.</p>
              </div>

              {/* 제목 */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-600 dark:text-fg-muted">메일 제목 (선택)</label>
                <input
                  type="text"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  placeholder={defaultSubjectPreview}
                  className="w-full rounded-xl border border-slate-200 dark:border-border px-3.5 py-2.5 text-sm text-slate-700 dark:text-fg bg-white dark:bg-surface-2 placeholder:text-slate-400 dark:placeholder:text-fg-subtle focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-400 transition-shadow"
                />
                <p className="text-xs text-slate-400 dark:text-fg-subtle">비우면 자동 생성: {defaultSubjectPreview}</p>
              </div>

              {/* 발송 버튼 */}
              <div className="flex items-center justify-between gap-4 pt-1">
                <div className="flex items-center gap-2 text-xs text-slate-400 dark:text-fg-subtle">
                  <i className="bx bx-time-five text-sm" />
                  <span>AI 코멘트 생성 후 백그라운드로 발송됩니다 (30초~2분 소요)</span>
                </div>
                <button
                  type="submit"
                  disabled={sendMutation.isPending || recipients.length === 0}
                  className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold bg-blue-600 text-white hover:bg-blue-700 active:scale-[0.98] transition-all disabled:opacity-50 disabled:pointer-events-none shadow-sm shadow-blue-600/20 shrink-0"
                >
                  {sendMutation.isPending ? (
                    <>
                      <span className="w-4 h-4 rounded-full border-2 border-white/40 border-t-white animate-spin" />
                      발송 중…
                    </>
                  ) : (
                    <>
                      <i className="bx bx-mail-send text-base" />
                      리포트 발송
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </section>

        {/* 발송 이력 */}
        <section>
          <div className="rounded-2xl border border-slate-200/80 dark:border-border bg-white/90 dark:bg-surface shadow-sm shadow-slate-200/50 dark:shadow-black/20 p-5 sm:p-7">
            <div className="flex items-center justify-between mb-6">
              <SectionHeader
                step="02"
                title="발송 이력"
                description="최근 30건의 리포트 메일 발송 이력입니다. 10초마다 자동 갱신됩니다."
              />
              {logsFetching && (
                <span className="w-4 h-4 rounded-full border-2 border-slate-200 dark:border-border border-t-blue-500 animate-spin shrink-0 mt-0.5" aria-label="갱신 중" />
              )}
            </div>
            <LogTable logs={logs} />
          </div>
        </section>

        {/* 자동 발송 안내 */}
        <section>
          <div className="rounded-2xl border border-slate-200/80 dark:border-border bg-white/90 dark:bg-surface shadow-sm shadow-slate-200/50 dark:shadow-black/20 p-5 sm:p-7">
            <SectionHeader
              step="03"
              title="자동 발송 스케줄"
              description="APScheduler를 통해 매월 자동으로 리포트가 발송됩니다. 환경변수로 설정합니다."
            />
            <div className="grid sm:grid-cols-3 gap-3">
              {[
                { icon: 'bx-calendar-event', title: '기본 스케줄', desc: '매월 1일 오전 9시', var: 'REPORT_CRON_HOUR / DAY' },
                { icon: 'bx-envelope', title: '자동 수신자', desc: '쉼표로 구분한 이메일 목록', var: 'REPORT_AUTO_RECIPIENTS' },
                { icon: 'bx-cog', title: '비활성화 방법', desc: 'REPORT_AUTO_RECIPIENTS를 비우면 건너뜀', var: '' },
              ].map((item) => (
                <div key={item.title} className="rounded-xl border border-slate-100 dark:border-border bg-slate-50/60 dark:bg-surface-2 p-4 space-y-1.5">
                  <div className="flex items-center gap-2">
                    <i className={`bx ${item.icon} text-blue-500 dark:text-blue-400 text-lg`} />
                    <span className="text-xs font-semibold text-slate-700 dark:text-fg">{item.title}</span>
                  </div>
                  <p className="text-xs text-slate-600 dark:text-fg-muted">{item.desc}</p>
                  {item.var && (
                    <code className="text-[10px] font-mono bg-slate-200/60 dark:bg-surface-3/60 text-slate-600 dark:text-fg-muted px-1.5 py-0.5 rounded">{item.var}</code>
                  )}
                </div>
              ))}
            </div>
          </div>
        </section>
      </div>
    </>
  );
}
