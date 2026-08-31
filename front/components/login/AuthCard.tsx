import IconInput, { type IconInputField } from './IconInput';

interface AuthCardProps {
  visible: boolean;
  fields: IconInputField[];
  submitLabel: string;
  footer: React.ReactNode;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
  pending?: boolean;
  error?: string | null;
}

/**
 * 사인업/사인인 폼 카드. visible이 false면 scale-0으로 접혀 보이지 않는다.
 *
 * `inert`가 필요한 이유: scale-0은 그리기만 줄이고 DOM·접근성 트리에는 그대로
 * 남는다. 데스크톱(md 이상)에서는 두 카드를 동시에 렌더하기 때문에, 로그인 폼에서
 * Tab을 누르면 화면에 없는 회원가입 폼의 입력 4개와 제출 버튼으로 포커스가
 * 사라졌다. inert는 그 하위 전체를 포커스·클릭·접근성 트리에서 빼 준다.
 */
export default function AuthCard({ visible, fields, submitLabel, footer, onSubmit, pending, error }: AuthCardProps) {
  return (
    <form
      onSubmit={onSubmit}
      inert={!visible}
      className={`w-full rounded-3xl bg-white p-6 shadow-[0_5px_15px_rgba(0,0,0,0.15)] transition-transform duration-500 sm:p-8 ${
        visible ? 'scale-100' : 'scale-0'
      }`}
    >
      <div className="flex flex-col gap-4">
        {fields.map((field) => (
          <IconInput key={field.name} {...field} />
        ))}
      </div>
      {/* role="alert" — 로그인 실패를 스크린리더가 알리지 못하고 있었다 */}
      {error && (
        <p role="alert" className="mt-3 text-center text-xs text-red-600">
          {error}
        </p>
      )}
      <button
        type="submit"
        disabled={pending}
        className="mt-6 w-full rounded-lg bg-[linear-gradient(-45deg,#4EA685_0%,#57B894_100%)] py-3 text-lg font-medium text-white
          transition-opacity hover:opacity-95 disabled:opacity-60
          focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4EA685] focus-visible:ring-offset-2"
      >
        {pending ? '처리 중...' : submitLabel}
      </button>
      {footer}
    </form>
  );
}
