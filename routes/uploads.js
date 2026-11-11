const express = require("express");
const router = express.Router();
const multer = require("multer");
const path = require("path");
const storage = require("../storage");
const { serve, safeExt, MAX_UPLOAD_BYTES } = require("../fileServe");

function sanitizeFilename(name) {
  if (!name || !name.trim()) return null
  const invalidPattern = /[\\\/:*?"'<>|]/g;
  return invalidPattern.test(name) ? null : name;
}

// ファイルは一旦メモリで受け取り、そのまま Object Storage へ保存する(ディスクには書かない)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_UPLOAD_BYTES },
});

const receive = upload.fields([{ name: "image", maxCount: 1 }, { name: "filename", maxCount: 1 }]);

router.post(
  "/",
  (req, res, next) => {
    receive(req, res, (err) => {
      if (err) {
        const error =
          err.code === "LIMIT_FILE_SIZE"
            ? `アップロード失敗: ファイルサイズ制限を超えています(最大${Math.floor(MAX_UPLOAD_BYTES / 1024 / 1024)}MB)。`
            : `アップロード失敗: ${err.message}`;
        return res.json({ error, url: null });
      }
      next();
    });
  },
  async (req, res) => {
    if (!req.files || !req.files.image) {
      return res.json({ error: "アップロード失敗：ファイルが選択されていません。", url: null });
    }

    try {
      const file = req.files.image[0];
      const ext = safeExt(file.originalname);
      console.log("filename:", req.body.filename)
      let rawName = req.body.filename;
      if (!sanitizeFilename(rawName)) {
        rawName = path.basename(file.originalname, path.extname(file.originalname));
      }
      const baseName = rawName.replace(/[\\\/:*?"'<>|]/g, "");

      // 同名があれば -1, -2 ... を付けて Object Storage に保存
      const finalName = await storage.saveFile({
        bucket: "pubAssets",
        baseName,
        ext,
        data: file.buffer,
      });
      const url = `/pubAssets/${encodeURIComponent(finalName)}`;
      console.log("uploads.js: assets uploaded(name:", finalName, ", url:", url, ")");

      res.json({ error: null, url });
    } catch (err) {
      console.error("uploads.js: 保存に失敗:", err);
      res.json({ error: "アップロード失敗：サーバーエラーが発生しました。", url: null });
    }
  }
);

// /uploads/<ファイル名> : チャット画像(server の /upload-image で保存したもの)
router.get("/:name", serve("uploads"));

module.exports = router;
