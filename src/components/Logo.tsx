export function Logo({ className, size = "md" }: { className?: string; size?: "sm" | "md" | "lg" }) {
  const scale = size === "sm" ? 0.7 : size === "lg" ? 1.35 : 1;
  const w = Math.round(300 * scale);
  const h = Math.round(72 * scale);

  return (
    <svg
      width={w}
      height={h}
      viewBox="0 0 300 72"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      role="img"
      aria-label="つながるまなび"
    >
      <defs>
        <linearGradient id="lgo-bg" x1="0" y1="0" x2="72" y2="72" gradientUnits="userSpaceOnUse">
          <stop stopColor="#4338ca" />
          <stop offset="1" stopColor="#7c3aed" />
        </linearGradient>
        <linearGradient id="lgo-txt" x1="90" y1="0" x2="300" y2="0" gradientUnits="userSpaceOnUse">
          <stop stopColor="#4338ca" />
          <stop offset="1" stopColor="#6d28d9" />
        </linearGradient>
      </defs>

      {/* ── Icon mark ── */}
      <rect width="72" height="72" rx="20" fill="url(#lgo-bg)" />
      {/* subtle inner border */}
      <rect x="1" y="1" width="70" height="70" rx="19" stroke="white" strokeWidth="1" strokeOpacity="0.18" />

      {/* Connection arcs forming "つ" */}
      <line x1="23" y1="22" x2="49" y2="22"
        stroke="white" strokeWidth="3" strokeLinecap="round" strokeOpacity="0.5" />
      <path d="M54 28 Q60 52 44 58 Q34 63 24 55"
        stroke="white" strokeWidth="3" fill="none" strokeLinecap="round" strokeOpacity="0.5" />

      {/* Nodes — aura + solid */}
      <circle cx="17" cy="22" r="9" fill="white" fillOpacity="0.12" />
      <circle cx="17" cy="22" r="5.5" fill="white" />

      <circle cx="54" cy="22" r="9" fill="white" fillOpacity="0.12" />
      <circle cx="54" cy="22" r="5.5" fill="white" />

      <circle cx="19" cy="53" r="10" fill="white" fillOpacity="0.14" />
      <circle cx="19" cy="53" r="7" fill="white" />
      {/* core dot on destination node */}
      <circle cx="19" cy="53" r="2.5" fill="#4338ca" fillOpacity="0.55" />

      {/* ── Logotype ── */}
      <text
        x="90" y="34"
        fontFamily="'Hiragino Kaku Gothic ProN','Hiragino Sans','Yu Gothic','Meiryo',sans-serif"
        fontSize="18" fontWeight="700" letterSpacing="1"
        fill="#334155"
      >
        つながる
      </text>
      <text
        x="90" y="62"
        fontFamily="'Hiragino Kaku Gothic ProN','Hiragino Sans','Yu Gothic','Meiryo',sans-serif"
        fontSize="24" fontWeight="800" letterSpacing="3"
        fill="url(#lgo-txt)"
      >
        まなび
      </text>
    </svg>
  );
}

/** Standalone icon mark only (no text). Use for favicon / small spaces. */
export function LogoIcon({ className, size = 40 }: { className?: string; size?: number }) {
  return (
    <svg
      width={size} height={size}
      viewBox="0 0 72 72"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      role="img"
      aria-label="つながるまなびアイコン"
    >
      <defs>
        <linearGradient id="ico-bg" x1="0" y1="0" x2="72" y2="72" gradientUnits="userSpaceOnUse">
          <stop stopColor="#4338ca" />
          <stop offset="1" stopColor="#7c3aed" />
        </linearGradient>
      </defs>
      <rect width="72" height="72" rx="20" fill="url(#ico-bg)" />
      <rect x="1" y="1" width="70" height="70" rx="19" stroke="white" strokeWidth="1" strokeOpacity="0.18" />
      <line x1="23" y1="22" x2="49" y2="22"
        stroke="white" strokeWidth="3" strokeLinecap="round" strokeOpacity="0.5" />
      <path d="M54 28 Q60 52 44 58 Q34 63 24 55"
        stroke="white" strokeWidth="3" fill="none" strokeLinecap="round" strokeOpacity="0.5" />
      <circle cx="17" cy="22" r="9" fill="white" fillOpacity="0.12" />
      <circle cx="17" cy="22" r="5.5" fill="white" />
      <circle cx="54" cy="22" r="9" fill="white" fillOpacity="0.12" />
      <circle cx="54" cy="22" r="5.5" fill="white" />
      <circle cx="19" cy="53" r="10" fill="white" fillOpacity="0.14" />
      <circle cx="19" cy="53" r="7" fill="white" />
      <circle cx="19" cy="53" r="2.5" fill="#4338ca" fillOpacity="0.55" />
    </svg>
  );
}
