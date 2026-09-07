"use client";

// 選んだファイルを、AIに渡せる形（base64）に直す。
//
// スマホで撮った写真はそのままだと4〜8MBあり、Vercelのリクエスト上限（4.5MB）を超える。
// 送る前にブラウザで縮めてから base64 にする。文字が読めれば足りるので、長辺1600px・
// JPEG品質0.82 くらいまで落とす（A4のプリント1枚でおおむね300〜600KB）。
//
// PDFはブラウザで加工せずそのまま送る（Claude / Gemini がページを読む）。

export type PreparedFile = {
  mediaType: string;
  /** base64（"data:" の接頭辞なし） */
  data: string;
  name: string;
  /** 送るときの大きさ（バイト） */
  bytes: number;
};

/** 送信できる形式 */
export const ACCEPT = "image/jpeg,image/png,image/webp,application/pdf";

const MAX_EDGE = 1600;
const JPEG_QUALITY = 0.82;

/** data URL から base64 の中身だけ取り出す */
function stripDataUrl(dataUrl: string): string {
  const i = dataUrl.indexOf(",");
  return i === -1 ? dataUrl : dataUrl.slice(i + 1);
}

function readAsDataUrl(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result ?? ""));
    r.onerror = () => reject(new Error("ファイルを読めませんでした"));
    r.readAsDataURL(file);
  });
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("画像を開けませんでした"));
    img.src = src;
  });
}

/** 写真を長辺1600pxまで縮めてJPEGにする。縮める必要がなければそのまま */
async function shrinkImage(file: File): Promise<{ dataUrl: string; mediaType: string }> {
  const original = await readAsDataUrl(file);
  const img = await loadImage(original);
  const long = Math.max(img.width, img.height);
  if (long <= MAX_EDGE && file.size <= 1_200_000) {
    return { dataUrl: original, mediaType: file.type };
  }
  const scale = Math.min(1, MAX_EDGE / long);
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(img.width * scale);
  canvas.height = Math.round(img.height * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) return { dataUrl: original, mediaType: file.type };
  // 白で塗ってから描く（透過PNGをJPEGにすると黒くつぶれるため）
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  return { dataUrl: canvas.toDataURL("image/jpeg", JPEG_QUALITY), mediaType: "image/jpeg" };
}

/** 1ファイルを送信できる形に直す */
export async function prepareFile(file: File): Promise<PreparedFile> {
  if (file.type === "application/pdf") {
    const dataUrl = await readAsDataUrl(file);
    const data = stripDataUrl(dataUrl);
    return { mediaType: "application/pdf", data, name: file.name, bytes: file.size };
  }
  const { dataUrl, mediaType } = await shrinkImage(file);
  const data = stripDataUrl(dataUrl);
  return {
    mediaType,
    data,
    name: file.name,
    bytes: Math.ceil((data.length * 3) / 4),
  };
}

/** 複数ファイルをまとめて直す */
export async function prepareFiles(files: File[]): Promise<PreparedFile[]> {
  const out: PreparedFile[] = [];
  for (const f of files) out.push(await prepareFile(f));
  return out;
}

/** 人が読める大きさ表示 */
export function formatBytes(n: number): string {
  if (n < 1024) return `${n}B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)}KB`;
  return `${(n / (1024 * 1024)).toFixed(1)}MB`;
}
