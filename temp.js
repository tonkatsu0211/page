// 既存の public/uploads と public/pubAssets のファイルを Neon Object Storage へ移すスクリプト
//   使い方:  DATABASE_URL=... S3_ENDPOINT=... S3_BUCKET=... S3_ACCESS_KEY_ID=... S3_SECRET_ACCESS_KEY=... node migrate-files.js
// 何度実行しても安全です(登録済みの名前はスキップ)。元のファイルは削除しません。
const fs = require("fs");
const path = require("path");
const db = require("./db");
const storage = require("./storage");

const targets = [
  { bucket: "uploads", dir: path.join(__dirname, "public", "uploads") },
  { bucket: "pubAssets", dir: path.join(__dirname, "public", "pubAssets") },
];

(async () => {
  await db.init(); // files(台帳)テーブルが無ければ作る
  let added = 0, skipped = 0;
  const failed = [];
  for (const { bucket, dir } of targets) {
    if (!fs.existsSync(dir)) {
      console.log(`${dir} が無いのでスキップ`);
      continue;
    }
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (!entry.isFile()) continue;
      try {
        const data = fs.readFileSync(path.join(dir, entry.name));
        if (await storage.putFile(bucket, entry.name, data)) {
          added++;
          console.log(`移行: ${bucket}/${entry.name} (${data.length} bytes)`);
        } else {
          skipped++;
        }
      } catch (err) {
        // 1ファイルの失敗で全体を止めず、最後にまとめて報告する
        failed.push(`${bucket}/${entry.name}: ${err.name}: ${err.message}`);
        console.error(`失敗: ${bucket}/${entry.name}: ${err.name}: ${err.message}`);
      }
    }
  }
  console.log(`完了: 追加 ${added} 件 / 既にあるためスキップ ${skipped} 件 / 失敗 ${failed.length} 件`);
  if (failed.length) {
    console.log("失敗したファイル:\n" + failed.join("\n"));
    process.exitCode = 1;
  }
  await db.pool.end();
})().catch((err) => {
  console.error("移行に失敗:", err);
  process.exit(1);
});
