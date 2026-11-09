const express = require("express");
const router = express.Router();
const { serve } = require("../fileServe");

// /pubAssets/<ファイル名> : routes/uploads.js の POST で保存したファイル
router.get("/:name", serve("pubAssets"));

module.exports = router;
