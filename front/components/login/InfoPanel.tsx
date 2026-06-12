interface InfoPanelProps {
  title: string;
  visible: boolean;
  direction: 'left' | 'right';
}

/** 데스크탑 곡선 배경 위에 표시되는 안내 문구 (환영합니다 / 함께해요) */
export default function InfoPanel({ title, visible, direction }: InfoPanelProps) {
  const hiddenTransform = direction === 'left' ? '-translate-x-[250%]' : 'translate-x-[250%]';

  return (
    <div className="flex w-1/2 flex-col items-center justify-center">
      <div
        className={`m-16 text-center text-white transition-transform duration-1000 ${
          visible ? 'translate-x-0' : hiddenTransform
        }`}
      >
        <h2 className="my-8 text-4xl font-extrabold lg:text-5xl">{title}</h2>
      </div>
    </div>
  );
}
