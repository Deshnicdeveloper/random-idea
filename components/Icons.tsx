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
