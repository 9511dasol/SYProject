'use client';

import { useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Button from '@/components/ui/Button';
import DataTable, { type Column } from '@/components/ui/DataTable';
import { Input, Select, Textarea } from '@/components/ui/Field';
import Modal from '@/components/ui/Modal';
import { useToast } from '@/components/providers/ToastProvider';
import { useFileDrop } from '@/hooks/useFileDrop';
import { formatCount, formatDate, formatDateTime } from '@/lib/format';
import { queryKeys } from '@/lib/queryKeys';
import { cx } from '@/lib/cx';
import {
  createRankWatches,
  deleteRankWatch,
  fetchRankAlerts,
  fetchRankHistory,
  fetchRankWatches,
  runRankAlerts,
  updateRankWatch,
  uploadRankReport,
} from '@/lib/rankMonitorClient';
import type {
  AlertSummary,
  RankWatch,
  SnapshotUploadResponse,
  WatchCreateResult,
  WatchDevice,
  WatchUpdatePayload,
} from '@/types/rankMonitor';
import RankTrendChart from './RankTrendChart';

const DEVICE_LABELS: Record<WatchDevice, string> = { all: '전체', pc: 'PC', mobile: '모바일' };

/** 중요도 색상 태그 — 백엔드 color_tag(String(10))에 그대로 저장되는 값 */
const COLOR_TAGS = [
  { value: '', label: '태그 없음', dot: '' },
  { value: 'red', label: '빨강 (핵심)', dot: 'bg-red-500' },
  { value: 'amber', label: '주황 (주요)', dot: 'bg-amber-500' },
  { value: 'emerald', label: '초록', dot: 'bg-emerald-500' },
  { value: 'blue', label: '파랑', dot: 'bg-blue-500' },
  { value: 'violet', label: '보라', dot: 'bg-violet-500' },
] as const;

function colorDotClass(tag: string | null): string | null {
  return COLOR_TAGS.find((c) => c.value === tag)?.dot || null;
}

/** 오늘 기준 days일 전 — 보고서 기본값은 어제(전일 확정치)다. UTC 가 아니라 로컬 날짜. */
function isoDaysAgo(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  const pad = (x: number) => String(x).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function rankText(rank: number | null): string {
  if (rank === null) return '노출 없음';
  return `${(Math.round(rank * 10) / 10).toLocaleString('ko-KR')}위`;
}

/** 알림 결과를 한 문장으로 — 보냈는지, 못 보냈다면 왜인지까지 같이 말한다 */
function alertSentence(alerts: AlertSummary): string | null {
  const total = alerts.drops + alerts.recoveries;
  if (total === 0) return null;
  const what = [
    alerts.drops > 0 ? `하락 ${alerts.drops}건` : null,
    alerts.recoveries > 0 ? `회복 ${alerts.recoveries}건` : null,
  ].filter(Boolean).join(' · ');
  return alerts.sent
    ? `${what} 알림을 보냈습니다.`
    : `${what}이 감지됐지만 보내지 못했습니다 — ${alerts.skipped_reason ?? '알 수 없는 사유'}`;
}

/** 목록의 상태 뱃지 — 백엔드 판정(is_breached·streak)을 번역만 한다 */
function StatusBadge({ watch }: { watch: RankWatch }) {
  if (watch.status === 'paused') {
    return <span className="badge badge-neutral whitespace-nowrap"><i className="bx bx-pause text-sm" />일시정지</span>;
  }
  if (!watch.latest) {
    return <span className="badge badge-neutral whitespace-nowrap"><i className="bx bx-time-five text-sm" />기록 없음</span>;
  }
  if (watch.is_breached) {
    return <span className="badge badge-danger whitespace-nowrap"><i className="bx bx-trending-down text-sm" />하락</span>;
  }
  if (watch.breach_streak > 0) {
    return <span className="badge badge-amber whitespace-nowrap"><i className="bx bx-error text-sm" />주의</span>;
  }
  if (watch.latest.avg_rank === null) {
    return <span className="badge badge-warn whitespace-nowrap"><i className="bx bx-low-vision text-sm" />노출 없음</span>;
  }
  return <span className="badge badge-success whitespace-nowrap"><i className="bx bx-check text-sm" />정상</span>;
}

/** 등록·수정 모달이 공유하는 감시 설정 입력값 — 숫자는 검증 전까지 문자열로 둔다 */
interface WatchSettingsForm {
  targetRank: string;
  tolerance: string;
  breachesRequired: string;
  cooldownHours: string;
  alertOnNoImpression: boolean;
  colorTag: string;
}

/** 등록 폼 — 공통 설정에 키워드·디바이스가 더해진다 */
interface RegisterForm extends WatchSettingsForm {
  keywords: string;
  device: WatchDevice;
}

const EMPTY_FORM: RegisterForm = {
  keywords: '',
  device: 'all',
  targetRank: '3',
  tolerance: '0.5',
  breachesRequired: '2',
  cooldownHours: '24',
  alertOnNoImpression: true,
  colorTag: '',
};

/** 설정 입력을 검증해 등록/PATCH 공용 형태로 바꾼다 — 등록·수정의 규칙이 갈라지지 않게 한 곳에 둔다. */
function parseWatchSettings(form: WatchSettingsForm):
  | { error: string; values?: undefined }
  | {
      error: null;
      values: {
        target_rank: number;
        tolerance: number;
        breaches_required: number;
        cooldown_hours: number;
        alert_on_no_impression: boolean;
        color_tag: string | null;
      };
    } {
  const targetRank = Number(form.targetRank);
  const tolerance = Number(form.tolerance);
  const breachesRequired = Number(form.breachesRequired);
  const cooldownHours = Number(form.cooldownHours);
  if (!Number.isFinite(targetRank) || targetRank < 1 || targetRank > 100) {
    return { error: '목표 순위는 1~100 사이 숫자여야 합니다.' };
  }
  if (!Number.isFinite(tolerance) || tolerance < 0 || tolerance > 20) {
    return { error: '허용 오차는 0~20 사이 숫자여야 합니다.' };
  }
  if (!Number.isInteger(breachesRequired) || breachesRequired < 1 || breachesRequired > 10) {
    return { error: '연속 이탈 기준은 1~10 사이 정수여야 합니다.' };
  }
  if (!Number.isInteger(cooldownHours) || cooldownHours < 1 || cooldownHours > 720) {
    return { error: '재알림 간격은 1~720 사이 정수(시간)여야 합니다.' };
  }
  return {
    error: null,
    values: {
      target_rank: targetRank,
      tolerance,
      breaches_required: breachesRequired,
      cooldown_hours: cooldownHours,
      alert_on_no_impression: form.alertOnNoImpression,
      color_tag: form.colorTag || null,
    },
  };
}

/** 등록·수정 모달이 공유하는 설정 필드 묶음. children 은 그리드 첫 칸에 들어간다(등록의 디바이스 선택). */
function WatchSettingsFields({
  form,
  onChange,
  children,
}: {
  form: WatchSettingsForm;
  onChange: (patch: Partial<WatchSettingsForm>) => void;
  children?: React.ReactNode;
}) {
  return (
    <div className="grid grid-cols-2 gap-3">
      {children}
      <Select
        label="중요도 색상"
        value={form.colorTag}
        onChange={(e) => onChange({ colorTag: e.target.value })}
      >
        {COLOR_TAGS.map((c) => (
          <option key={c.value} value={c.value}>{c.label}</option>
        ))}
      </Select>
      <Input
        label="목표 순위"
        type="number"
        min={1}
        max={100}
        value={form.targetRank}
        onChange={(e) => onChange({ targetRank: e.target.value })}
      />
      <Input
        label="허용 오차"
        type="number"
        min={0}
        max={20}
        step={0.5}
        value={form.tolerance}
        onChange={(e) => onChange({ tolerance: e.target.value })}
        hint="목표 3위·오차 0.5면 3.5위까지는 정상"
      />
      <Input
        label="연속 이탈 기준 (회)"
        type="number"
        min={1}
        max={10}
        value={form.breachesRequired}
        onChange={(e) => onChange({ breachesRequired: e.target.value })}
        hint="연속 몇 번의 기록이 이탈하면 알릴지 — 한 번 튄 값으로 '하락'이 되지 않게"
      />
      <Input
        label="재알림 간격 (시간)"
        type="number"
        min={1}
        max={720}
        value={form.cooldownHours}
        onChange={(e) => onChange({ cooldownHours: e.target.value })}
        hint="오르내림을 반복해도 이 시간 안에는 다시 알리지 않습니다"
      />
      <label className="flex items-center gap-2 pt-6 text-sm text-fg-muted cursor-pointer select-none">
        <input
          type="checkbox"
          checked={form.alertOnNoImpression}
          onChange={(e) => onChange({ alertOnNoImpression: e.target.checked })}
          className="w-4 h-4 rounded accent-blue-600"
        />
        노출 없음도 이탈로 본다
      </label>
    </div>
  );
}

export default function RankMonitorClient() {
  const queryClient = useQueryClient();
  const { toast: pushToast } = useToast();

  const [registerOpen, setRegisterOpen] = useState(false);
  const [form, setForm] = useState<RegisterForm>(EMPTY_FORM);
  const [formError, setFormError] = useState<string | null>(null);
  /** 일부 실패 시 모달에 남겨 보여주는 행별 결과 */
  const [createResults, setCreateResults] = useState<WatchCreateResult[] | null>(null);

  const [statDate, setStatDate] = useState(() => isoDaysAgo(1));
  const [uploadSummary, setUploadSummary] = useState<SnapshotUploadResponse | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 상세는 id 만 들고 목록에서 찾아 쓴다. 객체를 그대로 담아 두면 업로드·알림 평가로
  // 목록이 갱신돼도 열려 있는 모달은 옛 수치(연속 이탈·상태)를 계속 보여 준다.
  const [detailWatchId, setDetailWatchId] = useState<number | null>(null);
  const [pendingDelete, setPendingDelete] = useState<RankWatch | null>(null);

  // 수정 모달 — 삭제 후 재등록 없이 목표·알림 설정을 바꿀 수 있게 한다
  // (재등록은 쌓인 순위 이력을 전부 잃는다). 폼은 여는 시점의 값으로 채운다.
  const [editWatchId, setEditWatchId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState<WatchSettingsForm | null>(null);
  const [editError, setEditError] = useState<string | null>(null);

  /* ── 목록 ─────────────────────────────────────────────────────────────── */
  const watchesQuery = useQuery({
    queryKey: queryKeys.rankWatches(),
    queryFn: fetchRankWatches,
  });
  const watches = watchesQuery.data?.items ?? null;
  // 목록이 갱신되면 열려 있는 상세도 같이 최신이 된다. 삭제됐으면 null 이 되어 닫힌다.
  const detailWatch = watches?.find((w) => w.id === detailWatchId) ?? null;
  const editWatch = watches?.find((w) => w.id === editWatchId) ?? null;

  const invalidateAll = () =>
    queryClient.invalidateQueries({ queryKey: queryKeys.allRankWatches() });

  /** 등록 모달을 닫으며 입력과 에러를 비운다 — 다시 열었을 때 지난 흔적이 남지 않게. */
  const closeRegister = () => {
    setRegisterOpen(false);
    setForm(EMPTY_FORM);
    setFormError(null);
    setCreateResults(null);
  };

  /* ── 등록 ─────────────────────────────────────────────────────────────── */
  const create = useMutation({
    mutationFn: createRankWatches,
    onSuccess: (res) => {
      invalidateAll();
      const summary = [
        res.created > 0 ? `등록 ${res.created}건` : null,
        res.skipped > 0 ? `건너뜀 ${res.skipped}건` : null,
        res.errors > 0 ? `실패 ${res.errors}건` : null,
      ].filter(Boolean).join(' · ');

      if (res.skipped === 0 && res.errors === 0) {
        pushToast('success', `감시 키워드를 ${summary} 추가했습니다.`);
        closeRegister();
        return;
      }
      // 수백 건을 올리는 사용자에게는 "몇 번째가 왜 안 됐는지"가 필요하다 —
      // 모달을 닫지 않고 행별 사유를 그대로 보여준다.
      pushToast(res.created > 0 ? 'success' : 'error', summary);
      const failed = res.results.filter((r) => r.status !== 'created');
      setCreateResults(failed);
      // 등록된 키워드는 입력칸에서 빼 준다. 그대로 두면 "다시 등록"을 눌러도
      // 이미 등록된 것들이 또 건너뛰기로 돌아와 모달이 영영 닫히지 않는다.
      setForm((f) => ({ ...f, keywords: failed.map((r) => r.keyword).join('\n') }));
    },
    onError: (err) => {
      // 지난 시도의 실패 목록이 이번 실패의 결과처럼 보이면 안 된다.
      setCreateResults(null);
      pushToast('error', err.message);
    },
  });

  const handleRegister = () => {
    const keywords = [...new Set(
      form.keywords.split('\n').map((k) => k.trim()).filter(Boolean),
    )];
    if (keywords.length === 0) {
      setFormError('감시할 키워드를 한 줄에 하나씩 입력해 주세요.');
      return;
    }
    const parsed = parseWatchSettings(form);
    if (parsed.error !== null) {
      setFormError(parsed.error);
      return;
    }
    setFormError(null);
    create.mutate(
      keywords.map((keyword) => ({ keyword, device: form.device, ...parsed.values })),
    );
  };

  /* ── 설정 수정 ────────────────────────────────────────────────────────── */
  const openEdit = (w: RankWatch) => {
    setEditWatchId(w.id);
    setEditForm({
      targetRank: String(w.target_rank),
      tolerance: String(w.tolerance),
      breachesRequired: String(w.breaches_required),
      cooldownHours: String(w.cooldown_hours),
      alertOnNoImpression: w.alert_on_no_impression,
      colorTag: w.color_tag ?? '',
    });
    setEditError(null);
  };

  const closeEdit = () => {
    setEditWatchId(null);
    setEditForm(null);
    setEditError(null);
  };

  const update = useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: WatchUpdatePayload }) =>
      updateRankWatch(id, payload),
    onSuccess: () => {
      invalidateAll();
      pushToast('success', '감시 설정을 수정했습니다.');
      closeEdit();
    },
    onError: (err) => pushToast('error', err.message),
  });

  const handleEditSave = () => {
    if (editWatchId === null || !editForm) return;
    const parsed = parseWatchSettings(editForm);
    if (parsed.error !== null) {
      setEditError(parsed.error);
      return;
    }
    setEditError(null);
    update.mutate({ id: editWatchId, payload: parsed.values });
  };

  /* ── 보고서 업로드 ────────────────────────────────────────────────────── */
  const upload = useMutation({
    mutationFn: ({ file, date }: { file: File; date: string }) => uploadRankReport(file, date),
    // 새 업로드를 시작하면 이전 결과를 지운다 — 남겨 두면 이번 업로드가 실패했을 때
    // 지난번 성공 요약이 그대로 보여 방금 올린 파일의 결과로 읽힌다.
    onMutate: () => setUploadSummary(null),
    onSuccess: (res) => {
      invalidateAll();
      setUploadSummary(res);
      pushToast(
        'success',
        `${res.stat_date} 순위를 적재했습니다 — 매칭 ${res.matched_watches}건 (신규 ${res.inserted} · 갱신 ${res.updated})`,
      );
      // 알림은 별도 토스트로 — 적재 성공과 알림 발송은 다른 사건이고,
      // 보내지 못한 경우에는 사유를 읽게 해야 한다.
      const sentence = alertSentence(res.alerts);
      if (sentence) pushToast(res.alerts.sent ? 'success' : 'error', sentence);
    },
    onError: (err) => pushToast('error', err.message),
  });

  /* ── 알림 수동 평가 ───────────────────────────────────────────────────── */
  const runAlerts = useMutation({
    mutationFn: runRankAlerts,
    onSuccess: (res) => {
      invalidateAll();
      const sentence = alertSentence(res);
      if (!sentence) {
        pushToast('success', '지금은 알릴 하락·회복이 없습니다.');
        return;
      }
      pushToast(res.sent ? 'success' : 'error', sentence);
    },
    onError: (err) => pushToast('error', err.message),
  });

  const handleFiles = (files: File[]) => {
    if (!files.length) return;
    if (upload.isPending) {
      // 조용히 무시하면 "왜 안 되지"가 된다 — 진행 중이라는 걸 말해 준다.
      pushToast('error', '앞선 보고서를 적재하는 중입니다. 끝난 뒤에 올려 주세요.');
      return;
    }
    if (!statDate) {
      pushToast('error', '보고서 기준 날짜를 먼저 선택해 주세요.');
      return;
    }
    upload.mutate({ file: files[0], date: statDate });
  };

  // 적재 중에도 드롭 자체는 받는다 — 훅에서 막아 버리면 아무 반응이 없어
  // 왜 안 되는지 알 수 없다. 진행 중이라는 안내는 handleFiles 가 한다.
  const { isDragging, handlers } = useFileDrop(handleFiles);

  /* ── 일시정지 · 재개 ──────────────────────────────────────────────────── */
  const togglePause = useMutation({
    mutationFn: (watch: RankWatch) =>
      updateRankWatch(watch.id, { status: watch.status === 'paused' ? 'active' : 'paused' }),
    onSuccess: (_, watch) => {
      invalidateAll();
      pushToast('success', watch.status === 'paused' ? '감시를 재개했습니다.' : '감시를 일시정지했습니다.');
    },
    onError: (err) => pushToast('error', err.message),
  });

  /* ── 삭제 ─────────────────────────────────────────────────────────────── */
  const remove = useMutation({
    mutationFn: (watch: RankWatch) => deleteRankWatch(watch.id),
    onSuccess: (_, watch) => {
      invalidateAll();
      setPendingDelete(null);
      if (detailWatchId === watch.id) setDetailWatchId(null);
      pushToast('success', `'${watch.keyword}' 감시를 삭제했습니다.`);
    },
    onError: (err) => pushToast('error', err.message),
  });

  /* ── 상세 이력 ────────────────────────────────────────────────────────── */
  const historyQuery = useQuery({
    queryKey: queryKeys.rankWatchHistory(detailWatchId ?? 0),
    queryFn: () => fetchRankHistory(detailWatchId as number),
    enabled: detailWatchId !== null,
  });

  const alertsQuery = useQuery({
    queryKey: queryKeys.rankWatchAlerts(detailWatchId ?? 0),
    queryFn: () => fetchRankAlerts(detailWatchId as number),
    enabled: detailWatchId !== null,
  });

  /* ── 표 컬럼 ──────────────────────────────────────────────────────────── */
  const columns: Column<RankWatch>[] = [
    {
      header: '키워드',
      primary: true,
      className: 'whitespace-nowrap',
      cell: (w) => {
        const dot = colorDotClass(w.color_tag);
        return (
          <button
            type="button"
            onClick={() => setDetailWatchId(w.id)}
            className="inline-flex items-center gap-2 font-medium text-fg hover:text-primary"
            title="순위 추이 보기"
          >
            {dot && <span aria-hidden className={cx('w-2 h-2 rounded-full shrink-0', dot)} />}
            {w.keyword}
            <span className="text-[10px] font-normal text-fg-subtle">{DEVICE_LABELS[w.device]}</span>
          </button>
        );
      },
    },
    {
      header: '현재 순위',
      className: 'whitespace-nowrap tabular-nums',
      cell: (w) =>
        w.latest ? (
          <>
            <span className={w.latest.avg_rank === null ? 'text-fg-subtle' : 'font-semibold text-fg'}>
              {rankText(w.latest.avg_rank)}
            </span>
            <span className="ml-1.5 text-xs text-fg-subtle">{formatDate(w.latest.stat_date)}</span>
          </>
        ) : (
          <span className="text-fg-subtle">-</span>
        ),
    },
    {
      header: '목표',
      className: 'whitespace-nowrap tabular-nums',
      cell: (w) => (
        <>
          {w.target_rank}위
          {w.tolerance > 0 && <span className="text-xs text-fg-subtle"> (±{w.tolerance})</span>}
        </>
      ),
    },
    {
      header: '상태',
      primary: true,
      cell: (w) => <StatusBadge watch={w} />,
    },
    {
      header: '연속 이탈',
      className: 'whitespace-nowrap tabular-nums',
      hideOnMobile: true,
      cell: (w) => (
        <span className={w.breach_streak > 0 ? 'font-semibold text-badge-danger-fg' : 'text-fg-subtle'}>
          {w.breach_streak} / {w.breaches_required}회
        </span>
      ),
    },
    {
      header: '작업',
      align: 'right',
      cell: (w) => (
        <span className="inline-flex items-center gap-1">
          <Button
            variant="outline"
            size="sm"
            onClick={() => openEdit(w)}
            title="목표 순위·알림 설정 수정 (이력은 유지됩니다)"
          >
            <i className="bx bx-edit-alt text-sm" />
            수정
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => togglePause.mutate(w)}
            disabled={togglePause.isPending}
            title={w.status === 'paused' ? '감시 재개' : '감시 일시정지'}
          >
            <i className={`bx ${w.status === 'paused' ? 'bx-play' : 'bx-pause'} text-sm`} />
            {w.status === 'paused' ? '재개' : '정지'}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            tone="danger"
            onClick={() => setPendingDelete(w)}
            title="감시 삭제"
          >
            <i className="bx bx-trash text-sm" />
            삭제
          </Button>
        </span>
      ),
    },
  ];

  /* ── 렌더 ─────────────────────────────────────────────────────────────── */
  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-6">
      <header className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-bold text-fg">키워드 순위 모니터링</h1>
          <p className="mt-1 text-sm text-fg-subtle">
            감시할 키워드를 등록하고 광고시스템의 키워드 보고서를 올리면, 날짜별 평균 노출 순위가
            쌓이고 목표 이탈이 연속되면 표시됩니다.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="md"
            onClick={() => runAlerts.mutate()}
            isLoading={runAlerts.isPending}
            title="지금 상태로 하락·회복 알림을 평가해 보냅니다"
          >
            {!runAlerts.isPending && <i className="bx bx-bell text-base" />}
            지금 알림 평가
          </Button>
          <Button size="md" onClick={() => setRegisterOpen(true)}>
            <i className="bx bx-plus text-base" />
            감시 키워드 등록
          </Button>
        </div>
      </header>

      {/* ── 보고서 업로드 ──────────────────────────────────────────────── */}
      <section
        aria-label="키워드 보고서 업로드"
        className="rounded-2xl border border-border bg-surface p-4 sm:p-5 space-y-4"
      >
        <div className="flex items-end gap-3 flex-wrap">
          <div className="w-44">
            <Input
              label="보고서 기준 날짜"
              type="date"
              value={statDate}
              max={isoDaysAgo(0)}
              onChange={(e) => setStatDate(e.target.value)}
              hint="보통 어제 — 보고서가 집계된 날짜"
            />
          </div>
          <div className="flex-1 min-w-60">
            <div
              {...handlers}
              className={cx(
                'rounded-xl border-2 border-dashed px-4 py-5 text-center transition-colors',
                isDragging ? 'border-primary bg-primary-soft' : 'border-border bg-surface-2/50',
                upload.isPending && 'opacity-60',
              )}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,.tsv,.txt,.xlsx,.xlsm"
                className="sr-only"
                onChange={(e) => {
                  handleFiles(Array.from(e.target.files ?? []));
                  e.target.value = ''; // 같은 파일을 다시 선택해도 change 가 울리게
                }}
              />
              <p className="text-sm text-fg-muted">
                키워드 보고서(CSV·Excel)를 끌어다 놓거나{' '}
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={upload.isPending}
                  className="font-semibold text-primary hover:underline disabled:opacity-50"
                >
                  파일 선택
                </button>
              </p>
              <p className="mt-1 text-xs text-fg-subtle">
                {upload.isPending
                  ? '적재 중…'
                  : "'키워드'와 '평균노출순위' 컬럼이 있으면 포맷은 자동으로 알아봅니다. 같은 날짜를 다시 올리면 갱신됩니다."}
              </p>
            </div>
          </div>
        </div>

        {uploadSummary && (
          <div className="rounded-xl bg-surface-2/60 border border-border-soft px-4 py-3 text-xs space-y-1.5">
            <p className="text-fg-muted">
              <span className="font-semibold text-fg">{uploadSummary.stat_date}</span> 적재 결과 —
              매칭 {uploadSummary.matched_watches}건 · 신규 {uploadSummary.inserted}건 · 갱신{' '}
              {uploadSummary.updated}건
            </p>
            {uploadSummary.watches_no_data.length > 0 && (
              <p className="text-badge-amber-fg">
                보고서에 없던 감시 키워드: {uploadSummary.watches_no_data.join(', ')}
              </p>
            )}
            {uploadSummary.unmatched_keywords.length > 0 && (
              <p className="text-fg-subtle">
                감시 미등록 키워드 {uploadSummary.unmatched_keywords.length}개 —{' '}
                {uploadSummary.unmatched_keywords.slice(0, 8).join(', ')}
                {uploadSummary.unmatched_keywords.length > 8 && ' 외'}
              </p>
            )}
            {alertSentence(uploadSummary.alerts) && (
              <p className={uploadSummary.alerts.sent ? 'text-badge-success-fg' : 'text-badge-danger-fg'}>
                {alertSentence(uploadSummary.alerts)}
              </p>
            )}
          </div>
        )}
      </section>

      {/* ── 목록 ───────────────────────────────────────────────────────── */}
      {watchesQuery.error ? (
        <div className="flex items-start gap-3 rounded-xl bg-badge-danger-bg border border-badge-danger-bdr px-4 py-3">
          <i className="bx bx-error-circle text-badge-danger-fg shrink-0 mt-0.5" />
          <p className="text-sm text-badge-danger-fg">{watchesQuery.error.message}</p>
        </div>
      ) : (
        <DataTable
          rows={watches}
          rowKey={(w) => w.id}
          columns={columns}
          minWidth="min-w-150"
          empty={{
            icon: 'bx-trending-up',
            title: '감시 중인 키워드가 없습니다',
            description: '감시 키워드를 등록하고 키워드 보고서를 올리면 순위 추적이 시작됩니다.',
          }}
        />
      )}

      {/* ── 등록 모달 ──────────────────────────────────────────────────── */}
      <Modal
        open={registerOpen}
        onClose={closeRegister}
        title="감시 키워드 등록"
        icon="bx-plus-circle"
        busy={create.isPending}
        footer={
          <>
            <Button variant="outline" size="md" onClick={closeRegister} disabled={create.isPending}>
              닫기
            </Button>
            <Button size="md" onClick={handleRegister} isLoading={create.isPending}>
              등록
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Textarea
            label="키워드"
            required
            rows={4}
            placeholder={'마케팅자동화\n리포트자동화'}
            value={form.keywords}
            onChange={(e) => setForm((f) => ({ ...f, keywords: e.target.value }))}
            hint="한 줄에 하나씩 — 여러 개를 한 번에 등록할 수 있습니다. 아래 설정은 모든 키워드에 같이 적용됩니다."
          />

          <WatchSettingsFields
            form={form}
            onChange={(patch) => setForm((f) => ({ ...f, ...patch }))}
          >
            <Select
              label="디바이스"
              value={form.device}
              onChange={(e) => setForm((f) => ({ ...f, device: e.target.value as WatchDevice }))}
            >
              <option value="all">전체</option>
              <option value="pc">PC</option>
              <option value="mobile">모바일</option>
            </Select>
          </WatchSettingsFields>

          {formError && (
            <p role="alert" className="text-xs text-badge-danger-fg">{formError}</p>
          )}

          {createResults && createResults.length > 0 && (
            <div className="rounded-xl bg-surface-2/60 border border-border-soft px-4 py-3">
              <p className="text-xs font-semibold text-fg-muted mb-1.5">등록되지 않은 키워드</p>
              <ul className="space-y-1 text-xs text-fg-subtle max-h-32 overflow-y-auto">
                {createResults.map((r) => (
                  <li key={`${r.keyword}-${r.device}`}>
                    <span className="font-medium text-fg-muted">{r.keyword}</span> — {r.reason ?? '알 수 없는 사유'}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </Modal>

      {/* ── 설정 수정 모달 ─────────────────────────────────────────────── */}
      <Modal
        open={editWatch !== null && editForm !== null}
        onClose={closeEdit}
        title={
          editWatch && (
            <>
              {editWatch.keyword}
              <span className="text-xs font-normal text-fg-subtle">
                {DEVICE_LABELS[editWatch.device]} · 설정 수정
              </span>
            </>
          )
        }
        icon="bx-edit-alt"
        busy={update.isPending}
        footer={
          <>
            <Button variant="outline" size="md" onClick={closeEdit} disabled={update.isPending}>
              취소
            </Button>
            <Button size="md" onClick={handleEditSave} isLoading={update.isPending}>
              저장
            </Button>
          </>
        }
      >
        {editForm && (
          <div className="space-y-4">
            <WatchSettingsFields
              form={editForm}
              onChange={(patch) => setEditForm((f) => (f ? { ...f, ...patch } : f))}
            />
            <p className="text-xs text-fg-subtle">
              판정 기준(목표 순위·허용 오차·연속 이탈)을 바꾸면 연속 이탈 횟수가 새 기준으로
              즉시 다시 계산됩니다. 쌓인 순위 이력은 그대로 유지됩니다.
            </p>
            {editError && (
              <p role="alert" className="text-xs text-badge-danger-fg">{editError}</p>
            )}
          </div>
        )}
      </Modal>

      {/* ── 상세(순위 추이) 모달 ────────────────────────────────────────── */}
      <Modal
        open={detailWatch !== null}
        onClose={() => setDetailWatchId(null)}
        title={
          detailWatch && (
            <>
              {detailWatch.keyword}
              <span className="text-xs font-normal text-fg-subtle">
                {DEVICE_LABELS[detailWatch.device]} · 목표 {detailWatch.target_rank}위
              </span>
            </>
          )
        }
        icon="bx-trending-up"
        size="lg"
      >
        {detailWatch && (
          <div className="space-y-4">
            {historyQuery.error ? (
              <p className="py-10 text-center text-sm text-badge-danger-fg">
                {historyQuery.error.message}
              </p>
            ) : !historyQuery.data ? (
              <p className="py-10 text-center text-sm text-fg-subtle">이력을 불러오는 중…</p>
            ) : (
              <>
                <RankTrendChart
                  points={historyQuery.data.items}
                  targetRank={detailWatch.target_rank}
                />
                <div className="flex items-center justify-between text-xs text-fg-subtle">
                  <span>
                    기록 {formatCount(historyQuery.data.items.length)}건
                    {detailWatch.latest &&
                      ` · 최근 ${formatDate(detailWatch.latest.stat_date)} ${rankText(detailWatch.latest.avg_rank)}`}
                  </span>
                  <StatusBadge watch={detailWatch} />
                </div>
              </>
            )}

            {/* 알림 이력 — 이 키워드로 언제 무엇이 나갔는지 */}
            <div className="border-t border-border-soft pt-4">
              <h3 className="text-sm font-medium text-fg-muted mb-2">알림 이력</h3>
              {alertsQuery.error ? (
                <p className="text-xs text-badge-danger-fg">{alertsQuery.error.message}</p>
              ) : !alertsQuery.data ? (
                <p className="text-xs text-fg-subtle">불러오는 중…</p>
              ) : alertsQuery.data.items.length === 0 ? (
                <p className="text-xs text-fg-subtle">
                  아직 발송된 알림이 없습니다. 연속 이탈이 {detailWatch.breaches_required}회에
                  도달하면 알림이 나갑니다.
                </p>
              ) : (
                <ul className="space-y-2">
                  {alertsQuery.data.items.map((alert) => (
                    <li key={alert.id} className="flex items-start gap-2.5 text-xs">
                      <span
                        aria-hidden
                        className={cx(
                          'mt-1 w-1.5 h-1.5 rounded-full shrink-0',
                          alert.alert_type === 'drop' ? 'bg-red-500' : 'bg-emerald-500',
                        )}
                      />
                      <div className="min-w-0">
                        <p className="text-fg-muted">
                          <span className="font-semibold text-fg">
                            {alert.alert_type === 'drop' ? '하락' : '회복'}
                          </span>
                          {' · '}
                          {rankText(alert.prev_rank)} → {rankText(alert.curr_rank)}
                          {alert.status === 'error' && (
                            <span className="ml-1.5 text-badge-danger-fg">발송 실패</span>
                          )}
                        </p>
                        <p className="text-fg-subtle">
                          {formatDateTime(alert.created_at)}
                          {alert.recipients && ` · ${alert.recipients}`}
                        </p>
                        {alert.error_msg && (
                          <p className="text-badge-danger-fg truncate" title={alert.error_msg}>
                            {alert.error_msg}
                          </p>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}
      </Modal>

      {/* ── 삭제 확인 ──────────────────────────────────────────────────── */}
      <Modal
        open={pendingDelete !== null}
        onClose={() => setPendingDelete(null)}
        title="감시 삭제"
        icon="bx-trash"
        busy={remove.isPending}
        footer={
          <>
            <Button variant="outline" size="md" onClick={() => setPendingDelete(null)} disabled={remove.isPending}>
              취소
            </Button>
            <Button
              size="md"
              tone="danger"
              onClick={() => pendingDelete && remove.mutate(pendingDelete)}
              isLoading={remove.isPending}
            >
              삭제
            </Button>
          </>
        }
      >
        {pendingDelete && (
          <p className="text-sm text-fg-muted">
            <span className="font-semibold text-fg">{pendingDelete.keyword}</span> 감시와 쌓인 순위
            이력을 모두 삭제합니다. 되돌릴 수 없습니다.
          </p>
        )}
      </Modal>
    </div>
  );
}
