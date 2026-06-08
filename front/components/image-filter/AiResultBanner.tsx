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
    <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-slate-500 bg-slate-100 rounded-md px-1.5 py-0.5">
      <i className={`bx ${meta.icon} text-xs ${meta.color}`} />
      {provider}
    </span>
  );
}

export default function AiResultBanner({ result }: AiResultBannerProps) {
  if (result.pass) {
    return (
      <div className="flex items-start gap-3 rounded-xl bg-emerald-50 border border-emerald-200 px-4 py-3.5">
        <i className="bx bx-check-shield text-emerald-500 text-xl shrink-0 mt-0.5" />
        <div className="space-y-1 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-sm font-semibold text-emerald-700">조건 충족 — 다운로드 완료!</p>
            <ProviderBadge provider={result.provider} />
          </div>
          <p className="text-xs text-emerald-600 leading-relaxed">{result.reason}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-start gap-3 rounded-xl bg-red-50 border border-red-200 px-4 py-3.5">
      <i className="bx bx-x-circle text-red-400 text-xl shrink-0 mt-0.5" />
      <div className="space-y-1 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="text-sm font-semibold text-red-700">조건에 맞지 않는 이미지입니다.</p>
          <ProviderBadge provider={result.provider} />
        </div>
        <p className="text-xs text-red-600 leading-relaxed">이유: {result.reason}</p>
      </div>
    </div>
  );
}
