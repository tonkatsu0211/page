const express = require("express");
const router = express.Router();
const gamePage = "https://gwftq7.csb.app"

router.get(["/"], (req, res) => {
  render(req, res, "games", {
    title: "_tonkatsu_のページ",
    page: "games",
    top: "ゲームをプレイ",
    gamepage: gamePage
  }, "games");
});

router.get(["/:id", "/:id.html"], (req, res) => {
  let gameId = req.params.id
  if (gameId == "tetris"){
    return render(req, res, gameId, {}, "games", "games");
  }
  if (!gameId.endsWith(".html")) {
    if (gameId.endsWith(".ejs")) {
      gameId = gameId.replace(/\.ejs$/, ".html");
    } else {
      gameId = gameId + ".html";
    }
  }
  //gameId = gameId.replace(/\.(html|ejs)$/, "");
  //render(req, res, gameId, {}, "games");
  res.redirect(`${gamePage}/${gameId}`);
});

module.exports = router;