import type { AiResult } from '@/types/imageFilter';

interface AiResultBannerProps {
  result: AiResult;
}

/** AI 모델명 → 아이콘 / 색상 매핑 */
const PROVIDER_META: Record<string, { icon: string; color: string }> = {
  'GPT-4o-mini':      { icon: 'bx-bot',    color: 'text-emerald-500' },
  'Claude Sonnet':    { icon: 'bx-brain',  color: 'text-violet-500'  },
  'Gemini 1.5 Flash': { icon: 'bx-diamond', color: 'text-blue-500'   },
};

function ProviderBadge({ provider }: { provider: string }) {
  if (!provider) return null;
  const meta = PROVIDER_META[provider] ?? { icon: 'bx-chip', color: 'text-slate-400' };
  return (
    <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-700 rounded-md px-1.5 py-0.5">
      <i className={`bx ${meta.icon} text-xs ${meta.color}`} />
      {provider}
    </span>
  );
}

export default function AiResultBanner({ result }: AiResultBannerProps) {
  if (result.pass) {
    return (
      <div className="flex items-start gap-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900/60 px-4 py-3.5">
        <i className="bx bx-check-shield text-emerald-500 text-xl shrink-0 mt-0.5" />
        <div className="space-y-1 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-sm font-semibold text-emerald-700 dark:text-emerald-300">조건 충족 — 다운로드 완료!</p>
            <ProviderBadge provider={result.provider} />
          </div>
          <p className="text-xs text-emerald-600 dark:text-emerald-400 leading-relaxed">{result.reason}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-start gap-3 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/60 px-4 py-3.5">
      <i className="bx bx-x-circle text-red-400 text-xl shrink-0 mt-0.5" />
      <div className="space-y-1.5 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="text-sm font-semibold text-red-700 dark:text-red-400">조건에 맞지 않는 이미지입니다.</p>
          <ProviderBadge provider={result.provider} />
        </div>
        <p className="text-xs text-red-600 dark:text-red-400 leading-relaxed">이유: {result.reason}</p>
        {result.suggestions && result.suggestions.length > 0 && (
          <div className="mt-2 pt-2 border-t border-red-200 dark:border-red-900/60 space-y-1">
            <p className="text-[11px] font-semibold text-red-500 dark:text-red-400 uppercase tracking-wide">
              AI 개선 제안
            </p>
            <ul className="space-y-1">
              {result.suggestions.map((suggestion, i) => (
                <li key={i} className="flex items-start gap-1.5 text-xs text-red-600 dark:text-red-400 leading-relaxed">
                  <i className="bx bx-right-arrow-alt text-red-400 shrink-0 mt-0.5 text-sm" />
                  {suggestion}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
