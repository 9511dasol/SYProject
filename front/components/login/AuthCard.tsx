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

/** 사인업/사인인 폼 카드. visible이 false면 scale-0으로 숨겨진다. */
export default function AuthCard({ visible, fields, submitLabel, footer, onSubmit, pending, error }: AuthCardProps) {
  return (
    <form
      onSubmit={onSubmit}
      className={`w-full rounded-3xl bg-white p-6 shadow-[0_5px_15px_rgba(0,0,0,0.15)] transition-transform delay-1000 duration-500 sm:p-8 ${
        visible ? 'scale-100' : 'scale-0'
      }`}
    >
      <div className="flex flex-col gap-4">
        {fields.map((field) => (
          <IconInput key={field.name} {...field} />
        ))}
      </div>
      {error && <p className="mt-3 text-center text-xs text-red-500">{error}</p>}
      <button
        type="submit"
        disabled={pending}
        className="mt-6 w-full rounded-lg bg-[linear-gradient(-45deg,#4EA685_0%,#57B894_100%)] py-3 text-lg font-medium text-white disabled:opacity-60"
      >
        {pending ? '처리 중...' : submitLabel}
      </button>
      {footer}
    </form>
  );
}
