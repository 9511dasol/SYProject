'use client';

import { useId } from 'react';

export interface IconInputField {
  icon: string;
  type: string;
  name: string;
  placeholder: string;
  /**
   * 스크린리더가 읽을 필드 이름. 생략하면 placeholder를 쓴다.
   * 이 화면은 디자인상 눈에 보이는 레이블을 두지 않으므로, 레이블은 감춰서 넣는다 —
   * 예전에는 placeholder 만 있어서 스크린리더 사용자가 어느 칸인지 알 수 없었고,
   * 입력을 시작하면 placeholder 가 사라져 시각 사용자도 단서를 잃었다.
   */
  label?: string;
  required?: boolean;
  autoComplete?: string;
}

/** boxicons 아이콘이 좌측에 붙은 입력창 */
export default function IconInput({
  icon,
  type,
  name,
  placeholder,
  label,
  required,
  autoComplete,
}: IconInputField) {
  const id = useId();

  return (
    <div className="relative">
      <label htmlFor={id} className="sr-only">
        {label ?? placeholder}
      </label>
      <i className={`${icon} pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-xl text-slate-400`} />
      <input
        id={id}
        type={type}
        name={name}
        placeholder={placeholder}
        required={required}
        autoComplete={autoComplete}
        /* 포커스 표시가 테두리 색 변화뿐이라 흰 테두리 위에서 대비가 낮았다 — 링을 함께 준다 */
        className="w-full rounded-lg border-2 border-white bg-slate-100 px-12 py-4 text-sm text-slate-900
          outline-none placeholder:text-slate-400
          focus:border-[#4EA685] focus:ring-2 focus:ring-[#4EA685]/40"
      />
    </div>
  );
}
