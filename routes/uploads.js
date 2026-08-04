const express = require("express");
const router = express.Router();
const multer = require("multer");
const path = require("path");
const fs = require("fs")

function sanitizeFilename(name) {
  if (!name || !name.trim()) return null
  const invalidPattern = /[\\\/:*?"'<>|]/g;
  return invalidPattern.test(name) ? null : name;
}

function getUniqueFilename(dir, baseName, ext) {
  let filename = baseName + ext;
  let counter = 1;
  while (fs.existsSync(path.join(dir, filename))) {
    filename = `${baseName}-${counter}${ext}`;
    counter++;
  }
  return filename;
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, path.join(__dirname, "../public/pubAssets"));
  },
  filename: (req, file, cb) => {
    const dir = path.join(__dirname, "../public/pubAssets");
    const ext = path.extname(file.originalname);
    console.log("filename:", req.body.filename)
    let rawName = req.body.filename;
    if (!sanitizeFilename(rawName)) {
      rawName = path.basename(file.originalname, ext);
    }
    const safeName = rawName.replace(/[\\\/:*?"'<>|]/g, "");
    const safeName2 = getUniqueFilename(dir, safeName, ext)
    const finalName = safeName2.replace(/[ 　]/g, "_")
    cb(null, finalName);
  }
});

const upload = multer({ storage });

router.post("/", upload.fields([{ name: "image", maxCount: 1 }, { name: "filename", maxCount: 1 }]), (req, res) => {
  if (!req.files || !req.files.image) {
    return res.json({ error: "アップロード失敗：ファイルが選択されていません。", url: null });
  }

  const file = req.files.image[0];
  const url = `/pubAssets/${file.filename}`;
  console.log("uploads.js: assets uploaded(name:", file.filename, ", url:", url, ")");

  res.json({ error: null, url });
});

module.exports = router;
