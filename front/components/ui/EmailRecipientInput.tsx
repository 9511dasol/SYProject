'use client';

import { useMemo, useRef, useState } from 'react';
import type { ChangeEvent, KeyboardEvent } from 'react';

/**
 * 이메일 수신자 입력 — 확정된 주소는 칩(chip), 입력 중인 한 건은 단일 라인 input.
 *
 * 자동완성은 두 갈래를 함께 쓴다.
 *  - 드롭다운: 목록을 눈으로 고르는 주 수단. 방향키/엔터/클릭 모두 지원.
 *  - 고스트 텍스트: 1순위 추천을 입력창 뒤에 흐리게 미리 보여주고 Tab·→ 로 채운다.
 *
 * 칩으로 쪼갠 이유가 곧 고스트 텍스트가 성립하는 이유다. 예전처럼 textarea에
 * "a@x.com, b@y.com"을 한 덩어리로 받으면 커서가 문자열 중간에 있을 수 있어
 * 고스트를 어디에 그릴지 계산이 불안정해진다. 입력창에 항상 한 건만 두면
 * 커서는 늘 끝에 있고, 겹쳐 그리기가 정확해진다.
 */

/** 국내에서 실제로 많이 쓰는 순서 — 앞쪽이 먼저 추천된다. */
const DEFAULT_DOMAINS = [
  'gmail.com',
  'naver.com',
  'daum.net',
  'hanmail.net',
  'kakao.com',
  'nate.com',
  'outlook.com',
  'hotmail.com',
  'yahoo.com',
  'icloud.com',
];

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const MAX_SUGGESTIONS = 6;

export function isValidEmail(value: string): boolean {
  return EMAIL_RE.test(value.trim());
}

interface Props {
  /** 확정된 수신자 목록 */
  value: string[];
  onChange: (next: string[]) => void;
  /** 입력 중인 한 건 — 부모가 들고 있어야 '보내기'가 미확정 입력까지 함께 담을 수 있다 */
  draft: string;
  onDraftChange: (next: string) => void;
  /** 기본 목록 앞에 끼워 넣을 도메인 (예: 로그인 계정의 사내 도메인) */
  extraDomains?: string[];
  max?: number;
  placeholder?: string;
  autoFocus?: boolean;
}

export default function EmailRecipientInput({
  value,
  onChange,
  draft,
  onDraftChange,
  extraDomains,
  max,
  placeholder = 'name@example.com',
  autoFocus,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [focused, setFocused] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  // Esc로 목록만 닫은 상태. 다음 입력이 들어오면 풀린다.
  const [dismissed, setDismissed] = useState(false);
  // 고스트 텍스트는 커서가 끝에 있을 때만 의미가 있다
  const [caretAtEnd, setCaretAtEnd] = useState(true);

  const domains = useMemo(
    () => [...new Set([...(extraDomains ?? []), ...DEFAULT_DOMAINS])],
    [extraDomains],
  );

  const atIndex = draft.lastIndexOf('@');
  const typedDomain = atIndex >= 0 ? draft.slice(atIndex + 1).toLowerCase() : '';

  const suggestions = useMemo(() => {
    // '@' 앞에 아이디가 있어야, 그리고 도메인에 공백이 없어야 추천한다
    if (atIndex < 1 || typedDomain.includes(' ')) return [];
    return domains
      .filter((d) => d.startsWith(typedDomain) && d !== typedDomain)
      .slice(0, MAX_SUGGESTIONS);
  }, [domains, atIndex, typedDomain]);

  const isFull = max !== undefined && value.length >= max;
  const open = focused && !dismissed && suggestions.length > 0 && !isFull;
  const activeIdx = Math.min(activeIndex, Math.max(suggestions.length - 1, 0));
  const active = open ? (suggestions[activeIdx] ?? null) : null;
  const ghost = active && caretAtEnd ? active.slice(typedDomain.length) : '';

  function syncCaret() {
    const el = inputRef.current;
    setCaretAtEnd(!el || el.selectionStart === el.value.length);
  }

  /** 한 건을 칩으로 확정. 유효하지 않으면 draft에 그대로 남긴다. */
  function commit(raw: string): void {
    const email = raw.trim().replace(/[,;]+$/, '').trim();
    if (!email) {
      onDraftChange('');
      return;
    }
    if (!isValidEmail(email) || isFull) return;
    if (!value.includes(email)) onChange([...value, email]);
    onDraftChange('');
    setActiveIndex(0);
  }

  /** 추천 도메인으로 '@' 뒤를 갈아끼운 전체 주소 */
  function withDomain(domain: string): string {
    return `${draft.slice(0, atIndex + 1)}${domain}`;
  }

  function handleChange(e: ChangeEvent<HTMLInputElement>) {
    const next = e.target.value;
    setDismissed(false);
    setActiveIndex(0);

    // 쉼표·세미콜론으로 구분해 붙여넣은 경우까지 한 번에 처리한다
    if (/[,;]/.test(next)) {
      const parts = next.split(/[,;]+/);
      const tail = parts.pop() ?? '';
      const added = parts
        .map((p) => p.trim())
        .filter((p) => p && isValidEmail(p) && !value.includes(p));
      const merged = [...value, ...added];
      onChange(max === undefined ? merged : merged.slice(0, max));
      onDraftChange(tail.trim());
      return;
    }

    onDraftChange(next);
    requestAnimationFrame(syncCaret);
  }

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (open) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setActiveIndex((i) => (i + 1) % suggestions.length);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setActiveIndex((i) => (i - 1 + suggestions.length) % suggestions.length);
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        setDismissed(true);
        return;
      }
      // Tab·→ 는 '채우기'까지만 — 계속 다듬을 수 있게 확정하지 않는다
      if ((e.key === 'Tab' || e.key === 'ArrowRight') && ghost && active) {
        e.preventDefault();
        onDraftChange(withDomain(active));
        setCaretAtEnd(true);
        return;
      }
      // Enter는 채우고 바로 확정
      if (e.key === 'Enter' && active) {
        e.preventDefault();
        commit(withDomain(active));
        return;
      }
    }

    if (e.key === 'Enter') {
      e.preventDefault();
      commit(draft);
      return;
    }
    if (e.key === 'Backspace' && !draft && value.length > 0) {
      onChange(value.slice(0, -1));
    }
  }

  return (
    <div className="relative">
      <div
        onClick={() => inputRef.current?.focus()}
        className={`flex flex-wrap items-center gap-1.5 rounded-lg border px-2 py-1.5 transition-colors
          bg-white dark:bg-surface-2
          ${focused
            ? 'border-blue-500 ring-2 ring-blue-500/30'
            : 'border-slate-200 dark:border-border'}`}
      >
        {value.map((email) => (
          <span
            key={email}
            className="inline-flex items-center gap-1 rounded-md bg-blue-50 dark:bg-blue-950/50
              text-blue-700 dark:text-blue-300 pl-2 pr-1 py-0.5 text-[11px] font-medium max-w-full"
          >
            <span className="truncate">{email}</span>
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={(e) => {
                e.stopPropagation();
                onChange(value.filter((v) => v !== email));
              }}
              aria-label={`${email} 삭제`}
              className="shrink-0 w-3.5 h-3.5 flex items-center justify-center rounded-full
                hover:bg-blue-200 dark:hover:bg-blue-800 transition-colors"
            >
              <i className="bx bx-x text-sm" />
            </button>
          </span>
        ))}

        {/* 입력 + 고스트 텍스트 겹쳐 그리기 — 두 요소의 글꼴/자간이 같아야 정렬이 맞는다 */}
        <div className="relative flex-1 min-w-32">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 flex items-center whitespace-pre text-xs"
          >
            <span className="invisible">{draft}</span>
            <span className="text-slate-400 dark:text-slate-500">{ghost}</span>
          </div>
          <input
            ref={inputRef}
            type="email"
            value={draft}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            onSelect={syncCaret}
            onFocus={() => {
              setFocused(true);
              syncCaret();
            }}
            onBlur={() => {
              setFocused(false);
              setDismissed(false);
              commit(draft); // 유효하지 않으면 그대로 남아 아래에 사유가 표시된다
            }}
            autoFocus={autoFocus}
            disabled={isFull}
            placeholder={value.length === 0 ? placeholder : ''}
            className="relative w-full bg-transparent text-xs text-slate-700 dark:text-fg
              placeholder:text-slate-400 dark:placeholder:text-fg-subtle outline-none py-0.5
              disabled:cursor-not-allowed"
            role="combobox"
            aria-expanded={open}
            aria-controls="email-domain-listbox"
            aria-autocomplete="list"
            aria-activedescendant={active ? `email-domain-${activeIdx}` : undefined}
          />
        </div>
      </div>

      {open && (
        <ul
          id="email-domain-listbox"
          role="listbox"
          className="absolute z-30 left-0 right-0 mt-1 max-h-52 overflow-y-auto rounded-lg border
            border-slate-200 dark:border-border bg-white dark:bg-surface shadow-lg py-1"
        >
          {suggestions.map((domain, i) => (
            <li
              key={domain}
              id={`email-domain-${i}`}
              role="option"
              aria-selected={i === activeIdx}
              // mousedown 기본동작을 막아야 input이 포커스를 잃지 않고 click까지 살아남는다
              onMouseDown={(e) => e.preventDefault()}
              onMouseEnter={() => setActiveIndex(i)}
              onClick={() => commit(withDomain(domain))}
              className={`px-2.5 py-1.5 text-xs cursor-pointer flex items-center gap-1
                ${i === activeIdx
                  ? 'bg-blue-50 dark:bg-blue-950/50 text-blue-700 dark:text-blue-300'
                  : 'text-slate-600 dark:text-fg-muted'}`}
            >
              <span className="truncate">{draft.slice(0, atIndex + 1)}</span>
              <span className="font-semibold shrink-0">{domain}</span>
            </li>
          ))}
        </ul>
      )}

      {open && (
        <p className="mt-1 text-[10px] text-slate-400 dark:text-fg-subtle">
          ↑↓ 이동 · Enter 선택 · Tab 채우기 · Esc 닫기
        </p>
      )}
    </div>
  );
}
