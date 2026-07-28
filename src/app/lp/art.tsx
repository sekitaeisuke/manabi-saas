/**
 * /lp 専用のイラスト。
 *
 * 外部の画像に依存せず、全てその場で描く SVG。
 * ・子どもが出てくる、まるくてやわらかい絵にする（塾＝子どもの居場所、が一目で伝わるように）
 * ・線は太め・角はぜんぶ丸め・顔は点目とにっこりだけ
 * ・色はブランドの indigo/violet に、あたたかい色（山吹・珊瑚・若草）を足す
 *
 * 追記するときは C（色）の語彙から選ぶこと。勝手に色を増やすと画面がうるさくなる。
 */

const C = {
  indigo: "#4f46e5",
  indigoDeep: "#4338ca",
  indigoSoft: "#c7cbfe",
  indigoPale: "#eef0ff",
  violet: "#8b5cf6",
  violetPale: "#f1ebff",
  amber: "#fbbf24",
  amberPale: "#fef3c7",
  coral: "#fb7185",
  coralPale: "#ffe4e6",
  mint: "#34d399",
  mintPale: "#d1fae5",
  cream: "#fffaf2",
  skin: "#f8d8c0",
  skinDeep: "#f0c3a4",
  hair: "#4b3b47",
  hairWarm: "#7a5240",
  ink: "#1f2937",
  white: "#ffffff",
};

/* -------------------------------------------------------------------------- */
/* 顔のパーツ（使い回す）                                                       */
/* -------------------------------------------------------------------------- */

function Face({ x, y, s = 1, blush = true }: { x: number; y: number; s?: number; blush?: boolean }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`}>
      {blush && (
        <>
          <ellipse cx="-13" cy="6" rx="5.5" ry="3.6" fill={C.coral} opacity="0.35" />
          <ellipse cx="13" cy="6" rx="5.5" ry="3.6" fill={C.coral} opacity="0.35" />
        </>
      )}
      <circle cx="-8" cy="0" r="2.9" fill={C.ink} />
      <circle cx="8" cy="0" r="2.9" fill={C.ink} />
      <path d="M-6 9 Q0 15 6 9" stroke={C.ink} strokeWidth="2.2" strokeLinecap="round" fill="none" />
    </g>
  );
}

/** ちいさなキラキラ。余白がさみしいところに散らす */
export function Sparkle({
  className, size = 20, color = C.amber,
}: { className?: string; size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className} aria-hidden>
      <path
        d="M12 1.5c.9 5.4 3.2 7.7 8.6 8.6-5.4.9-7.7 3.2-8.6 8.6-.9-5.4-3.2-7.7-8.6-8.6 5.4-.9 7.7-3.2 8.6-8.6Z"
        fill={color}
      />
    </svg>
  );
}

/* -------------------------------------------------------------------------- */
/* ヒーロー：3人で1つの画面をのぞきこむ                                          */
/* -------------------------------------------------------------------------- */

export function HeroScene({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 540 400" className={className} fill="none"
      xmlns="http://www.w3.org/2000/svg" role="img"
      aria-label="生徒・保護者・講師の3人が、ひとつの画面をいっしょにのぞきこんでいるイラスト"
    >
      {/* やわらかい背景 */}
      <ellipse cx="270" cy="205" rx="240" ry="175" fill={C.white} opacity="0.14" />
      <ellipse cx="270" cy="212" rx="196" ry="140" fill={C.white} opacity="0.12" />

      {/* うしろに浮かぶ丸 */}
      <circle cx="72" cy="66" r="13" fill={C.amber} opacity="0.75" />
      <circle cx="470" cy="92" r="9" fill={C.mint} opacity="0.8" />
      <circle cx="446" cy="46" r="5.5" fill={C.white} opacity="0.65" />
      <circle cx="106" cy="330" r="7" fill={C.coral} opacity="0.7" />

      {/* ── 先生（画面のうしろから見守る） ──
           肩は画面の上に 38px ほどしか出ないので、背景の紫に沈まないよう生成りの服にする */}
      <g>
        <path d="M225 154 Q225 112 272 112 Q319 112 319 154 Z" fill={C.indigoSoft} />
        <circle cx="272" cy="78" r="27" fill={C.skin} />
        {/* 髪：ひとつ結び */}
        <path d="M245 76 Q244 48 272 48 Q300 48 299 76 Q288 62 272 64 Q256 66 245 76 Z" fill={C.hair} />
        <circle cx="304" cy="78" r="9" fill={C.hair} />
        <Face x={272} y={82} s={0.92} />
        {/* えりもと */}
        <path d="M262 116 L272 128 L282 116" stroke={C.white} strokeWidth="3.4" strokeLinecap="round" fill="none" />
      </g>

      {/* ── まんなかの画面 ── */}
      <g>
        <rect x="163" y="150" width="214" height="152" rx="24" fill={C.white} />
        <rect x="163" y="150" width="214" height="152" rx="24" stroke={C.indigoSoft} strokeWidth="3" />
        {/* 画面の中身：見出し・棒グラフ・チェック */}
        <rect x="185" y="172" width="72" height="9" rx="4.5" fill={C.indigoSoft} />
        <rect x="185" y="196" width="18" height="42" rx="9" fill={C.indigoPale} />
        <rect x="185" y="214" width="18" height="24" rx="9" fill={C.indigo} />
        <rect x="213" y="196" width="18" height="42" rx="9" fill={C.indigoPale} />
        <rect x="213" y="206" width="18" height="32" rx="9" fill={C.violet} />
        <rect x="241" y="196" width="18" height="42" rx="9" fill={C.indigoPale} />
        <rect x="241" y="200" width="18" height="38" rx="9" fill={C.mint} />
        {/* チェックリスト */}
        <circle cx="290" cy="200" r="7.5" fill={C.mintPale} />
        <path d="M286.5 200 L289 202.6 L293.6 197.4" stroke={C.mint} strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" fill="none" />
        <rect x="304" y="196" width="50" height="8" rx="4" fill={C.indigoPale} />
        <circle cx="290" cy="222" r="7.5" fill={C.mintPale} />
        <path d="M286.5 222 L289 224.6 L293.6 219.4" stroke={C.mint} strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" fill="none" />
        <rect x="304" y="218" width="38" height="8" rx="4" fill={C.indigoPale} />
        <rect x="185" y="256" width="140" height="8" rx="4" fill={C.indigoPale} />
        <rect x="185" y="274" width="96" height="8" rx="4" fill={C.indigoPale} />
        {/* 画面から出るキラキラ */}
        <path d="M352 168c.7 4.2 2.5 6 6.7 6.7-4.2.7-6 2.5-6.7 6.7-.7-4.2-2.5-6-6.7-6.7 4.2-.7 6-2.5 6.7-6.7Z" fill={C.amber} />
      </g>

      {/* ── 生徒（左・えんぴつを持ってのぞきこむ） ── */}
      <g>
        <ellipse cx="98" cy="352" rx="46" ry="9" fill={C.indigoDeep} opacity="0.16" />
        {/* からだ */}
        <path d="M62 344 Q62 268 100 268 Q138 268 138 344 Z" fill={C.amber} />
        {/* うで（画面のほうへ） */}
        <path d="M134 296 Q158 292 168 276" stroke={C.amber} strokeWidth="17" strokeLinecap="round" fill="none" />
        <circle cx="170" cy="273" r="9.5" fill={C.skin} />
        {/* あし */}
        <rect x="78" y="338" width="17" height="20" rx="8.5" fill={C.indigoDeep} />
        <rect x="105" y="338" width="17" height="20" rx="8.5" fill={C.indigoDeep} />
        {/* あたま */}
        <circle cx="100" cy="230" r="33" fill={C.skin} />
        <path d="M67 228 Q64 190 100 190 Q136 190 133 228 Q118 210 100 212 Q82 214 67 228 Z" fill={C.hairWarm} />
        <Face x={100} y={234} s={1.05} />
        {/* えんぴつ */}
        <g transform="rotate(-24 60 300)">
          <rect x="46" y="286" width="9" height="46" rx="4.5" fill={C.coral} />
          <path d="M46 286 L50.5 274 L55 286 Z" fill={C.cream} />
          <rect x="46" y="326" width="9" height="7" rx="2" fill={C.coralPale} />
        </g>
      </g>

      {/* ── 保護者（右・小さい子と手をつなぐ） ── */}
      <g>
        <ellipse cx="438" cy="352" rx="44" ry="9" fill={C.indigoDeep} opacity="0.16" />
        {/* からだ */}
        <path d="M404 344 Q404 272 440 272 Q476 272 476 344 Z" fill={C.coral} />
        <rect x="420" y="338" width="17" height="20" rx="8.5" fill={C.indigoDeep} />
        <rect x="446" y="338" width="17" height="20" rx="8.5" fill={C.indigoDeep} />
        {/* うで（画面のほうへ） */}
        <path d="M408 300 Q386 296 376 282" stroke={C.coral} strokeWidth="16" strokeLinecap="round" fill="none" />
        <circle cx="374" cy="279" r="9" fill={C.skin} />
        {/* あたま */}
        <circle cx="440" cy="236" r="31" fill={C.skin} />
        <path d="M409 236 Q406 200 440 200 Q474 200 471 236 Q472 258 464 262 Q466 234 456 224 Q440 234 416 228 Q410 240 414 262 Q408 256 409 236 Z" fill={C.hair} />
        <Face x={440} y={240} s={0.98} />
        {/* ちいさい子 */}
        <g>
          <path d="M478 348 Q478 314 500 314 Q522 314 522 348 Z" fill={C.mint} />
          <circle cx="500" cy="296" r="21" fill={C.skin} />
          <path d="M479 295 Q477 272 500 272 Q523 272 521 295 Q511 283 500 284 Q489 285 479 295 Z" fill={C.hairWarm} />
          <Face x={500} y={299} s={0.68} />
          {/* 手をつなぐ */}
          <path d="M478 326 Q470 322 466 316" stroke={C.mint} strokeWidth="11" strokeLinecap="round" fill="none" />
        </g>
      </g>

      {/* 3人をつなぐ点線（ロゴのアーチと同じ気持ち） */}
      <path
        d="M150 250 Q270 322 400 254" stroke={C.white} strokeWidth="3"
        strokeLinecap="round" strokeDasharray="1 13" opacity="0.6" fill="none"
      />
    </svg>
  );
}

/* -------------------------------------------------------------------------- */
/* 困りごとの絵（3つ）                                                          */
/* -------------------------------------------------------------------------- */

/** 山積みの報告書と、行き場のないため息 */
export function ArtPileOfPapers({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 140 120" className={className} fill="none" role="img"
      aria-label="山積みになった報告書のイラスト">
      <circle cx="70" cy="62" r="52" fill={C.amberPale} />
      <g transform="rotate(-8 62 86)">
        <rect x="30" y="78" width="66" height="20" rx="7" fill={C.white} stroke={C.indigoSoft} strokeWidth="2.5" />
      </g>
      <g transform="rotate(5 66 68)">
        <rect x="34" y="60" width="66" height="20" rx="7" fill={C.white} stroke={C.indigoSoft} strokeWidth="2.5" />
        <rect x="42" y="68" width="26" height="4" rx="2" fill={C.indigoPale} />
      </g>
      <g transform="rotate(-4 66 50)">
        <rect x="32" y="40" width="66" height="22" rx="7" fill={C.white} stroke={C.indigo} strokeWidth="2.5" />
        <rect x="40" y="48" width="34" height="4.5" rx="2.2" fill={C.indigoSoft} />
        <rect x="40" y="56" width="22" height="4.5" rx="2.2" fill={C.indigoPale} />
      </g>
      {/* ことばにならない吹き出し（…） */}
      <circle cx="104" cy="34" r="14" fill={C.white} stroke={C.indigoSoft} strokeWidth="2.5" />
      <circle cx="89" cy="47" r="4.5" fill={C.white} stroke={C.indigoSoft} strokeWidth="2" />
      <circle cx="97.5" cy="34" r="2.3" fill={C.indigoSoft} />
      <circle cx="104" cy="34" r="2.3" fill={C.indigoSoft} />
      <circle cx="110.5" cy="34" r="2.3" fill={C.indigoSoft} />
    </svg>
  );
}

/** どこまで進んだか分からない本 */
export function ArtLostPage({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 140 120" className={className} fill="none" role="img"
      aria-label="どこまで進んだか分からない教科書のイラスト">
      <circle cx="70" cy="62" r="52" fill={C.violetPale} />
      {/* 開いた本 */}
      <path d="M22 46 Q46 36 68 46 L68 92 Q46 82 22 92 Z" fill={C.white} stroke={C.indigoSoft} strokeWidth="2.5" strokeLinejoin="round" />
      <path d="M118 46 Q94 36 72 46 L72 92 Q94 82 118 92 Z" fill={C.white} stroke={C.indigoSoft} strokeWidth="2.5" strokeLinejoin="round" />
      <rect x="30" y="54" width="30" height="4" rx="2" fill={C.indigoPale} />
      <rect x="30" y="64" width="24" height="4" rx="2" fill={C.indigoPale} />
      <rect x="82" y="54" width="28" height="4" rx="2" fill={C.indigoPale} />
      {/* しおりが宙に浮いている */}
      <path d="M92 30 h16 v26 l-8 -7 -8 7 Z" fill={C.coral} />
      {/* はてな */}
      <path d="M64 70 Q64 62 71 62 Q78 62 78 68 Q78 73 71 75 v4" stroke={C.violet} strokeWidth="4" strokeLinecap="round" fill="none" />
      <circle cx="71" cy="86" r="2.6" fill={C.violet} />
    </svg>
  );
}

/** 届いていない声 */
export function ArtUnheard({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 140 120" className={className} fill="none" role="img"
      aria-label="保護者に声が届いていないことを表すイラスト">
      <circle cx="70" cy="62" r="52" fill={C.mintPale} />
      {/* 塾側の吹き出し */}
      <path d="M16 40 h50 a8 8 0 0 1 8 8 v22 a8 8 0 0 1 -8 8 h-30 l-12 10 v-10 h-8 a8 8 0 0 1 -8 -8 v-22 a8 8 0 0 1 8 -8 Z"
        fill={C.white} stroke={C.indigo} strokeWidth="2.5" strokeLinejoin="round" />
      <rect x="24" y="52" width="34" height="4.5" rx="2.2" fill={C.indigoSoft} />
      <rect x="24" y="62" width="22" height="4.5" rx="2.2" fill={C.indigoPale} />
      {/* 途切れた点線 */}
      <path d="M84 62 h6 M96 62 h6 M108 62 h6" stroke={C.coral} strokeWidth="3.2" strokeLinecap="round" />
      {/* おうち */}
      <path d="M92 96 v-20 l16 -13 16 13 v20 Z" fill={C.white} stroke={C.indigoSoft} strokeWidth="2.5" strokeLinejoin="round" />
      <path d="M86 78 L108 60 L130 78" stroke={C.coral} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <rect x="103" y="84" width="10" height="12" rx="2" fill={C.coralPale} />
    </svg>
  );
}

/* -------------------------------------------------------------------------- */
/* 3つの入口（生徒・保護者・講師）                                               */
/* -------------------------------------------------------------------------- */

/** 生徒：えんぴつを持った子 */
export function ArtStudent({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 120 120" className={className} fill="none" role="img" aria-label="生徒のイラスト">
      <circle cx="60" cy="60" r="52" fill={C.amberPale} />
      <path d="M28 112 Q28 74 60 74 Q92 74 92 112 Z" fill={C.amber} />
      <circle cx="60" cy="48" r="27" fill={C.skin} />
      <path d="M33 47 Q31 16 60 16 Q89 16 87 47 Q74 32 60 34 Q46 36 33 47 Z" fill={C.hairWarm} />
      <Face x={60} y={51} s={0.9} />
      {/* あげた手とえんぴつ */}
      <path d="M88 92 Q98 78 96 66" stroke={C.amber} strokeWidth="13" strokeLinecap="round" fill="none" />
      <circle cx="96" cy="63" r="7.5" fill={C.skin} />
      <g transform="rotate(14 100 46)">
        <rect x="93" y="30" width="7" height="30" rx="3.5" fill={C.indigo} />
        <path d="M93 30 L96.5 21 L100 30 Z" fill={C.cream} />
      </g>
    </svg>
  );
}

/** 保護者：おとなと子ども */
export function ArtParent({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 120 120" className={className} fill="none" role="img" aria-label="保護者と子どものイラスト">
      <circle cx="60" cy="60" r="52" fill={C.coralPale} />
      {/* おとな */}
      <path d="M22 112 Q22 70 50 70 Q78 70 78 112 Z" fill={C.coral} />
      <circle cx="50" cy="46" r="25" fill={C.skin} />
      <path d="M25 46 Q23 17 50 17 Q77 17 75 46 Q76 64 70 68 Q72 44 63 36 Q50 45 31 40 Q26 50 30 68 Q24 62 25 46 Z" fill={C.hair} />
      <Face x={50} y={49} s={0.86} />
      {/* こども */}
      <path d="M74 112 Q74 86 90 86 Q106 86 106 112 Z" fill={C.mint} />
      <circle cx="90" cy="72" r="17" fill={C.skin} />
      <path d="M73 71 Q71 53 90 53 Q109 53 107 71 Q99 61 90 62 Q81 63 73 71 Z" fill={C.hairWarm} />
      <Face x={90} y={74} s={0.58} />
      {/* つないだ手 */}
      <path d="M75 94 Q70 90 66 92" stroke={C.mint} strokeWidth="9" strokeLinecap="round" fill="none" />
    </svg>
  );
}

/** 講師：バインダーを持った先生 */
export function ArtTeacher({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 120 120" className={className} fill="none" role="img" aria-label="講師のイラスト">
      <circle cx="60" cy="60" r="52" fill={C.indigoPale} />
      <path d="M26 112 Q26 72 58 72 Q90 72 90 112 Z" fill={C.violet} />
      <circle cx="58" cy="46" r="26" fill={C.skin} />
      <path d="M32 45 Q30 15 58 15 Q86 15 84 45 Q72 30 58 32 Q44 34 32 45 Z" fill={C.hair} />
      <circle cx="88" cy="46" r="8.5" fill={C.hair} />
      <Face x={58} y={49} s={0.88} />
      <path d="M50 74 L58 84 L66 74" stroke={C.white} strokeWidth="3.2" strokeLinecap="round" fill="none" />
      {/* バインダー */}
      <g transform="rotate(-9 88 92)">
        <rect x="72" y="76" width="34" height="42" rx="6" fill={C.white} stroke={C.indigo} strokeWidth="2.5" />
        <rect x="83" y="72" width="12" height="7" rx="3.5" fill={C.indigo} />
        <rect x="79" y="90" width="20" height="4" rx="2" fill={C.indigoSoft} />
        <rect x="79" y="99" width="14" height="4" rx="2" fill={C.indigoPale} />
      </g>
    </svg>
  );
}

/* -------------------------------------------------------------------------- */
/* 塾内経済：がんばりが育つ                                                      */
/* -------------------------------------------------------------------------- */

export function ArtGrowth({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 320 220" className={className} fill="none" role="img"
      aria-label="子どものがんばりが芽になって育っていくイラスト">
      <ellipse cx="160" cy="196" rx="126" ry="16" fill={C.white} opacity="0.12" />

      {/* 右上へ伸びる階段グラフ */}
      <rect x="176" y="146" width="26" height="44" rx="10" fill={C.white} opacity="0.28" />
      <rect x="210" y="120" width="26" height="70" rx="10" fill={C.white} opacity="0.4" />
      <rect x="244" y="88" width="26" height="102" rx="10" fill={C.amber} opacity="0.9" />
      <path d="M176 138 L212 112 L248 80" stroke={C.white} strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <circle cx="248" cy="80" r="7.5" fill={C.white} />

      {/* 植木鉢と芽 */}
      <path d="M92 190 L86 152 h56 l-6 38 Z" fill={C.coral} />
      <rect x="82" y="140" width="64" height="16" rx="8" fill={C.coralPale} />
      <path d="M114 140 V96" stroke={C.mint} strokeWidth="6" strokeLinecap="round" />
      <path d="M114 118 Q92 116 88 96 Q112 92 114 118 Z" fill={C.mint} />
      <path d="M114 106 Q136 102 140 82 Q116 80 114 106 Z" fill={C.mint} opacity="0.85" />
      <path d="M114 96c.8 5 3 7.2 8 8-5 .8-7.2 3-8 8-.8-5-3-7.2-8-8 5-.8 7.2-3 8-8Z" fill={C.amber} />

      {/* コイン */}
      <g>
        <circle cx="46" cy="112" r="20" fill={C.amber} />
        <circle cx="46" cy="112" r="14" fill={C.amberPale} />
        <path d="M40 112 h12 M46 106 v12" stroke={C.amber} strokeWidth="3.4" strokeLinecap="round" />
      </g>
      <circle cx="76" cy="66" r="11" fill={C.amber} opacity="0.85" />
      <circle cx="32" cy="60" r="6.5" fill={C.white} opacity="0.55" />
    </svg>
  );
}

/* -------------------------------------------------------------------------- */
/* 飾り                                                                        */
/* -------------------------------------------------------------------------- */

/** 手描きふうの下線。見出しの下に敷く */
export function Underline({ className, color = C.amber }: { className?: string; color?: string }) {
  return (
    <svg viewBox="0 0 200 12" className={className} fill="none" aria-hidden preserveAspectRatio="none">
      <path d="M3 8 Q50 2 100 6 T197 5" stroke={color} strokeWidth="6" strokeLinecap="round" fill="none" opacity="0.55" />
    </svg>
  );
}

/** セクションの継ぎ目の、ゆるい波 */
export function Wave({ className, fill = "#ffffff" }: { className?: string; fill?: string }) {
  return (
    <svg viewBox="0 0 1440 64" className={className} fill="none" aria-hidden preserveAspectRatio="none">
      <path d="M0 30 Q180 64 360 34 T720 34 T1080 34 T1440 30 V64 H0 Z" fill={fill} />
    </svg>
  );
}

/** ぷかぷか浮かぶ小さい丸（背景に散らす） */
export function Bubbles({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 400 300" className={className} fill="none" aria-hidden>
      <circle cx="46" cy="52" r="10" fill={C.amber} opacity="0.25" />
      <circle cx="352" cy="86" r="14" fill={C.violet} opacity="0.16" />
      <circle cx="300" cy="34" r="6" fill={C.coral} opacity="0.3" />
      <circle cx="112" cy="248" r="8" fill={C.mint} opacity="0.3" />
      <circle cx="378" cy="222" r="9" fill={C.indigo} opacity="0.14" />
    </svg>
  );
}
