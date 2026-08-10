const express = require("express");
const router = express.Router();
const fs = require("fs");
const path = require("path");
const inv = ["https://qssx73-3000.csb.app", "https://qwn8gt-3000.csb.app"];
const htmlPath = path.join(__dirname, "../public/temp.html");

const user_agent = 
    process.env.USER_AGENT ||
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/86.0.4240.198 Safari/537.36";

async function getVideo(id) {
  for (let i = 0; i < 4; i++) {
    try{
      const r = await fetch(`${inv[Math.floor(i / 2)]}/api/v1/videos/${id}`);
      const re = await r.json();
      fs.writeFileSync(htmlPath, JSON.stringify(re, null, 2));
      if (!res.formatStreams) throw new Error("formatStreams not found");
      return re;
    } catch (e) {
      console.error(`error: ${e.message}`);
    }
  }
  throw new Error("fetch failed");
}

function sanitize(name) {
  return name
    .normalize("NFKC")
    .replace(/[\u0000-\u001F\u007F-\u009F]/g, "")
    .replace(/[\u200E\u200F\u202A-\u202E]/g, "")
    .replace(/[\\/:*?"<>|;]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

router.get("/yt/videos/:id", async (req, res) => {
  const videoId = req.params.id;
  try{
    if (!/^[a-zA-Z0-9_-]{11}$/.test(videoId)) throw new Error("videoId not vailed");
    const response = await getVideo(videoId);
    res.json(response);
  } catch (e) {
    return res.json(JSON.stringify(e, null, 2));
  }
});

router.get("/yt/download/:id", async (req, res) => {
  const info = await getVideo(req.params.id);
  const stream = await fetch(info.formatStreams[0].url);
  const safeTitle = sanitize(info.title);
  const encoded = encodeURIComponent(safeTitle)
  console.log([...safeTitle].map(c => c.charCodeAt(0)));
  res.setHeader(
    "Content-Disposition",
    `attachment; filename*=UTF-8''${encoded}.mp4`
  );
  res.setHeader("Content-Type", "video/mp4");

  stream.body.pipe(res);
});

router.get("/scratch/messages/:id", async (req, res) => {
  const username = req.params.id;
  try{
    const url = `https://api.scratch.mit.edu/users/${username}/messages/count`;
    const response = await fetch(url);
    const r = await response.json();
    res.json(r);
  } catch (e) {
    return res.json(JSON.stringify(e, null, 2));
  }
});

router.post("/html", async (req, res) => {
  const { url } = req.body;
  try {
    new URL(url);
  } catch {
    return res.status(400).send("無効なURLです");
  }

  try {
    const r = await fetch(url, {
      headers: {
        "User-Agent": user_agent
      }
    });

    const html = await r.text();

    res.type("text/plain").send(html);
  } catch (e) {
    console.error(e);
    res.status(500).send(e.message);
  }
});

module.exports = router;