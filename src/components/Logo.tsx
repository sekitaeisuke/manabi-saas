export function Logo({ className, size = "md" }: { className?: string; size?: "sm" | "md" | "lg" }) {
  const scale = size === "sm" ? 0.65 : size === "lg" ? 1.3 : 1;
  const w = Math.round(272 * scale);
  const h = Math.round(72 * scale);

  return (
    <svg
      width={w}
      height={h}
      viewBox="0 0 272 72"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      role="img"
      aria-label="つながるまなび"
    >
      <defs>
        <linearGradient id="logo-bg" x1="0" y1="0" x2="72" y2="72" gradientUnits="userSpaceOnUse">
          <stop stopColor="#DCFCE7" />
          <stop offset="1" stopColor="#DBEAFE" />
        </linearGradient>
        <linearGradient id="logo-line" x1="8" y1="8" x2="64" y2="64" gradientUnits="userSpaceOnUse">
          <stop stopColor="#22C55E" />
          <stop offset="1" stopColor="#3B82F6" />
        </linearGradient>
        <linearGradient id="logo-center" x1="0" y1="0" x2="1" y2="1">
          <stop stopColor="#14B8A6" />
          <stop offset="1" stopColor="#6366F1" />
        </linearGradient>
      </defs>

      {/* Icon background */}
      <rect width="72" height="72" rx="16" fill="url(#logo-bg)" />
      <rect width="72" height="72" rx="16" stroke="url(#logo-line)" strokeWidth="1.5" strokeOpacity="0.3" />

      {/* Connection lines — outer triangle */}
      <line x1="36" y1="13" x2="14" y2="55" stroke="url(#logo-line)" strokeWidth="2.5" strokeLinecap="round" />
      <line x1="36" y1="13" x2="58" y2="55" stroke="url(#logo-line)" strokeWidth="2.5" strokeLinecap="round" />
      <line x1="14" y1="55" x2="58" y2="55" stroke="url(#logo-line)" strokeWidth="2.5" strokeLinecap="round" />

      {/* Connection lines — inner (to center) */}
      <line x1="36" y1="13" x2="36" y2="35" stroke="url(#logo-line)" strokeWidth="1.5" strokeLinecap="round" strokeOpacity="0.45" />
      <line x1="14" y1="55" x2="36" y2="35" stroke="url(#logo-line)" strokeWidth="1.5" strokeLinecap="round" strokeOpacity="0.45" />
      <line x1="58" y1="55" x2="36" y2="35" stroke="url(#logo-line)" strokeWidth="1.5" strokeLinecap="round" strokeOpacity="0.45" />

      {/* Center node */}
      <circle cx="36" cy="35" r="5.5" fill="url(#logo-center)" />
      <circle cx="36" cy="35" r="2.5" fill="white" fillOpacity="0.9" />

      {/* Top node (blue) — checkmark = テスト合格 */}
      <circle cx="36" cy="13" r="9.5" fill="#3B82F6" />
      <path d="M32 13.5 L35 16.5 L40.5 10" stroke="white" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />

      {/* Bottom-left node (green) */}
      <circle cx="14" cy="55" r="9.5" fill="#22C55E" />
      <circle cx="14" cy="55" r="4" fill="white" fillOpacity="0.85" />

      {/* Bottom-right node (sky) */}
      <circle cx="58" cy="55" r="9.5" fill="#38BDF8" />
      <circle cx="58" cy="55" r="4" fill="white" fillOpacity="0.85" />

      {/* Text: つながる (green) */}
      <text
        x="86"
        y="31"
        fontFamily="'Hiragino Kaku Gothic Pro', 'Noto Sans JP', 'Yu Gothic UI', sans-serif"
        fontSize="17"
        fontWeight="700"
        fill="#15803D"
        letterSpacing="0.5"
      >
        つながる
      </text>

      {/* Text: まなび (blue, larger) */}
      <text
        x="86"
        y="62"
        fontFamily="'Hiragino Kaku Gothic Pro', 'Noto Sans JP', 'Yu Gothic UI', sans-serif"
        fontSize="30"
        fontWeight="800"
        fill="#1D4ED8"
        letterSpacing="1"
      >
        まなび
      </text>
    </svg>
  );
}
