'use client';

import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import Spinner from '@/components/ui/Spinner';
import type { AIStatus } from '@/types/aiStatus';
import type { FeatureFlagItem } from '@/types/featureFlags';

export default function AdminSettingsClient() {
  const { data: session, status } = useSession();
  const [flags, setFlags] = useState<FeatureFlagItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [togglingKey, setTogglingKey] = useState<string | null>(null);

  const [aiStatus, setAiStatus] = useState<AIStatus | null>(null);
  const [aiStatusError, setAiStatusError] = useState<string | null>(null);

  const isAdmin = status === 'authenticated' && session?.user.role === 'admin';

  useEffect(() => {
    if (!isAdmin) return;

    fetch('/api/admin/settings')
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.message ?? '설정 조회 실패');
        return data as FeatureFlagItem[];
      })
      .then(setFlags)
      .catch((err) => setError(err instanceof Error ? err.message : '설정 조회 실패'));

    fetch('/api/admin/ai-status')
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.message ?? 'AI 프로바이더 현황 조회 실패');
        return data as AIStatus;
      })
      .then(setAiStatus)
      .catch((err) => setAiStatusError(err instanceof Error ? err.message : 'AI 프로바이더 현황 조회 실패'));
  }, [isAdmin]);

  const handleToggle = async (key: string, value: boolean) => {
    setTogglingKey(key);
    setError(null);
    try {
      const res = await fetch(`/api/admin/settings/${key}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ value }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message ?? '설정 변경 실패');
      const updated = data as FeatureFlagItem;
      setFlags((prev) => prev?.map((f) => (f.key === updated.key ? updated : f)) ?? prev);
    } catch (err) {
      setError(err instanceof Error ? err.message : '설정 변경 실패');
    } finally {
      setTogglingKey(null);
    }
  };

  if (status === 'loading') {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Spinner size="lg" />
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 min-h-[60vh] px-6 text-center">
        <i className="bx bx-lock-alt text-3xl text-fg-subtle" />
        <h2 className="text-lg font-bold text-fg">접근 권한이 없습니다</h2>
        <p className="text-sm text-fg-subtle">관리자만 접근할 수 있는 페이지입니다.</p>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-8 space-y-6">
      <div>
        <h1 className="text-xl font-bold text-fg">시스템 설정</h1>
        <p className="mt-1 text-sm text-fg-subtle">
          AI 프로바이더 현황을 확인하고, 기능을 켜고 끌 수 있습니다.
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

        {aiStatusError && (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700
            dark:border-red-900/40 dark:bg-red-900/20 dark:text-red-400">
            {aiStatusError}
          </div>
        )}

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
              이미지 정제 · 헤딩 문구 추천 기능은 LLM_PROVIDER 설정과 무관하게 항상 Gemini를 사용합니다 (임시 조치).
            </p>
          </>
        ) : null}
      </section>

      <div>
        <h2 className="text-sm font-semibold text-fg">기능 플래그</h2>
        <p className="mt-1 text-xs text-fg-subtle">
          기능을 끄면 사용자에게 해당 페이지 대신 점검 안내가 표시됩니다.
        </p>
      </div>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700
          dark:border-red-900/40 dark:bg-red-900/20 dark:text-red-400">
          {error}
        </div>
      )}

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
                onClick={() => handleToggle(flag.key, !flag.value)}
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
    </div>
  );
}
