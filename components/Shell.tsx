"use client";
// App shell: top bar (wordmark, Word · Talk · Service, a right-side slot) and, on phones, a bottom tab bar.
import Link from "next/link";
import type { ReactNode } from "react";
import { Mark, ServiceIcon, TalkIcon, WordIcon } from "./Icons";

export type Section = "word" | "talk" | "service";

const NAV: { id: Section; href: string; label: string; Icon: typeof WordIcon }[] = [
  { id: "word", href: "/", label: "Word", Icon: WordIcon },
  { id: "talk", href: "/talk", label: "Talk", Icon: TalkIcon },
  { id: "service", href: "/service", label: "Service", Icon: ServiceIcon },
];

export function TopBar({ active, right }: { active: Section; right?: ReactNode }) {
  return (
    <header className="sticky top-0 z-30 border-b border-line bg-bg/85 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-5xl items-center justify-between gap-4 px-4 sm:px-6">
        <Link href="/" className="flex items-center gap-2.5 rounded-[10px]" aria-label="Selah home">
          <Mark className="h-7 w-7 text-ink" />
          <span className="text-[19px] font-semibold tracking-[-0.01em]">Selah</span>
        </Link>
        <nav className="hidden items-center gap-1 md:flex" aria-label="Main">
          {NAV.map(({ id, href, label }) => (
            <Link
              key={id}
              href={href}
              aria-current={active === id ? "page" : undefined}
              className={`relative rounded-[10px] px-4 py-2 text-[15px] font-medium transition-colors duration-150 ${
                active === id ? "text-ink" : "text-muted hover:text-ink"
              }`}
            >
              {label}
              {active === id && <span className="absolute inset-x-4 -bottom-[13px] h-[2px] rounded-full bg-accent" />}
            </Link>
          ))}
        </nav>
        <div className="flex items-center gap-2">{right}</div>
      </div>
    </header>
  );
}

export function TabBar({ active }: { active: Section }) {
  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-md md:hidden"
      aria-label="Main"
    >
      <div className="mx-auto grid h-16 max-w-md grid-cols-3">
        {NAV.map(({ id, href, label, Icon }) => (
          <Link
            key={id}
            href={href}
            aria-current={active === id ? "page" : undefined}
            className={`flex flex-col items-center justify-center gap-1 text-[11px] font-medium transition-colors ${
              active === id ? "text-ink" : "text-muted"
            }`}
          >
            <span className={`grid h-7 w-12 place-items-center rounded-full transition-colors ${active === id ? "bg-accent-soft" : ""}`}>
              <Icon className="h-[20px] w-[20px]" />
            </span>
            {label}
          </Link>
        ))}
      </div>
    </nav>
  );
}

/** A styled native select: accessible and comfortable on phones. */
export function Select<T extends string>(props: {
  label: string;
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
  className?: string;
}) {
  return (
    <label className={`relative inline-flex items-center ${props.className ?? ""}`}>
      <span className="sr-only">{props.label}</span>
      <select
        value={props.value}
        onChange={(e) => props.onChange(e.target.value as T)}
        className="h-9 w-full min-w-0 cursor-pointer appearance-none truncate rounded-[10px] border border-line bg-surface pl-3 pr-8 text-[14px] font-medium text-ink transition-colors hover:border-emphasis/40"
      >
        {props.options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <svg className="pointer-events-none absolute right-2.5 h-4 w-4 text-muted" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
        <path d="m6 9 6 6 6-6" />
      </svg>
    </label>
  );
}
