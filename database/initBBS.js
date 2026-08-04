const sqlite3 = require("sqlite3").verbose();
const db = new sqlite3.Database("./database/bbs.db");

db.serialize(() => {
  // 板テーブル
  db.run(`CREATE TABLE IF NOT EXISTS boards (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    description TEXT,
    thread_count INTEGER DEFAULT 0
  )`);

  // スレッドテーブル
  db.run(`CREATE TABLE IF NOT EXISTS threads (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    board_id INTEGER NOT NULL,
    title TEXT NOT NULL,
    creator TEXT NOT NULL,
    created_at TEXT NOT NULL,
    reply_count INTEGER DEFAULT 0,
    FOREIGN KEY(board_id) REFERENCES boards(id)
  )`);

  // レス（コメント）テーブル
  db.run(`CREATE TABLE IF NOT EXISTS posts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    thread_id INTEGER NOT NULL,
    username TEXT NOT NULL,
    message TEXT NOT NULL,
    reply_to INTEGER,
    created_at TEXT NOT NULL,
    FOREIGN KEY(thread_id) REFERENCES threads(id),
    FOREIGN KEY(reply_to) REFERENCES posts(id)
  )`);
});

db.serialize(() => {
  // 初期板を作成（ID=1になる想定）
  db.run(`INSERT OR IGNORE INTO boards (id, name, description, thread_count) VALUES (1, ?, ?, 1)`,
    ["一般", "最初の板"]);

  // 初期スレッドを作成（ID=1になる想定）
  db.run(`INSERT OR IGNORE INTO threads (id, board_id, title, creator, created_at, reply_count) VALUES (1, 1, ?, ?, ?, 0)`,
    ["最初のスレッド", "管理者", new Date().toISOString()]);

  // 初期レスを作成（任意）
  db.run(`INSERT OR IGNORE INTO posts (id, thread_id, username, message, created_at) VALUES (1, 1, ?, ?, ?)`,
    ["管理者", "これはテスト投稿です。", new Date().toISOString()]);
});

db.close();
console.log("BBS DB initialized.");
