'use client';

import { useCallback, useMemo, useRef, useState } from 'react'; // useRef는 EmailTagInput 내부에서 사용
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { formatDateTime } from '@/lib/format';
import { getPeriods } from '@/lib/marketingClient';
import { getReportLogs, sendReportMail } from '@/lib/reportMailClient';
import type { ReportLog } from '@/lib/reportMailClient';
import { queryKeys } from '@/lib/queryKeys';
import { Input, Select } from '@/components/ui/Field';
import ScrollableTable from '@/components/ui/ScrollableTable';
import { useToast } from '@/components/providers/ToastProvider';

// ── 유틸 ──────────────────────────────────────────────────────────────────────

type Period = { year: number; month: number };

function periodKey(p: Period) {
  return `${p.year}-${String(p.month).padStart(2, '0')}`;
}

function parsePeriodKey(key: string): Period {
  const [y, m] = key.split('-');
  return { year: Number(y), month: Number(m) };
}

/**
 * 발송 로그의 시각 표시.
 * 예전 구현은 toLocaleDateString 에 hour·minute 옵션을 넘겼는데, 날짜 전용 함수라
 * 시각이 나올지 말지가 엔진에 달려 있었다. 파싱 실패 시에는 원문을 그대로 보여준다 —
 * 발송 이력이라 값을 감추기보다 원본을 드러내는 편이 낫다.
 */
const fmtDate = (str: string) => formatDateTime(str, str);

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
      className="flex flex-wrap gap-1.5 min-h-10 w-full rounded-xl border border-border bg-surface-2 px-3 py-2 text-sm focus-within:ring-2 focus-within:ring-primary focus-within:border-primary cursor-text transition-shadow"
      onClick={() => inputRef.current?.focus()}
    >
      {value.map((email) => (
        <span
          key={email}
          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-badge-info-bg border border-badge-info-bdr text-badge-info-fg text-xs font-medium"
        >
          {email}
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onChange(value.filter((v) => v !== email)); }}
            className="opacity-70 hover:opacity-100 transition-opacity"
            aria-label={`${email} 삭제`}
          >
            <i className="bx bx-x text-sm" />
          </button>
        </span>
      ))}
      <input
        ref={inputRef}
        aria-label="수신자 이메일"
        value={raw}
        onChange={(e) => setRaw(e.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={() => commit(raw)}
        placeholder={value.length === 0 ? '이메일 입력 후 Enter 또는 쉼표' : ''}
        className="flex-1 min-w-32 bg-transparent outline-none text-sm text-fg placeholder:text-fg-subtle"
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

  // 레이블 옆에 배지가 붙는 자리라 헤더는 직접 그리고, 아래 컨트롤만 상황에 따라 바꾼다.
  const header = (
    <div className="flex items-center gap-2">
      <span className="text-xs font-semibold text-fg-muted">{label}</span>
      {badge}
    </div>
  );

  if (loading) {
    return (
      <div className="space-y-1.5">
        {header}
        <div className="h-10 rounded-xl border border-border bg-surface-2 animate-pulse" />
      </div>
    );
  }

  if (periods.length === 0) {
    return (
      <div className="space-y-1.5">
        {header}
        <div className="flex items-center gap-2 h-10 rounded-xl border border-dashed border-border bg-surface-2/40 px-3 text-xs text-fg-subtle">
          <i className="bx bx-data text-sm" />
          DB에 저장된 기간이 없습니다
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-1.5">
      {header}
      <Select
        label={label}
        srOnlyLabel
        value={selectedKey}
        onChange={(e) => onChange(parsePeriodKey(e.target.value))}
        className="cursor-pointer"
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
      </Select>
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
    <ScrollableTable hint="옆으로 밀어서 나머지 항목을 볼 수 있어요">
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
    </ScrollableTable>
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

// ── 메인 컴포넌트 ─────────────────────────────────────────────────────────────

export default function ReportEmailClient() {
  const queryClient = useQueryClient();

  const [currPeriod, setCurrPeriod] = useState<Period | null>(null);
  const [prevPeriod, setPrevPeriod] = useState<Period | null>(null);
  const [recipients, setRecipients] = useState<string[]>([]);
  const [subject, setSubject] = useState('');
  const { toast } = useToast();

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
      toast('success', data.message ?? '리포트 메일 발송이 시작되었습니다.');
      setTimeout(() => queryClient.invalidateQueries({ queryKey: queryKeys.reportLogs() }), 3000);
    },
    onError: (err: Error) => {
      toast('error', err.message);
    },
  });

  const handleSubmit = useCallback((e: React.FormEvent) => {
    e.preventDefault();
    if (!currPeriod || !prevPeriod) {
      toast('error', 'DB에 저장된 기간이 2개 이상 있어야 비교 발송이 가능합니다.');
      return;
    }
    if (recipients.length === 0) {
      toast('error', '수신자 이메일을 1개 이상 입력하세요.');
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
  }, [currPeriod, prevPeriod, recipients, subject, sendMutation, toast]);

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
        <div className="absolute inset-0 bg-[linear-gradient(to_bottom,transparent,var(--bg-veil))]" />
      </div>

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

              {/* 수신자 — 태그 입력은 여러 요소로 이뤄져 있어 Input 프리미티브를 쓸 수 없다 */}
              <div className="space-y-1.5">
                <span className="block text-xs font-semibold text-fg-muted">
                  수신자
                  <span className="text-badge-danger-fg ml-0.5" aria-hidden>*</span>
                </span>
                <EmailTagInput value={recipients} onChange={setRecipients} />
                <p className="text-xs text-fg-subtle">이메일을 입력하고 Enter 또는 쉼표로 추가합니다. 여러 명 등록 가능.</p>
              </div>

              {/* 제목 */}
              <Input
                label="메일 제목 (선택)"
                type="text"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder={defaultSubjectPreview}
                hint={`비우면 자동 생성: ${defaultSubjectPreview}`}
              />

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
            {/*
              예전에는 여기에 환경변수 이름(REPORT_CRON_HOUR 등)과 .env 예시를 그대로
              노출했다. 이 페이지는 로그인한 사용자 누구나 들어오는 화면이라 설치 문서를
              둘 자리가 아니다 — 설정 방법은 back/README.md에 있고, 여기서는 사용자가
              알아야 할 사실(언제 나가는지, 누가 받는지, 어디서 바꾸는지)만 남긴다.
            */}
            <SectionHeader
              step="03"
              title="자동 발송 스케줄"
              description="매월 정해진 날짜에 지난달 리포트가 자동으로 발송됩니다."
            />
            <div className="grid sm:grid-cols-3 gap-3">
              {[
                { icon: 'bx-calendar-event', title: '발송 시점', desc: '매월 1일 오전 9시' },
                { icon: 'bx-envelope', title: '자동 수신자', desc: '운영팀이 등록한 이메일 목록으로 발송됩니다' },
                { icon: 'bx-cog', title: '변경 · 중지', desc: '수신자와 발송 여부는 관리자에게 문의해 주세요' },
              ].map((item) => (
                <div key={item.title} className="rounded-xl border border-border-soft bg-surface-2 p-4 space-y-1.5">
                  <div className="flex items-center gap-2">
                    <i className={`bx ${item.icon} text-primary text-lg`} />
                    <span className="text-xs font-semibold text-fg">{item.title}</span>
                  </div>
                  <p className="text-xs text-fg-muted">{item.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>
      </div>
    </>
  );
}
