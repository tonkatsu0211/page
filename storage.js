// Neon Object Storage (S3互換) へのファイル保存・取得
//
// 必要な環境変数(値は Neon コンソールの Object storage / 認証情報の画面で確認):
//   S3_ENDPOINT           ブランチのエンドポイント URL (AWS_ENDPOINT_URL_S3 でも可)
//   S3_ACCESS_KEY_ID      認証情報の Access Key ID     (AWS_ACCESS_KEY_ID でも可)
//   S3_SECRET_ACCESS_KEY  認証情報の Secret Access Key (AWS_SECRET_ACCESS_KEY でも可)
//   S3_BUCKET             バケット名 (コンソールで作成。アクセスレベルは private のままでOK)
//   S3_REGION             省略時は us-east-2
//
// 1つのバケットの中に "uploads/<name>" と "pubAssets/<name>" というキーで保存します。

const {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
} = require("@aws-sdk/client-s3");
const db = require("./db");

const endpoint = process.env.S3_ENDPOINT || process.env.AWS_ENDPOINT_URL_S3;
const accessKeyId = process.env.S3_ACCESS_KEY_ID || process.env.AWS_ACCESS_KEY_ID;
const secretAccessKey = process.env.S3_SECRET_ACCESS_KEY || process.env.AWS_SECRET_ACCESS_KEY;
const BUCKET = process.env.S3_BUCKET;

const s3 = new S3Client({
  region: process.env.S3_REGION || process.env.AWS_REGION || "us-east-2",
  endpoint,
  forcePathStyle: true, // Neon Object Storage はパススタイルのみ対応
  credentials: accessKeyId && secretAccessKey ? { accessKeyId, secretAccessKey } : undefined,
  // 新しい SDK が既定で付けるチェックサム用ヘッダを、S3互換ストレージが受け付けない場合の対策
  requestChecksumCalculation: "WHEN_REQUIRED",
  responseChecksumValidation: "WHEN_REQUIRED",
});

const keyOf = (bucket, name) => `${bucket}/${name}`;

function requireConfigured() {
  if (!BUCKET || !endpoint) {
    throw new Error(
      "Object Storage の設定がありません。環境変数 S3_ENDPOINT / S3_BUCKET / S3_ACCESS_KEY_ID / S3_SECRET_ACCESS_KEY を設定してください"
    );
  }
}

// 起動時の接続確認(失敗してもサーバーは止めず、ログだけ出す)
async function check() {
  try {
    requireConfigured();
    await s3.send(new HeadBucketCommand({ Bucket: BUCKET }));
    console.log(`[storage] Object Storage に接続できました (bucket: ${BUCKET})`);
  } catch (err) {
    console.error("[storage] Object Storage に接続できません:", err.message);
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
        Bucket: BUCKET,
        Key: keyOf(bucket, name),
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
        Bucket: BUCKET,
        Key: keyOf(bucket, name),
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
        Bucket: BUCKET,
        Key: keyOf(bucket, name),
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
