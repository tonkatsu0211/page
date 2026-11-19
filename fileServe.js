// Neon Object Storage に保存したファイルを配信する共通処理(URL は従来のまま /uploads/xxx, /pubAssets/xxx)
const path = require("path");
const storage = require("./storage");

// 1ファイルあたりの上限(MB)。環境変数で変更できる(小数も可。例: 0.5)
//   MAX_UPLOAD_MB_UPLOADS    ... /upload-image(チャット画像)の上限
//   MAX_UPLOAD_MB_PUBASSETS  ... /uploads の POST(公開アセット)の上限
//   MAX_UPLOAD_MB            ... 上の2つを個別に指定しなかった場合の共通値(既定 10)
const toBytes = (v) => (Number(v) > 0 ? Number(v) * 1024 * 1024 : null);
const DEFAULT_BYTES = toBytes(process.env.MAX_UPLOAD_MB) || 10 * 1024 * 1024;
const MAX_BYTES = {
  uploads: toBytes(process.env.MAX_UPLOAD_MB_UPLOADS) || DEFAULT_BYTES,
  pubAssets: toBytes(process.env.MAX_UPLOAD_MB_PUBASSETS) || DEFAULT_BYTES,
};

// エラーメッセージ用("10MB" / "0.5MB")
const formatLimit = (bytes) => `${Math.round((bytes / 1024 / 1024) * 100) / 100}MB`;

// 拡張子は ".png" のような英数字のみ許可(それ以外は拡張子なし扱い)
function safeExt(originalname) {
  const ext = path.extname(originalname || "");
  return /^\.[A-Za-z0-9]{1,10}$/.test(ext) ? ext : "";
}

// ブラウザで直接開くとスクリプトが動いてしまう種類は、表示ではなくダウンロードにする
const RISKY_TYPES = ["text/html", "application/xhtml+xml", "text/javascript", "application/javascript"];

function serve(bucket) {
  return async (req, res, next) => {
    try {
      const name = req.params.name;
      const obj = await storage.getObject(bucket, name, req.headers.range);
      if (!obj) return next(); // 無ければ通常の 404 へ

      res.type(path.extname(name).slice(1) || "bin");
      const type = String(res.get("Content-Type") || "");
      if (RISKY_TYPES.some((t) => type.startsWith(t))) {
        res.set("Content-Disposition", "attachment");
      }
      if (type.startsWith("image/svg")) {
        res.set("Content-Security-Policy", "sandbox");
      }
      res.set("X-Content-Type-Options", "nosniff");
      res.set("Accept-Ranges", "bytes"); // 動画・音声のシークに必要
      // 同じ名前のファイルは上書きされないので長期キャッシュしてよい
      res.set("Cache-Control", "public, max-age=31536000, immutable");
      if (obj.etag) res.set("ETag", obj.etag);

      if (obj.contentRange) {
        res.status(206);
        res.set("Content-Range", obj.contentRange);
      } else if (req.fresh) {
        obj.body.destroy?.();
        return res.status(304).end();
      }
      if (obj.contentLength != null) res.set("Content-Length", String(obj.contentLength));
      if (req.method === "HEAD") {
        obj.body.destroy?.();
        return res.end();
      }

      obj.body.on("error", (err) => {
        console.error("ファイル配信中のエラー:", err.message);
        res.destroy(err);
      });
      obj.body.pipe(res);
    } catch (err) {
      if (err.$metadata?.httpStatusCode === 416) return res.status(416).end();
      next(err);
    }
  };
}

module.exports = { serve, safeExt, MAX_BYTES, formatLimit };
