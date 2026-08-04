const express = require("express");
const router = express.Router();
const path = require("path");
const usersPath = path.join(__dirname, "..", "users.json");
const sqlite3 = require("sqlite3").verbose();
const fs = require("fs");
let usersData = JSON.parse(fs.readFileSync(usersPath, "utf-8"));
const packageJsonPath = path.join(__dirname, '..', 'package.json');
const { version } = require(packageJsonPath);

function render(req, res, view, data = {}, locate = "", qName = "", q = "") {
  const qE = req.query.e || "";
  if (view == "error" && qE) {
    console.log(`redirect by 404 to /error?e=${qE}`);
  }
  const name = locate ? `${locate}/${view}` : view;
  const eName = locate ? qName ? `${locate}/${view}?${qName}=${q}` : `${locate}/${view}` : qName ? `${view}?${qName}=${q}` : view;
  res.render(name, { ...data, em: "false", version, origin, tag: "bbs", assets }, (err, html) => {
    if (err) {
      console.log(err);
      console.log(`404 at /${name} in render function`);
      res.status(404).render("error", {
        title: "404 Not Found",
        page: "error",
        ec: eName,
        em: "false",
        version,
        origin,
        tag: "error",
        assets
      });
    } else {
      console.log(`access to /${name} ... OK`);
      res.send(html);
    }
  });
}

const dbPath = path.join(__dirname, "../database/bbs.db");

function getDB() {
  return new sqlite3.Database(dbPath);
}

// 板一覧
router.get("/board", (req, res) => {
  const db = getDB();
  db.all("SELECT * FROM boards", [], (err, boards) => {
    db.close();
    if (err) return res.status(500).send("DB error");
    render(req, res, "board", { title: "12ch", top: "板一覧", page: "bbs/board", em: "false", boards, from: "none" }, "bbs");
  });
});

// スレッド表示
router.get("/thread", (req, res) => {
  const threadId = req.query.id;
  if (!threadId) return res.redirect("/bbs/board");
  const username = req.cookies.user || req.session.user;
  usersData = JSON.parse(fs.readFileSync(usersPath, "utf-8"));
  const userInfo = usersData.users[username];
  const isAdminValue = userInfo.isAdmin === "true";
  const db = getDB();
  db.get("SELECT * FROM threads WHERE id=?", [threadId], (err, thread) => {
    if (err || !thread) {
      db.close();
      return res.redirect("/bbs/board");
    }
    db.all(
      "SELECT * FROM posts WHERE thread_id=? ORDER BY id ASC",
      [threadId],
      (err2, posts) => {
        db.close();
        render(req, res, "thread", { title: "12ch", top: thread.title, page: "bbs/thread", em: "false", thread, posts, username: username, isAdmin: isAdminValue, from: "none" }, "bbs", "id", threadId);
      }
    );
  });
});

// スレッド作成
router.post("/thread/create", (req, res) => {
  const { board_id, title, creator } = req.body;
  if (!board_id || !title || !creator) return res.status(400).send("Invalid");

  const db = getDB();
  const created_at = new Date().toISOString();
  db.run(
    "INSERT INTO threads (board_id, title, creator, created_at) VALUES (?,?,?,?)",
    [board_id, title, creator, created_at],
    function (err) {
      if (err) return res.status(500).send("DB error");
      db.run(
        "UPDATE boards SET thread_count = thread_count + 1 WHERE id=?",
        [board_id]
      );
      res.redirect(`/bbs/thread?id=${this.lastID}`);
      db.close();
    }
  );
});

// レス投稿
router.post("/thread/post", (req, res) => {
  const { thread_id, username, message, reply_to } = req.body;
  if (!thread_id || !username || !message) return res.status(400).send("Invalid");

  const db = getDB();
  const created_at = new Date().toISOString();
  db.run(
    "INSERT INTO posts (thread_id, username, message, reply_to, created_at) VALUES (?,?,?,?,?)",
    [thread_id, username, message, reply_to || null, created_at],
    function (err) {
      if (err) return res.status(500).send("DB error");
      db.run(
        "UPDATE threads SET reply_count = reply_count + 1 WHERE id=?",
        [thread_id]
      );
      res.redirect(`/bbs/thread?id=${thread_id}`);
      db.close();
    }
  );
});

module.exports = router;
