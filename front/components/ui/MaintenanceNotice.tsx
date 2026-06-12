interface MaintenanceNoticeProps {
  title?: string;
}

/** 기능 플래그가 꺼져 있을 때 페이지 본문 대신 표시하는 점검 안내. */
export default function MaintenanceNotice({ title = '현재 점검 중입니다' }: MaintenanceNoticeProps) {
  return (
    <div className="flex flex-col items-center justify-center gap-4 min-h-[60vh] px-6 text-center">
      <span className="flex items-center justify-center w-16 h-16 rounded-2xl bg-primary-soft text-primary">
        <i className="bx bx-wrench text-3xl" />
      </span>
      <div>
        <h2 className="text-lg font-bold text-fg">{title}</h2>
        <p className="mt-1 text-sm text-fg-subtle">
          더 나은 서비스 제공을 위해 점검을 진행하고 있습니다. 잠시 후 다시 시도해 주세요.
        </p>
      </div>
    </div>
  );
}
