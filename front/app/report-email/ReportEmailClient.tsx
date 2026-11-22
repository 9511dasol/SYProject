'use client';

import { useCallback, useMemo, useRef, useState } from 'react'; // useRef는 EmailTagInput 내부에서 사용
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { formatDateTime } from '@/lib/format';
import { getPeriods } from '@/lib/marketingClient';
import { getReportLogs, previewReportMail, sendReportMail } from '@/lib/reportMailClient';
import type { PreviewReportResponse, ReportLog } from '@/lib/reportMailClient';
import { queryKeys } from '@/lib/queryKeys';
import { Input, Select } from '@/components/ui/Field';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import Modal from '@/components/ui/Modal';
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
        {/* 고른 값이 없을 때 빈 항목을 하나 둔다. 없으면 브라우저가 첫 옵션을
            선택된 것처럼 보여줘서, 실제로는 비어 있는데 고른 것처럼 읽힌다
            (가장 오래된 달을 당월로 고르면 전월이 비는 경우). */}
        {value === null && <option value="">선택하세요</option>}
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
      <div className="rounded-xl border border-dashed border-border bg-surface-2/50 py-12 flex flex-col items-center gap-3 text-center">
        <span className="w-12 h-12 rounded-full bg-surface-2 flex items-center justify-center">
          <i className="bx bx-mail-send text-2xl text-fg-disabled" />
        </span>
        <div>
          <p className="text-sm font-medium text-fg-muted">아직 발송 이력이 없습니다</p>
          <p className="text-xs text-fg-subtle mt-1">리포트 발송 후 이곳에 이력이 표시됩니다.</p>
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
                <span className="text-fg-subtle mx-1.5">vs</span>
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
        <h2 className="text-lg font-semibold text-fg tracking-tight">{title}</h2>
        <p className="text-sm text-fg-muted mt-0.5 leading-relaxed">{description}</p>
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

  // 발송 전 미리보기 — 검토되지 않은 AI 코멘트가 외부 수신자에게 바로 나가지 않게,
  // 실제로 나갈 메일과 같은 HTML 을 먼저 보여준다. 여기서 생성된 코멘트는 서버
  // 캐시에 저장되어 뒤이은 발송이 재사용한다(비용이 두 번 들지 않는다).
  const [preview, setPreview] = useState<PreviewReportResponse | null>(null);

  /** 미리보기를 건너뛴 직접 발송의 확인 단계 */
  const [confirmSend, setConfirmSend] = useState(false);

  // DB 저장 기간 목록 (최신순 정렬)
  const { data: periods = [], isLoading: periodsLoading } = useQuery({
    queryKey: queryKeys.periods(),
    queryFn: getPeriods,
    staleTime: 60_000,
  });

  // 초기 선택: 첫 번째(최신) = 당월, 두 번째 = 전월.
  //
  // 예전에는 useQuery 의 select 안에서 setState 를 했다. select 는 순수 변환 함수로
  // 가정돼 렌더 경로에서 (때로는 여러 번) 호출되므로, 그 안에서 상태를 바꾸면
  // 호출 횟수에 동작이 끌려다닌다. "고른 값이 없으면 기본값" 을 렌더 중에 파생하면
  // 상태를 하나도 쓰지 않고 같은 결과가 나온다 — DbDashboard 가 쓰는 방식과 같다.
  const curr = currPeriod ?? periods[0] ?? null;
  const prev = prevPeriod ?? (currPeriod === null ? periods[1] ?? null : null);

  // 당월 변경 → 목록에서 다음 항목을 전월로 자동 선택
  const handleCurrChange = useCallback((p: Period) => {
    setCurrPeriod(p);
    const idx = periods.findIndex((d) => periodKey(d) === periodKey(p));
    setPrevPeriod(periods[idx + 1] ?? null);
    // 미리보기는 생성 시점의 기간으로 만든 HTML 이다 — 기간이 바뀌면 버린다.
    // 그대로 두면 "이대로 발송"이 미리본 것과 다른 기간을 보내게 된다.
    setPreview(null);
  }, [periods]);

  const handlePrevChange = useCallback((p: Period) => {
    setPrevPeriod(p);
    setPreview(null);
  }, []);

  // 발송 이력
  const { data: logs = [], isFetching: logsFetching } = useQuery({
    queryKey: queryKeys.reportLogs(),
    queryFn: () => getReportLogs(30),
    refetchInterval: 10_000,
  });

  const previewMutation = useMutation({
    mutationFn: previewReportMail,
    onSuccess: setPreview,
    onError: (err: Error) => toast('error', err.message),
  });

  // 발송 mutation
  const sendMutation = useMutation({
    mutationFn: sendReportMail,
    onSuccess: (data) => {
      setPreview(null);
      setConfirmSend(false);
      toast('success', data.message ?? '리포트 메일 발송이 시작되었습니다.');
      setTimeout(() => queryClient.invalidateQueries({ queryKey: queryKeys.reportLogs() }), 3000);
    },
    onError: (err: Error) => {
      toast('error', err.message);
    },
  });

  const handlePreview = useCallback(() => {
    if (!curr || !prev) {
      toast('error', 'DB에 저장된 기간이 2개 이상 있어야 비교 발송이 가능합니다.');
      return;
    }
    previewMutation.mutate({
      curr_year: curr.year,
      curr_month: curr.month,
      prev_year: prev.year,
      prev_month: prev.month,
      subject: subject.trim(),
    });
  }, [curr, prev, subject, previewMutation, toast]);

  const runSend = useCallback(() => {
    if (!curr || !prev || recipients.length === 0) {
      toast('error', '수신자 이메일을 1개 이상 입력하세요.');
      return;
    }
    sendMutation.mutate({
      curr_year: curr.year,
      curr_month: curr.month,
      prev_year: prev.year,
      prev_month: prev.month,
      recipients,
      subject: subject.trim(),
    });
  }, [curr, prev, recipients, subject, sendMutation, toast]);

  // 미리보기를 거치지 않은 발송 — 검토되지 않은 AI 코멘트가 외부 수신자에게
  // 그대로 나가는 경로라 확인을 한 번 받는다. 보낸 메일은 회수할 수 없다.
  const handleSubmit = useCallback((e: React.FormEvent) => {
    e.preventDefault();
    if (!curr || !prev) {
      toast('error', 'DB에 저장된 기간이 2개 이상 있어야 비교 발송이 가능합니다.');
      return;
    }
    if (recipients.length === 0) {
      toast('error', '수신자 이메일을 1개 이상 입력하세요.');
      return;
    }
    setConfirmSend(true);
  }, [curr, prev, recipients, toast]);

  const defaultSubjectPreview = useMemo(
    () => curr
      ? `[마케팅 리포트] ${curr.year}년 ${curr.month}월 성과 요약`
      : '[마케팅 리포트] 성과 요약',
    [curr],
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
          <h1 className="text-2xl sm:text-3xl font-bold text-fg tracking-tight mb-2">
            코멘트 & 리포트 메일
          </h1>
          <p className="text-sm text-fg-muted leading-relaxed max-w-xl">
            DB에 저장된 광고 데이터를 기간 비교 분석하고, AI가 자동으로 코멘트를 작성해 이메일로 발송합니다.
          </p>
        </div>

        {/* 리포트 발송 폼 */}
        <section>
          <div className="rounded-2xl border border-border bg-surface shadow-card p-5 sm:p-7">
            <SectionHeader
              step="01"
              title="리포트 발송"
              description="비교할 기간을 선택하고 미리보기로 AI 코멘트와 본문을 확인한 뒤 발송하세요. 미리보기에서 만든 코멘트는 발송 시 그대로 재사용됩니다."
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
                  value={curr}
                  onChange={handleCurrChange}
                  periods={periods}
                  loading={periodsLoading}
                  excludeKey={prev ? periodKey(prev) : undefined}
                />
                <PeriodSelect
                  label="전월 (비교 대상)"
                  badge={
                    <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-fg-muted bg-surface-2 border border-border px-1.5 py-0.5 rounded-md">
                      <i className="bx bx-history text-xs" /> 이전 기간
                    </span>
                  }
                  value={prev}
                  onChange={handlePrevChange}
                  periods={periods}
                  loading={periodsLoading}
                  excludeKey={curr ? periodKey(curr) : undefined}
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

              {/* 미리보기 · 발송 버튼 */}
              <div className="flex items-center justify-between gap-4 pt-1 flex-wrap">
                <div className="flex items-center gap-2 text-xs">
                  {/* 수신자가 비면 발송 버튼이 회색으로 잠긴다 — 왜 잠겼는지 버튼 옆에서 말해 준다 */}
                  {recipients.length === 0 ? (
                    <>
                      <i className="bx bx-info-circle text-sm text-badge-amber-fg" />
                      <span className="text-badge-amber-fg">
                        발송하려면 수신자를 1명 이상 입력하세요
                      </span>
                    </>
                  ) : (
                    <>
                      <i className="bx bx-time-five text-sm text-fg-subtle" />
                      <span className="text-fg-subtle">
                        미리보기에서 AI 코멘트를 확인한 뒤 발송하는 것을 권합니다 (생성 30초~2분)
                      </span>
                    </>
                  )}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={handlePreview}
                    disabled={previewMutation.isPending || sendMutation.isPending}
                    className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold border border-border bg-surface text-fg hover:bg-surface-2 active:scale-[0.98] transition-all disabled:opacity-50 disabled:pointer-events-none"
                  >
                    {previewMutation.isPending ? (
                      <>
                        <span className="w-4 h-4 rounded-full border-2 border-border border-t-blue-500 animate-spin" />
                        생성 중…
                      </>
                    ) : (
                      <>
                        <i className="bx bx-show text-base" />
                        미리보기
                      </>
                    )}
                  </button>
                  <button
                    type="submit"
                    disabled={sendMutation.isPending || recipients.length === 0}
                    className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold bg-blue-600 text-white hover:bg-blue-700 active:scale-[0.98] transition-all disabled:opacity-50 disabled:pointer-events-none shadow-sm shadow-blue-600/20"
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
              </div>
            </form>
          </div>
        </section>

        {/* 발송 이력 */}
        <section>
          <div className="rounded-2xl border border-border bg-surface shadow-card p-5 sm:p-7">
            <div className="flex items-center justify-between mb-6">
              <SectionHeader
                step="02"
                title="발송 이력"
                description="최근 30건의 리포트 메일 발송 이력입니다. 10초마다 자동 갱신됩니다."
              />
              {logsFetching && (
                <span className="w-4 h-4 rounded-full border-2 border-border border-t-blue-500 animate-spin shrink-0 mt-0.5" aria-label="갱신 중" />
              )}
            </div>
            <LogTable logs={logs} />
          </div>
        </section>

        {/* 미리보기를 건너뛴 직접 발송 — 외부로 나가는 메일은 회수할 수 없다 */}
        <ConfirmDialog
          open={confirmSend}
          onClose={() => setConfirmSend(false)}
          onConfirm={runSend}
          busy={sendMutation.isPending}
          title="리포트 메일 발송"
          icon="bx-mail-send"
          tone="warn"
          confirmLabel="발송"
          message={
            <>
              수신자 <strong>{recipients.length}명</strong>에게{' '}
              {curr ? `${curr.year}년 ${curr.month}월` : ''} 리포트를 발송합니다.
            </>
          }
          detail={
            <>
              {recipients.join(', ')}
              <br />
              AI 코멘트를 아직 확인하지 않았습니다. 보낸 메일은 회수할 수 없습니다 — 취소하고
              미리보기로 먼저 확인할 수 있습니다.
            </>
          }
        />

        {/* 미리보기 모달 — 발송될 메일과 같은 HTML 을 확인하고 그 자리에서 발송한다 */}
        <Modal
          open={preview !== null}
          onClose={() => setPreview(null)}
          title={
            preview && (
              <>
                발송 미리보기
                <span className="text-xs font-normal text-fg-subtle">{preview.subject}</span>
              </>
            )
          }
          icon="bx-show"
          size="lg"
          busy={sendMutation.isPending}
          footer={
            <>
              <span className="mr-auto text-xs text-fg-subtle">
                {recipients.length > 0
                  ? `수신자 ${recipients.length}명에게 발송됩니다`
                  : '발송하려면 먼저 수신자를 입력하세요'}
              </span>
              <button
                type="button"
                onClick={() => setPreview(null)}
                disabled={sendMutation.isPending}
                className="px-4 py-2 rounded-xl text-sm font-semibold border border-border bg-surface text-fg hover:bg-surface-2 transition-colors disabled:opacity-50"
              >
                닫기
              </button>
              <button
                type="button"
                onClick={runSend}
                disabled={sendMutation.isPending || recipients.length === 0}
                className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold bg-blue-600 text-white hover:bg-blue-700 transition-colors disabled:opacity-50"
              >
                {sendMutation.isPending ? (
                  <>
                    <span className="w-4 h-4 rounded-full border-2 border-white/40 border-t-white animate-spin" />
                    발송 중…
                  </>
                ) : (
                  <>
                    <i className="bx bx-mail-send text-base" />
                    이대로 발송
                  </>
                )}
              </button>
            </>
          }
        >
          {preview && (
            // 메일 HTML 은 자체 스타일을 가진 완결 문서라 iframe 에 격리해 그대로 보여준다.
            // sandbox="" 로 스크립트 실행을 막는다 — 보는 용도만 필요하다.
            <iframe
              title="리포트 메일 미리보기"
              sandbox=""
              srcDoc={preview.html}
              className="w-full h-[55vh] rounded-lg border border-border bg-white"
            />
          )}
        </Modal>

        {/* 자동 발송 안내 */}
        <section>
          <div className="rounded-2xl border border-border bg-surface shadow-card p-5 sm:p-7">
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
