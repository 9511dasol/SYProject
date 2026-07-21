import type { AiResult } from '@/types/imageFilter';

interface AiResultBannerProps {
  result: AiResult;
}

/** AI 모델명 → 아이콘 / 색상 매핑 */
const PROVIDER_META: Record<string, { icon: string; color: string }> = {
  Gemini: { icon: 'bx-diamond', color: 'text-blue-500' },
};

function ProviderBadge({ provider }: { provider: string }) {
  if (!provider) return null;
  const key = Object.keys(PROVIDER_META).find((k) => provider.startsWith(k));
  const meta = (key && PROVIDER_META[key]) || { icon: 'bx-chip', color: 'text-slate-400' };
  return (
    <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-700 rounded-md px-1.5 py-0.5">
      <i className={`bx ${meta.icon} text-xs ${meta.color}`} />
      {provider}
    </span>
  );
}

export default function AiResultBanner({ result }: AiResultBannerProps) {
  return (
    <div className="flex items-start gap-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900/60 px-4 py-3.5">
      <i className="bx bx-check-shield text-emerald-500 text-xl shrink-0 mt-0.5" />
      <div className="space-y-1 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="text-sm font-semibold text-emerald-700 dark:text-emerald-300">편집 완료 — 다운로드 완료!</p>
          <ProviderBadge provider={result.provider} />
        </div>
      </div>
    </div>
  );
}
