type P = { className?: string };
const base = "h-5 w-5";

export const MicIcon = ({ className = base }: P) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <rect x="9" y="3" width="6" height="11" rx="3" />
    <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
  </svg>
);

export const SendIcon = ({ className = base }: P) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M12 19V5M5 12l7-7 7 7" />
  </svg>
);

export const SpeakerIcon = ({ className = base }: P) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M11 5 6 9H3v6h3l5 4V5z" />
    <path d="M15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13" />
  </svg>
);

export const MusicIcon = ({ className = base }: P) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M9 18V5l11-2v13" />
    <circle cx="6" cy="18" r="3" />
    <circle cx="17" cy="16" r="3" />
  </svg>
);

export const TranscriptIcon = ({ className = base }: P) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
    <path d="M14 3v5h5M9 13h6M9 17h4" />
  </svg>
);

export const StopIcon = ({ className = base }: P) => (
  <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
    <rect x="7" y="7" width="10" height="10" rx="2" />
  </svg>
);

export const CopyIcon = ({ className = base }: P) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <rect x="9" y="9" width="11" height="11" rx="2" />
    <path d="M5 15V6a2 2 0 0 1 2-2h9" />
  </svg>
);

export const CheckIcon = ({ className = base }: P) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="m5 12 5 5 9-10" />
  </svg>
);

export const HeartIcon = ({ className = base }: P) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z" />
  </svg>
);

/** The Selah mark: a candle flame over an open book. */
export const Mark = ({ className = "h-7 w-7" }: P) => (
  <svg className={className} viewBox="0 0 32 32" fill="none" aria-hidden>
    <path d="M16 3c2.6 3 3.6 5.4 3.6 7.4A3.6 3.6 0 0 1 16 14a3.6 3.6 0 0 1-3.6-3.6C12.4 8.4 13.4 6 16 3z" fill="var(--accent)" />
    <path d="M4 18c4-1.6 8.4-1.4 12 1.2 3.6-2.6 8-2.8 12-1.2v9c-4-1.6-8.4-1.4-12 1.2-3.6-2.6-8-2.8-12-1.2v-9z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
    <path d="M16 19.2v9" stroke="currentColor" strokeWidth="1.6" />
  </svg>
);

// ---------- navigation & topics (1.6px line icons, 24px grid) ----------
const line = { fill: "none", stroke: "currentColor", strokeWidth: 1.6, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };

export const WordIcon = ({ className = base }: P) => (
  <svg className={className} viewBox="0 0 24 24" {...line} aria-hidden>
    <path d="M3 5.5c2.8-1.2 5.8-1 9 1 3.2-2 6.2-2.2 9-1v13c-2.8-1.2-5.8-1-9 1-3.2-2-6.2-2.2-9-1z" />
    <path d="M12 6.5v13" />
  </svg>
);
export const TalkIcon = ({ className = base }: P) => (
  <svg className={className} viewBox="0 0 24 24" {...line} aria-hidden>
    <path d="M20 12a7.5 7.5 0 0 1-11 6.6L4 20l1.4-4.6A7.5 7.5 0 1 1 20 12z" />
  </svg>
);
export const ServiceIcon = ({ className = base }: P) => (
  <svg className={className} viewBox="0 0 24 24" {...line} aria-hidden>
    <rect x="3" y="4" width="18" height="12" rx="2" />
    <path d="M8 20h8M12 16v4" />
  </svg>
);
export const ChevronIcon = ({ className = base }: P) => (
  <svg className={className} viewBox="0 0 24 24" {...line} aria-hidden>
    <path d="m6 9 6 6 6-6" />
  </svg>
);
export const ArrowIcon = ({ className = base }: P) => (
  <svg className={className} viewBox="0 0 24 24" {...line} aria-hidden>
    <path d="M5 12h14M13 6l6 6-6 6" />
  </svg>
);
export const SearchIcon = ({ className = base }: P) => (
  <svg className={className} viewBox="0 0 24 24" {...line} aria-hidden>
    <circle cx="11" cy="11" r="6.5" />
    <path d="m20 20-4.3-4.3" />
  </svg>
);
export const WaveIcon = ({ className = base }: P) => (
  <svg className={className} viewBox="0 0 24 24" {...line} aria-hidden>
    <path d="M3 9c2 0 2-2 4.5-2S10 9 12 9s2-2 4.5-2S19 9 21 9M3 15c2 0 2-2 4.5-2s2.5 2 4.5 2 2-2 4.5-2 2.5 2 4.5 2" />
  </svg>
);
export const HourglassIcon = ({ className = base }: P) => (
  <svg className={className} viewBox="0 0 24 24" {...line} aria-hidden>
    <path d="M6 3h12M6 21h12M7 3c0 5 10 5 10 9s-10 4-10 9M17 3c0 5-10 5-10 9s10 4 10 9" />
  </svg>
);
export const MoonIcon = ({ className = base }: P) => (
  <svg className={className} viewBox="0 0 24 24" {...line} aria-hidden>
    <path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z" />
  </svg>
);
export const DropIcon = ({ className = base }: P) => (
  <svg className={className} viewBox="0 0 24 24" {...line} aria-hidden>
    <path d="M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11z" />
  </svg>
);
export const SunriseIcon = ({ className = base }: P) => (
  <svg className={className} viewBox="0 0 24 24" {...line} aria-hidden>
    <path d="M3 18h18M7 18a5 5 0 0 1 10 0M12 4v4M4.9 9.9l1.4 1.4M19.1 9.9l-1.4 1.4" />
  </svg>
);
export const HandsIcon = ({ className = base }: P) => (
  <svg className={className} viewBox="0 0 24 24" {...line} aria-hidden>
    <path d="M12 21V9.5L9 4.5c-.6-1-2.1-.6-2.1.6V11l-2.4 3.5a2 2 0 0 0 .2 2.5L9 21M12 21V9.5l3-5c.6-1 2.1-.6 2.1.6V11l2.4 3.5a2 2 0 0 1-.2 2.5L15 21" />
  </svg>
);
