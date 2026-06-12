export interface IconInputField {
  icon: string;
  type: string;
  name: string;
  placeholder: string;
  required?: boolean;
  autoComplete?: string;
}

/** boxicons 아이콘이 좌측에 붙은 입력창 */
export default function IconInput({ icon, type, name, placeholder, required, autoComplete }: IconInputField) {
  return (
    <div className="relative">
      <i className={`${icon} pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-xl text-slate-400`} />
      <input
        type={type}
        name={name}
        placeholder={placeholder}
        required={required}
        autoComplete={autoComplete}
        className="w-full rounded-lg border-2 border-white bg-slate-100 px-12 py-4 text-sm text-slate-900 outline-none placeholder:text-slate-400 focus:border-[#4EA685]"
      />
    </div>
  );
}
