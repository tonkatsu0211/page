// Neon Object Storage (S3互換) へのファイル保存・取得
//
// 必要な環境変数(値は Neon コンソールの Object storage / 認証情報の画面で確認):
//   S3_ENDPOINT           ブランチのエンドポイント URL (AWS_ENDPOINT_URL_S3 でも可)
//   S3_ACCESS_KEY_ID      認証情報の Access Key ID     (AWS_ACCESS_KEY_ID でも可)
//   S3_SECRET_ACCESS_KEY  認証情報の Secret Access Key (AWS_SECRET_ACCESS_KEY でも可)
//   S3_REGION             省略時は us-east-2
//   S3_BUCKET_UPLOADS     チャット画像のバケット名   (省略時 "uploads")
//   S3_BUCKET_PUBASSETS   公開アセットのバケット名   (省略時 "pubassets")
//
// バケットは Neon コンソールで作成しておく(アクセスレベルは Private のままでOK)。
// ファイルは各バケットの直下に、ファイル名そのままのキーで保存します。

const {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  ListObjectsV2Command,
} = require("@aws-sdk/client-s3");
const db = require("./db");

// 環境変数の前後の空白・改行・引用符(Neon の .env 表示のまま貼り付けた場合)を取り除く
const env = (...names) => {
  for (const n of names) {
    const v = (process.env[n] || "").trim().replace(/^["']|["']$/g, "").trim();
    if (v) return v;
  }
  return undefined;
};

const endpoint = env("S3_ENDPOINT", "AWS_ENDPOINT_URL_S3")?.replace(/\/+$/, "");
const accessKeyId = env("S3_ACCESS_KEY_ID", "AWS_ACCESS_KEY_ID");
const secretAccessKey = env("S3_SECRET_ACCESS_KEY", "AWS_SECRET_ACCESS_KEY");
// 論理名(コード内で使う名前) → 実際のバケット名
const BUCKETS = {
  uploads: env("S3_BUCKET_UPLOADS") || "uploads",
  pubAssets: env("S3_BUCKET_PUBASSETS") || "pubassets",
};
const bucketOf = (bucket) => {
  const b = BUCKETS[bucket];
  if (!b) throw new Error(`不明なバケット: ${bucket}`);
  return b;
};
const REGION = env("S3_REGION", "AWS_REGION") || "us-east-2";

const s3 = new S3Client({
  region: REGION,
  endpoint,
  forcePathStyle: true, // Neon Object Storage はパススタイルのみ対応
  credentials: accessKeyId && secretAccessKey ? { accessKeyId, secretAccessKey } : undefined,
  // 新しい SDK が既定で付けるチェックサム用ヘッダを、S3互換ストレージが受け付けない場合の対策
  requestChecksumCalculation: "WHEN_REQUIRED",
  responseChecksumValidation: "WHEN_REQUIRED",
});

function requireConfigured() {
  if (!endpoint) {
    throw new Error(
      "Object Storage の設定がありません。環境変数 S3_ENDPOINT / S3_ACCESS_KEY_ID / S3_SECRET_ACCESS_KEY を設定してください"
    );
  }
}

// 起動時の接続確認(失敗してもサーバーは止めず、原因が分かるログだけ出す)
async function check() {
  let host = endpoint;
  try { host = new URL(endpoint).host; } catch {}
  for (const logical of Object.keys(BUCKETS)) {
    const bucket = BUCKETS[logical];
    try {
      requireConfigured();
      await s3.send(new ListObjectsV2Command({ Bucket: bucket, MaxKeys: 1 }));
      console.log(`[storage] 接続OK (bucket: ${bucket})`);
    } catch (err) {
      const status = err.$metadata?.httpStatusCode;
      console.error(
        `[storage] bucket "${bucket}" に接続できません: ${err.name}: ${err.message}` +
          ` (HTTP ${status ?? "-"}, endpoint: ${host}, region: ${REGION},` +
          ` accessKeyId: ${accessKeyId ? accessKeyId.slice(0, 8) + "..." : "未設定"})`
      );
      if (status === 404 || err.name === "NoSuchBucket") {
        console.error(`[storage] → バケット "${bucket}" が存在しません。Neon のコンソールで作成済みか、名前が一致しているか確認してください`);
      } else if (status === 403 || err.name === "AccessDenied") {
        console.error("[storage] → 認証に失敗しました。Access Key ID / Secret が正しいか確認してください");
      }
    }
  }
}

// 名前を予約(同名なら連番)してから S3 へ保存し、確定したファイル名を返す。
// S3 への保存に失敗したら予約を取り消す。
async function saveFile({ bucket, baseName, ext = "", data }) {
  requireConfigured();
  const name = await db.reserveFile({ bucket, baseName, ext, size: data.length });
  try {
    await s3.send(
      new PutObjectCommand({
        Bucket: bucketOf(bucket),
        Key: name,
        Body: data,
        ContentLength: data.length,
      })
    );
  } catch (err) {
    await db.releaseFile(bucket, name).catch(() => {});
    throw err;
  }
  return name;
}

// 名前をそのまま保存(既存ファイルの移行用)。新規に保存したら true、既に登録済みなら false
async function putFile(bucket, name, data) {
  requireConfigured();
  if (!(await db.registerFile(bucket, name, data.length))) return false;
  try {
    await s3.send(
      new PutObjectCommand({
        Bucket: bucketOf(bucket),
        Key: name,
        Body: data,
        ContentLength: data.length,
      })
    );
  } catch (err) {
    await db.releaseFile(bucket, name).catch(() => {});
    throw err;
  }
  return true;
}

// ファイルを取得。無ければ null。range("bytes=0-99" 形式)を渡すと部分取得。
async function getObject(bucket, name, range) {
  requireConfigured();
  try {
    const out = await s3.send(
      new GetObjectCommand({
        Bucket: bucketOf(bucket),
        Key: name,
        ...(range ? { Range: range } : {}),
      })
    );
    return {
      body: out.Body, // Node.js の Readable
      contentLength: out.ContentLength,
      contentRange: out.ContentRange || null,
      etag: out.ETag || null,
    };
  } catch (err) {
    if (err.name === "NoSuchKey" || err.$metadata?.httpStatusCode === 404) return null;
    throw err;
  }
}

module.exports = { check, saveFile, putFile, getObject };
