import type { AnalysisResult } from '@/types/marketing';
import Button from '@/components/ui/Button';

interface ResultCardProps extends AnalysisResult {
  onReset: () => void;
}

export default function ResultCard({ processedRows, aiComment, onReset }: ResultCardProps) {
  return (
    <div className="rounded-2xl border border-blue-100 bg-gradient-to-br from-blue-50 to-indigo-50 p-6">
      <div className="flex items-center gap-2 mb-4">
        <span className="flex items-center justify-center w-8 h-8 rounded-full bg-blue-600">
          <i className="bx bx-check text-white text-lg" />
        </span>
        <h2 className="text-base font-semibold text-blue-900">AI 분석 완료</h2>
      </div>

      <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap">{aiComment}</p>

      <div className="mt-5 pt-4 border-t border-blue-200 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-center gap-2 text-sm text-slate-500">
          <i className="bx bx-table text-base text-blue-400" />
          <span>
            처리된 데이터{' '}
            <strong className="text-slate-700">{processedRows.toLocaleString()}행</strong>
          </span>
        </div>
        <Button variant="ghost" onClick={onReset} className="text-xs self-start sm:self-auto">
          <i className="bx bx-refresh" />
          새 파일 분석
        </Button>
      </div>
    </div>
  );
}
