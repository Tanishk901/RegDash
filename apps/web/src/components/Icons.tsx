/** The RegDash mark: a gauge. index.html has the same drawing as the favicon. */
export function Logo() {
  return (
    <svg className="logo" viewBox="0 0 32 32" aria-hidden>
      <rect width="32" height="32" rx="8" fill="#2459d6" />
      <path d="M8 22a9.5 9.5 0 1 1 16 0" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" />
      <path d="M16 19l5-7" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" />
      <circle cx="16" cy="19" r="2.2" fill="#fff" />
    </svg>
  );
}

const stroke = { fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round" } as const;

export function UploadIcon() {
  return (
    <svg className="icon-svg" viewBox="0 0 24 24" aria-hidden {...stroke}>
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <path d="M17 8l-5-5-5 5" />
      <path d="M12 3v12" />
    </svg>
  );
}

export function RefreshIcon() {
  return (
    <svg className="icon-svg" viewBox="0 0 24 24" aria-hidden {...stroke}>
      <path d="M21 12a9 9 0 1 1-2.6-6.4L21 8" />
      <path d="M21 3v5h-5" />
    </svg>
  );
}
