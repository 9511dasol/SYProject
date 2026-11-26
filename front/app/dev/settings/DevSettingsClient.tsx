'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchJson, sendJson } from '@/lib/api/authFetch';
import { queryKeys } from '@/lib/queryKeys';
import Alert from '@/components/ui/Alert';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import Spinner from '@/components/ui/Spinner';
import { useToast } from '@/components/providers/ToastProvider';
import type { AIStatus } from '@/types/aiStatus';
import type { FeatureFlagItem } from '@/types/featureFlags';

export default function DevSettingsClient() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  // 끄기만 확인을 받는다 — 토글 한 번이 전 사용자에게 점검 안내를 띄운다.
  // 다시 켜는 건 되돌리는 쪽이라 바로 보낸다.
  const [pendingOff, setPendingOff] = useState<FeatureFlagItem | null>(null);

  const flagsQuery = useQuery({
    queryKey: queryKeys.adminSettings(),
    queryFn: () => fetchJson<FeatureFlagItem[]>('/api/admin/settings', undefined, '설정 조회 실패'),
  });

  const aiStatusQuery = useQuery({
    queryKey: queryKeys.adminAiStatus(),
    queryFn: () =>
      fetchJson<AIStatus>('/api/admin/ai-status', undefined, 'AI 프로바이더 현황 조회 실패'),
  });

  const toggle = useMutation({
    mutationFn: ({ key, value }: { key: string; value: boolean }) =>
      sendJson<FeatureFlagItem>(`/api/admin/settings/${key}`, 'PATCH', { value }, '설정 변경 실패'),
    onSuccess: (updated) => {
      setPendingOff(null);
      queryClient.setQueryData<FeatureFlagItem[]>(queryKeys.adminSettings(), (prev) =>
        prev?.map((f) => (f.key === updated.key ? updated : f)),
      );
      /*
        플래그를 끄면 사용자 화면의 FeatureGate 도 즉시 반응해야 한다. 예전에는 앱의
        플래그가 zustand 스토어에 따로 담겨 있어서 이걸 갱신할 경로가 아예 없었고,
        관리자가 토글해도 새로고침 전까지는 화면이 예전 상태로 남았다.
      */
      queryClient.invalidateQueries({ queryKey: queryKeys.featureFlags() });
      toast(
        'success',
        `${updated.description}을(를) ${updated.value ? '켰습니다' : '껐습니다'}.`,
      );
    },
    // 실패를 페이지 맨 위 배너로만 알리면, 저 아래 토글을 누른 사용자는 아무 일도
    // 일어나지 않은 것처럼 느낀다 — 토스트로 손이 있는 자리 가까이에서 알린다.
    onError: (err) => {
      setPendingOff(null);
      toast('error', err.message);
    },
  });

  const flags = flagsQuery.data ?? null;
  const aiStatus = aiStatusQuery.data ?? null;
  const error = flagsQuery.error;
  const aiStatusError = aiStatusQuery.error;
  const togglingKey = toggle.isPending ? toggle.variables?.key : null;

  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-6">
      <div>
        <h1 className="text-xl font-bold text-fg">기능 플래그 관리</h1>
        <p className="mt-1 text-sm text-fg-subtle">
          전 기업에 적용되는 전역 설정입니다. AI 프로바이더 현황을 확인하고, 기능을 켜고 끌 수 있습니다.
        </p>
      </div>

      {/* AI 프로바이더 현황 */}
      <section className="space-y-3">
        <div>
          <h2 className="text-sm font-semibold text-fg">AI 프로바이더 현황</h2>
          <p className="mt-1 text-xs text-fg-subtle">
            리포트 코멘트 생성에 사용되는 LLM_PROVIDER와 API 키 설정 여부입니다. 키 값은 표시되지 않습니다.
          </p>
        </div>

        {aiStatusError && <Alert>{aiStatusError.message}</Alert>}

        {!aiStatus && !aiStatusError ? (
          <div className="flex justify-center py-6">
            <Spinner />
          </div>
        ) : aiStatus ? (
          <>
            <ul className="divide-y divide-border rounded-xl border border-border bg-surface overflow-hidden">
              {aiStatus.providers.map((provider) => (
                <li key={provider.key} className="flex items-center justify-between gap-4 px-4 py-3.5">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-semibold text-fg truncate">{provider.label}</p>
                      {provider.is_active && (
                        <span className="text-xs font-bold px-2 py-0.5 rounded-md bg-primary-soft text-primary shrink-0">
                          사용 중
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-fg-subtle font-mono truncate">{provider.model}</p>
                  </div>
                  <span
                    className={`text-xs font-bold px-2 py-1 rounded-md shrink-0
                      ${provider.api_key_configured
                        ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400'
                        : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'}`}
                  >
                    {provider.api_key_configured ? 'API 키 설정됨' : 'API 키 미설정'}
                  </span>
                </li>
              ))}
            </ul>
            <p className="text-xs text-fg-subtle">
              이미지 정제 · 헤딩 문구 추천은 이미지를 다루기 때문에 위 프로바이더 설정과 무관하게 항상 Gemini를 사용합니다.
            </p>
          </>
        ) : null}
      </section>

      <div>
        <h2 className="text-sm font-semibold text-fg">기능 플래그</h2>
        <p className="mt-1 text-xs text-fg-subtle">
          기능을 끄면 모든 기업의 사용자에게 해당 페이지 대신 점검 안내가 표시됩니다.
        </p>
      </div>

      {error && <Alert>{error.message}</Alert>}

      {!flags ? (
        <div className="flex justify-center py-10">
          <Spinner />
        </div>
      ) : (
        <ul className="divide-y divide-border rounded-xl border border-border bg-surface overflow-hidden">
          {flags.map((flag) => (
            <li key={flag.key} className="flex items-center justify-between gap-4 px-4 py-3.5">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-fg truncate">{flag.description}</p>
                <p className="text-xs text-fg-subtle font-mono truncate">{flag.key}</p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={flag.value}
                aria-label={flag.description}
                disabled={togglingKey === flag.key}
                onClick={() =>
                  flag.value
                    ? setPendingOff(flag)
                    : toggle.mutate({ key: flag.key, value: true })
                }
                className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors disabled:opacity-50
                  ${flag.value ? 'bg-primary' : 'bg-surface-3'}`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform
                    ${flag.value ? 'translate-x-6' : 'translate-x-1'}`}
                />
              </button>
            </li>
          ))}
        </ul>
      )}

      <ConfirmDialog
        open={pendingOff !== null}
        onClose={() => setPendingOff(null)}
        onConfirm={() => pendingOff && toggle.mutate({ key: pendingOff.key, value: false })}
        busy={toggle.isPending}
        title="기능 끄기"
        icon="bx-power-off"
        confirmLabel="끄기"
        message={pendingOff && <>{pendingOff.description} 기능을 끕니다.</>}
        detail="모든 기업의 사용자에게 즉시 적용되어, 해당 페이지 대신 점검 안내가 표시됩니다. 다시 켜면 바로 복구됩니다."
      />
    </div>
  );
}
