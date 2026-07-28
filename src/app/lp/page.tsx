import type { Metadata } from "next";
import Link from "next/link";
import { Logo } from "@/components/Logo";
import { InquiryForm } from "./InquiryForm";

export const metadata: Metadata = {
  title: "つながるまなび｜生徒・保護者・講師が同じ画面を見る、学習塾のためのプラットフォーム",
  description:
    "報告書・教材進捗・学力診断・保護者連絡をひとつにつなぐ学習塾向けシステム。「あの子は今どこで止まっているか」を、生徒・保護者・講師が同じ言葉で話せるようにします。塾を運営する会社が、自分たちの現場のために作りました。",
  openGraph: {
    title: "つながるまなび｜学習塾のための学習管理プラットフォーム",
    description:
      "報告書・教材進捗・学力診断・保護者連絡をひとつに。塾を運営する会社が自分たちの現場のために作り、毎日使っているシステムです。",
    type: "website",
  },
};

/* ========================================================================== */
/* データ                                                                      */
/* ========================================================================== */

const PAINS = [
  {
    icon: "📄",
    title: "報告書は溜まるのに、次の一手が決まらない",
    body: "毎回きちんと書いている。でも読み返す時間はなく、次の授業は結局その場の判断になる。書いた記録が、指導に返ってこない。",
  },
  {
    icon: "📚",
    title: "「何をどこまで」が講師の頭の中にしかない",
    body: "担当が変わった日、その子がどのテキストのどこで止まっているのか誰も答えられない。生徒に聞くところから授業が始まる。",
  },
  {
    icon: "🔇",
    title: "保護者に届いているのは、面談のときだけ",
    body: "日々ちゃんと見ているのに、伝わっていない。「うちの子、実際どうなんですか」と面談で初めて聞かれる。",
  },
];

const PILLARS = [
  {
    label: "01",
    title: "「何をどこまで」は、1か所にだけ書く",
    body:
      "教材進捗を単一の真実（Single Source of Truth）として扱います。報告書もカルテも保護者画面も、そこを参照して表示するだけ。同じことを二度書かないので、食い違いが起きません。",
  },
  {
    label: "02",
    title: "子どもが主役。生徒本人がログインする",
    body:
      "生徒に専用のIDを渡し、自分の現在地・今日やること・診断結果を自分で見られるようにします。管理される側から、使う側へ。塾を「使い切れる」子を増やすための設計です。",
  },
  {
    label: "03",
    title: "使わない機能は、画面から消せる",
    body:
      "8つの機能はモジュールとして会社単位・グループ単位でON/OFFできます。貴塾に要らないものは最初から見えません。全部入りを押しつけません。",
  },
];

const ROLES = [
  {
    icon: "✏️",
    who: "生徒",
    lead: "自分の現在地が、自分で見える",
    items: [
      "今日やることが1画面に並ぶ",
      "使っている教材と、どこまで進んだか",
      "学力診断の結果と、いま伸ばすべき1点",
      "来塾のチェックイン（顔認証キオスク対応）",
    ],
  },
  {
    icon: "👨‍👩‍👧",
    who: "保護者",
    lead: "面談を待たずに、日々が伝わる",
    items: [
      "授業ごとの報告書",
      "3か月ビジョンと、日々のカルテ",
      "学力診断の結果（保護者向けの言葉で）",
      "来塾カレンダー・振替リクエスト",
      "講師へのメッセージ／LINE通知",
    ],
  },
  {
    icon: "📋",
    who: "講師",
    lead: "教室 → 今日来る生徒 → やること → 報告書",
    items: [
      "一本道の導線。迷わず今日の準備に入れる",
      "教材進捗の入力（正式な入力口はここだけ）",
      "気がかりな生徒が自動で上がってくる講師連携",
      "シフト希望・出退勤（顔認証）",
      "テスト作成・採点・結果分析",
    ],
  },
];

const CORE = [
  { title: "生徒一覧・生徒カルテ", body: "一人ひとりの情報を1画面に集約。担当が変わっても引き継げる。" },
  { title: "授業予定・来塾カレンダー", body: "誰がいつ来るか。振替も含めて教室ごとに把握。" },
  { title: "授業報告書", body: "講師が記入し、保護者にそのまま届く。教材進捗を参照して表示。" },
  { title: "保護者管理・メッセージ", body: "家庭ごとの連絡履歴。既読・未読も含めて追える。" },
  { title: "お知らせ・通知", body: "教室・学年・対象を絞った配信。LINE／プッシュ通知に対応。" },
];

const MODULES = [
  {
    key: "progress",
    icon: "📘",
    title: "教材進捗",
    lead: "システムの背骨",
    body:
      "「何のテキストを、どこまで、どんな手応えで」を生徒ごとに積み上げます。ここが唯一の入力口。報告書・カルテ・保護者画面はすべてここを見に行きます。",
  },
  {
    key: "karte_ai",
    icon: "🧭",
    title: "学習指導AI（カルテ・3か月ビジョン）",
    lead: "北極星と、今日の一歩",
    body:
      "3か月後にどうなっていたいかを「ビジョン」として置き、そこから日々のカルテへ落とします。報告書・診断・保護者の要望を束ねて、今日の一歩を言葉にします。",
  },
  {
    key: "tests",
    icon: "🔬",
    title: "テスト・学力診断",
    lead: "点数ではなく、詰まっている場所",
    body:
      "9つの観点から三角測定し、「主なボトルネックはここ」を1つに絞って示します。講師には尖った言葉で、保護者には温かい言葉で、同じ結果を2通りに出し分けます。",
  },
  {
    key: "collaboration",
    icon: "🤝",
    title: "講師連携",
    lead: "気がかりな子が、自動で上がってくる",
    body:
      "正答率の低下や報告書の記述から、気にかけるべき生徒を自動で掲載します。解決すれば消え、また兆しが出れば戻ってくる。講師どうしが語り合う場所です。",
  },
  {
    key: "parent_portal",
    icon: "👪",
    title: "保護者ポータル・振替",
    lead: "電話に出られない時間をなくす",
    body:
      "保護者が自分で報告書・カルテ・カレンダーを見て、振替を申請できます。塾側は届いたリクエストを承認するだけ。",
  },
  {
    key: "shift",
    icon: "🗓",
    title: "シフト管理",
    lead: "希望を集めて、確定まで",
    body: "講師のシフト希望を集約し、教室ごとの確定表まで作ります。",
  },
  {
    key: "attendance",
    icon: "🙂",
    title: "勤怠・顔認証",
    lead: "打刻を、顔で",
    body:
      "講師の出退勤と集計。生徒の来塾チェックインも顔認証キオスクで受けられます（端末はタブレット1台）。",
  },
  {
    key: "class_stock",
    icon: "📈",
    title: "塾内経済（AC・自塾株）",
    lead: "がんばりが、目に見えて動く",
    body:
      "出席・小テスト合格・教材を進めた・掃除をした——学習と貢献にアカデミーコインが自動でつきます。塾の成長に連動して「自塾株」の株価が毎週動き、生徒はコインで売買できる。現金価値は持ちません。",
    highlight: true,
  },
];

const STEPS = [
  {
    n: "1",
    title: "画面をお見せします",
    body: "オンラインで30分ほど。実際に毎日動いている本物の画面を、生徒・保護者・講師の3方向からご覧いただきます。",
  },
  {
    n: "2",
    title: "使う機能を選ぶ",
    body: "8つのモジュールから、貴塾に要るものだけをONに。要らない機能は最初から画面に出ません。",
  },
  {
    n: "3",
    title: "教室・講師・生徒を登録",
    body: "既存の名簿からまとめて取り込めます。保護者アカウントは生徒登録と同時に作られます。",
  },
  {
    n: "4",
    title: "まず1教室から",
    body: "いきなり全教室に広げません。1教室で回してみて、現場の言葉に合わせて調整してから広げます。",
  },
];

const FAQ = [
  {
    q: "いま使っている塾システムから乗り換えられますか",
    a: "生徒・保護者・教室の名簿は、CSV等からまとめて取り込めます。過去の報告書をどこまで持ってくるかはご相談ください。並行運用の期間を置いて、現場が慣れてから切り替えるやり方をおすすめしています。",
  },
  {
    q: "スマホで使えますか",
    a: "全画面がスマホ前提で作られています。保護者・生徒はスマホ、講師は教室のPCとスマホの併用、という使われ方が実際にいちばん多いです。",
  },
  {
    q: "生徒の個人情報は大丈夫ですか",
    a: "全ての画面・APIでログインを必須にし、データベース側でも役割ごとのアクセス制御（Row Level Security）をかけています。保護者は自分の子だけ、生徒は自分だけが見えます。",
  },
  {
    q: "料金はいくらですか",
    a: "教室数と使う機能の組み合わせで決まります。現在は導入いただく塾さんと一緒に形を決めている段階なので、まずは規模とやりたいことをお聞かせください。",
  },
  {
    q: "うちの塾のやり方に合わせて直せますか",
    a: "運営会社が自分の塾のために作っているシステムなので、現場の言葉に合わせる調整は得意です。ご相談ください。",
  },
];

/* ========================================================================== */
/* パーツ                                                                      */
/* ========================================================================== */

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-pill border border-brand-200 bg-brand-50 px-3.5 py-1 text-xs font-bold tracking-wide text-brand-700">
      {children}
    </span>
  );
}

function CtaButtons({ tone = "light" }: { tone?: "light" | "dark" }) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row">
      <a
        href="#contact"
        className="rounded-field bg-brand-gradient px-7 py-3.5 text-center text-sm font-bold text-white shadow-brand transition duration-200 ease-out-soft hover:-translate-y-0.5 hover:shadow-pop active:translate-y-0"
      >
        画面を見せてもらう（無料）
      </a>
      <a
        href="#features"
        className={
          tone === "dark"
            ? "rounded-field border border-white/30 bg-white/10 px-7 py-3.5 text-center text-sm font-bold text-white backdrop-blur transition hover:bg-white/20"
            : "rounded-field border border-line-strong bg-surface px-7 py-3.5 text-center text-sm font-bold text-ink transition hover:border-brand-200 hover:shadow-card"
        }
      >
        できることを見る
      </a>
    </div>
  );
}

/* ========================================================================== */
/* ページ                                                                      */
/* ========================================================================== */

export default function LandingPage() {
  return (
    <div className="bg-canvas">
      {/* ── ヘッダー ── */}
      <header className="sticky top-0 z-50 border-b border-line/70 bg-canvas/85 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-3">
          <Link href="/lp" aria-label="つながるまなび">
            <Logo size="sm" />
          </Link>
          <nav className="hidden items-center gap-7 text-sm font-medium text-ink-muted md:flex">
            <a href="#why" className="transition hover:text-ink">なぜ作ったか</a>
            <a href="#roles" className="transition hover:text-ink">3つの入口</a>
            <a href="#features" className="transition hover:text-ink">できること</a>
            <a href="#steps" className="transition hover:text-ink">導入の流れ</a>
            <a href="#faq" className="transition hover:text-ink">よくある質問</a>
          </nav>
          <div className="flex items-center gap-2">
            <Link
              href="/"
              className="hidden rounded-field border border-line-strong px-4 py-2 text-xs font-semibold text-ink-muted transition hover:border-brand-200 hover:text-ink sm:block"
            >
              ログイン
            </Link>
            <a
              href="#contact"
              className="rounded-field bg-brand-gradient px-4 py-2 text-xs font-bold text-white shadow-brand transition hover:shadow-pop"
            >
              相談する
            </a>
          </div>
        </div>
      </header>

      {/* ── ヒーロー ── */}
      <section className="relative overflow-hidden bg-brand-gradient">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-60"
          style={{
            backgroundImage:
              "radial-gradient(48rem 26rem at 15% -10%, rgba(255,255,255,0.22), transparent 60%), radial-gradient(40rem 24rem at 95% 10%, rgba(167,139,250,0.35), transparent 55%)",
          }}
        />
        <div className="relative mx-auto max-w-6xl px-5 py-20 sm:py-28">
          <div className="max-w-3xl">
            <span className="inline-flex items-center rounded-pill border border-white/25 bg-white/10 px-3.5 py-1 text-xs font-semibold text-white/90 backdrop-blur">
              学習塾のための学習管理プラットフォーム
            </span>

            <h1 className="mt-6 text-3xl font-extrabold leading-[1.35] text-white sm:text-5xl sm:leading-[1.3]">
              生徒・保護者・講師が、
              <br className="hidden sm:block" />
              <span className="text-white/95">同じ画面を見る。</span>
            </h1>

            <p className="mt-7 max-w-2xl text-sm leading-8 text-white/85 sm:text-base sm:leading-9">
              報告書、教材進捗、学力診断、保護者への連絡。
              バラバラだった記録を1本につないで、
              <strong className="font-bold text-white">「あの子は今どこで止まっているのか」</strong>
              を、全員が同じ言葉で話せるようにするシステムです。
            </p>

            <div className="mt-10">
              <CtaButtons tone="dark" />
            </div>

            <p className="mt-8 text-xs leading-6 text-white/70">
              千葉県で複数の教室を運営する学習塾が、自分たちの現場のために作り、
              <br className="hidden sm:block" />
              毎日の授業でそのまま使っているシステムです。
            </p>
          </div>
        </div>
      </section>

      {/* ── 課題 ── */}
      <section id="why" className="scroll-mt-20 border-b border-line bg-canvas-glow">
        <div className="mx-auto max-w-6xl px-5 py-20 sm:py-24">
          <SectionLabel>なぜ作ったか</SectionLabel>
          <h2 className="mt-5 text-2xl font-bold leading-relaxed text-ink sm:text-3xl">
            記録は増えているのに、
            <br className="sm:hidden" />
            指導が良くなっていかない。
          </h2>
          <p className="mt-5 max-w-2xl text-sm leading-8 text-ink-muted">
            私たちも同じでした。報告書は毎回書く。面談では丁寧に話す。それでも、
            現場で起きていたのは次の3つです。
          </p>

          <div className="mt-12 grid gap-5 md:grid-cols-3">
            {PAINS.map((p) => (
              <div
                key={p.title}
                className="rounded-card border border-line bg-surface p-7 shadow-card transition duration-200 ease-out-soft hover:-translate-y-0.5 hover:shadow-card-hover"
              >
                <div className="flex h-11 w-11 items-center justify-center rounded-field bg-canvas-sunken text-xl">
                  {p.icon}
                </div>
                <h3 className="mt-5 text-base font-bold leading-relaxed text-ink">{p.title}</h3>
                <p className="mt-3 text-sm leading-7 text-ink-muted">{p.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── 考え方 ── */}
      <section className="border-b border-line bg-surface">
        <div className="mx-auto max-w-6xl px-5 py-20 sm:py-24">
          <SectionLabel>考え方</SectionLabel>
          <h2 className="mt-5 text-2xl font-bold leading-relaxed text-ink sm:text-3xl">
            機能を足す前に、
            <br className="sm:hidden" />
            決めたことが3つあります。
          </h2>

          <div className="mt-12 space-y-4">
            {PILLARS.map((p) => (
              <div
                key={p.label}
                className="flex flex-col gap-5 rounded-card border border-line bg-canvas p-7 sm:flex-row sm:items-start sm:gap-8 sm:p-9"
              >
                <span className="shrink-0 text-3xl font-extrabold text-brand-gradient sm:text-4xl">
                  {p.label}
                </span>
                <div className="min-w-0">
                  <h3 className="text-lg font-bold leading-relaxed text-ink">{p.title}</h3>
                  <p className="mt-3 text-sm leading-8 text-ink-muted">{p.body}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── 3つの入口 ── */}
      <section id="roles" className="scroll-mt-20 border-b border-line bg-canvas">
        <div className="mx-auto max-w-6xl px-5 py-20 sm:py-24">
          <SectionLabel>3つの入口</SectionLabel>
          <h2 className="mt-5 text-2xl font-bold leading-relaxed text-ink sm:text-3xl">
            同じ記録を、それぞれの立場の言葉で。
          </h2>
          <p className="mt-5 max-w-2xl text-sm leading-8 text-ink-muted">
            1つのデータベースを、生徒・保護者・講師の3つの画面が別の角度から見ています。
            転記も、送り直しもありません。
          </p>

          <div className="mt-12 grid gap-5 md:grid-cols-3">
            {ROLES.map((r) => (
              <div key={r.who} className="flex flex-col rounded-card border border-line bg-surface p-7 shadow-card">
                <div className="flex items-center gap-3">
                  <span className="flex h-11 w-11 items-center justify-center rounded-field bg-brand-50 text-xl">
                    {r.icon}
                  </span>
                  <span className="text-lg font-bold text-ink">{r.who}</span>
                </div>
                <p className="mt-5 text-sm font-bold leading-relaxed text-brand-700">{r.lead}</p>
                <ul className="mt-4 space-y-2.5">
                  {r.items.map((it) => (
                    <li key={it} className="flex gap-2.5 text-sm leading-7 text-ink-muted">
                      <span aria-hidden className="mt-2.5 h-1.5 w-1.5 shrink-0 rounded-full bg-brand-300" />
                      <span>{it}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── できること ── */}
      <section id="features" className="scroll-mt-20 border-b border-line bg-surface">
        <div className="mx-auto max-w-6xl px-5 py-20 sm:py-24">
          <SectionLabel>できること</SectionLabel>
          <h2 className="mt-5 text-2xl font-bold leading-relaxed text-ink sm:text-3xl">
            土台はいつも同じ。上に載せるものは選べる。
          </h2>

          {/* コア */}
          <div className="mt-12">
            <h3 className="text-sm font-bold tracking-wide text-ink-faint">
              コア機能 ── どの塾でも常に使えます
            </h3>
            <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {CORE.map((c) => (
                <div key={c.title} className="rounded-card border border-line bg-canvas p-6">
                  <h4 className="text-sm font-bold text-ink">{c.title}</h4>
                  <p className="mt-2 text-sm leading-7 text-ink-muted">{c.body}</p>
                </div>
              ))}
            </div>
          </div>

          {/* モジュール */}
          <div className="mt-16">
            <h3 className="text-sm font-bold tracking-wide text-ink-faint">
              選べる機能 ── 教室グループごとにON／OFF
            </h3>
            <div className="mt-5 grid gap-5 md:grid-cols-2">
              {MODULES.map((m) => (
                <div
                  key={m.key}
                  className={
                    m.highlight
                      ? "rounded-card border border-brand-200 bg-brand-50/60 p-7 shadow-card transition duration-200 ease-out-soft hover:-translate-y-0.5 hover:shadow-card-hover"
                      : "rounded-card border border-line bg-surface p-7 shadow-card transition duration-200 ease-out-soft hover:-translate-y-0.5 hover:shadow-card-hover"
                  }
                >
                  <div className="flex items-start gap-4">
                    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-field bg-surface text-xl shadow-card">
                      {m.icon}
                    </span>
                    <div className="min-w-0">
                      <h4 className="text-base font-bold text-ink">{m.title}</h4>
                      <p className="mt-1 text-xs font-bold text-brand-700">{m.lead}</p>
                    </div>
                  </div>
                  <p className="mt-4 text-sm leading-7 text-ink-muted">{m.body}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── 差別化（塾内経済） ── */}
      <section className="relative overflow-hidden border-b border-line bg-brand-950">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-70"
          style={{
            backgroundImage:
              "radial-gradient(44rem 24rem at 80% 0%, rgba(139,92,246,0.35), transparent 60%), radial-gradient(36rem 20rem at 0% 100%, rgba(67,56,202,0.45), transparent 60%)",
          }}
        />
        <div className="relative mx-auto max-w-6xl px-5 py-20 sm:py-24">
          <div className="max-w-3xl">
            <span className="inline-flex items-center rounded-pill border border-white/25 bg-white/10 px-3.5 py-1 text-xs font-bold text-white/90">
              ほかにない機能
            </span>
            <h2 className="mt-6 text-2xl font-bold leading-relaxed text-white sm:text-3xl">
              塾そのものを、生徒が育てる。
            </h2>
            <p className="mt-6 text-sm leading-8 text-white/80 sm:text-base">
              出席した、小テストに受かった、教材を進めた、掃除をした。
              日々のがんばりにアカデミーコインが自動でつき、塾全体の伸びに連動して
              「自塾株」の株価が毎週動きます。生徒はコインで自塾株を売り買いできる。
              自分のがんばりが、塾の価値として返ってくる仕組みです。
            </p>
            <p className="mt-5 text-xs leading-7 text-white/60">
              ※ アカデミーコイン・自塾株は塾内だけのもので、現金価値は持ちません。
              使うかどうかは塾ごとに選べます（既定はOFF）。
            </p>
          </div>
        </div>
      </section>

      {/* ── 導入の流れ ── */}
      <section id="steps" className="scroll-mt-20 border-b border-line bg-canvas">
        <div className="mx-auto max-w-6xl px-5 py-20 sm:py-24">
          <SectionLabel>導入の流れ</SectionLabel>
          <h2 className="mt-5 text-2xl font-bold leading-relaxed text-ink sm:text-3xl">
            いきなり全部を変えません。
          </h2>

          <ol className="mt-12 grid gap-5 md:grid-cols-2 lg:grid-cols-4">
            {STEPS.map((s) => (
              <li key={s.n} className="rounded-card border border-line bg-surface p-7 shadow-card">
                <span className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-gradient text-sm font-bold text-white">
                  {s.n}
                </span>
                <h3 className="mt-5 text-base font-bold text-ink">{s.title}</h3>
                <p className="mt-3 text-sm leading-7 text-ink-muted">{s.body}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* ── FAQ ── */}
      <section id="faq" className="scroll-mt-20 border-b border-line bg-surface">
        <div className="mx-auto max-w-3xl px-5 py-20 sm:py-24">
          <SectionLabel>よくある質問</SectionLabel>
          <h2 className="mt-5 text-2xl font-bold text-ink sm:text-3xl">よくある質問</h2>

          <div className="mt-10 space-y-3">
            {FAQ.map((f) => (
              <details
                key={f.q}
                className="group rounded-card border border-line bg-canvas px-6 py-5 transition hover:border-brand-200"
              >
                <summary className="flex cursor-pointer list-none items-start justify-between gap-4 text-sm font-bold text-ink">
                  <span>{f.q}</span>
                  <span
                    aria-hidden
                    className="mt-0.5 shrink-0 text-lg leading-none text-brand-600 transition-transform duration-200 group-open:rotate-45"
                  >
                    +
                  </span>
                </summary>
                <p className="mt-4 text-sm leading-8 text-ink-muted">{f.a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* ── 問い合わせ ── */}
      <section id="contact" className="scroll-mt-20 bg-canvas-glow">
        <div className="mx-auto max-w-3xl px-5 py-20 sm:py-24">
          <div className="text-center">
            <SectionLabel>お問い合わせ</SectionLabel>
            <h2 className="mt-5 text-2xl font-bold leading-relaxed text-ink sm:text-3xl">
              まずは、動いている画面を見てください。
            </h2>
            <p className="mx-auto mt-5 max-w-xl text-sm leading-8 text-ink-muted">
              資料だけでは伝わらないので、オンラインで30分、実際の画面をお見せしています。
              「うちならこう使う」を一緒に考えるところからで大丈夫です。
            </p>
          </div>

          <div className="mt-12">
            <InquiryForm />
          </div>
        </div>
      </section>

      {/* ── フッター ── */}
      <footer className="border-t border-line bg-surface">
        <div className="mx-auto flex max-w-6xl flex-col gap-8 px-5 py-12 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <Logo size="sm" />
            <p className="mt-4 text-xs leading-6 text-ink-faint">
              学習塾のための学習管理プラットフォーム
              <br />
              運営: 株式会社地域教育工房
            </p>
          </div>
          <nav className="flex flex-wrap gap-x-8 gap-y-3 text-xs font-medium text-ink-muted">
            <a href="#why" className="transition hover:text-ink">なぜ作ったか</a>
            <a href="#roles" className="transition hover:text-ink">3つの入口</a>
            <a href="#features" className="transition hover:text-ink">できること</a>
            <a href="#steps" className="transition hover:text-ink">導入の流れ</a>
            <a href="#faq" className="transition hover:text-ink">よくある質問</a>
            <a href="#contact" className="transition hover:text-ink">お問い合わせ</a>
            <Link href="/" className="transition hover:text-ink">ログイン</Link>
          </nav>
        </div>
        <div className="border-t border-line">
          <p className="mx-auto max-w-6xl px-5 py-5 text-xs text-ink-faint">
            © {new Date().getFullYear()} つながるまなび / 株式会社地域教育工房
          </p>
        </div>
      </footer>
    </div>
  );
}
