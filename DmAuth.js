// DM 用の認証。
// 既存のチャットは「user / uid の cookie」をそのまま信用していて、誰でも他人の uid を名乗れます。
// DM では他人の会話を読まれないよう、ログイン時にサーバーが署名したトークン(httpOnly cookie)を発行し、
// ページ表示と Socket 接続の両方でそれを検証します。
//
// 署名用の秘密鍵は環境変数 DM_SECRET に長いランダム文字列を設定してください。
//   例: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
// 未設定でも動きますが、起動のたびに鍵が変わり、再起動後は全員ログインし直しになります。

const crypto = require("crypto");

const COOKIE_NAME = "dm_token";
const DAY = 24 * 60 * 60 * 1000;

let SECRET = process.env.DM_SECRET;
if (!SECRET) {
  SECRET = crypto.randomBytes(32).toString("hex");
  console.log(`DM_SECRET: ${SECRET}`);
  console.warn("[dm] DM_SECRET が未設定です。再起動のたびに DM のログインが無効になります。");
}

const sign = (payload) =>
  crypto.createHmac("sha256", SECRET).update(payload).digest("base64url");

function issueToken(uid, ttlMs) {
  const payload = Buffer.from(JSON.stringify({ u: uid, e: Date.now() + ttlMs })).toString("base64url");
  return payload + "." + sign(payload);
}

// 正しいトークンなら uid を返し、改ざん・期限切れ・不正な形式なら null
function verifyToken(token) {
  if (typeof token !== "string") return null;
  const [payload, sig] = token.split(".");
  if (!payload || !sig) return null;
  const a = Buffer.from(sig);
  const b = Buffer.from(sign(payload));
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const { u, e } = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    if (typeof u !== "string" || !u || !(e > Date.now())) return null;
    return u;
  } catch {
    return null;
  }
}

// "a=1; b=2" 形式の Cookie ヘッダーから値を取り出す
function getCookie(header, name) {
  if (typeof header !== "string") return undefined;
  for (const part of header.split(";")) {
    const i = part.indexOf("=");
    if (i === -1) continue;
    if (part.slice(0, i).trim() === name) {
      try {
        return decodeURIComponent(part.slice(i + 1).trim());
      } catch {
        return undefined;
      }
    }
  }
  return undefined;
}

// Cookie ヘッダー(HTTP でも Socket のハンドシェイクでも同じ形)から、ログイン中の uid を返す。
// 既存のログアウト処理が user cookie を "system:logouted" にするので、その場合は未ログイン扱い。
function uidFromCookieHeader(header) {
  if (getCookie(header, "user") === "system:logouted") return null;
  return verifyToken(getCookie(header, COOKIE_NAME));
}

// ログイン / サインアップ成功時に呼ぶ。save が true なら1年間保持、false ならブラウザを閉じるまで。
function setDmCookie(res, uid, save) {
  res.cookie(COOKIE_NAME, issueToken(uid, save ? 365 * DAY : 30 * DAY), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    ...(save ? { maxAge: 365 * DAY } : {}),
  });
}

module.exports = { COOKIE_NAME, issueToken, verifyToken, getCookie, uidFromCookieHeader, setDmCookie };
