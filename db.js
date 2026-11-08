// PostgreSQL へのアクセスをまとめたモジュール(チャットのユーザー / 履歴 / BAN / 投票)
//
// 接続先は環境変数 DATABASE_URL (例: postgres://user:pass@host:5432/dbname)
// DATABASE_URL が無い場合は PGHOST / PGUSER / PGPASSWORD / PGDATABASE などの標準環境変数を使います。
// SSL が必要なホスティングでは PGSSL=true を指定してください。

const fs = require("fs");
const path = require("path");
const { Pool } = require("pg");
const { v4: uuidv4 } = require("uuid");

// 移行元の JSON (DBへ移したあとは読み取り専用の「移行元」として残すだけで、書き込みはしません)
const usersJsonPath = path.join(__dirname, "users.json");
const bannedJsonPath = path.join(__dirname, "bannedUsers.json");
const historyJsonPath = path.join(__dirname, "chatHistory.json");
const voteJsonPath = path.join(__dirname, "vote.json");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.PGSSL === "true" ? { rejectUnauthorized: false } : undefined,
});
pool.on("error", (err) => console.error("[db] pool error:", err));

/* ------------------------------------------------------------------ */
/* スキーマ                                                            */
/* ------------------------------------------------------------------ */

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS schema_migrations (
  name       TEXT PRIMARY KEY,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS users (
  username      TEXT PRIMARY KEY,
  password_hash TEXT NOT NULL,
  uid           TEXT NOT NULL UNIQUE,
  is_admin      BOOLEAN NOT NULL DEFAULT FALSE,
  super_admin   BOOLEAN NOT NULL DEFAULT FALSE,
  color         TEXT NOT NULL DEFAULT '#aaa',
  extra         JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS banned_users (
  uid       TEXT PRIMARY KEY,
  banned_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS chat_messages (
  seq           BIGSERIAL PRIMARY KEY,
  id            TEXT NOT NULL UNIQUE,
  username      TEXT NOT NULL,
  uid           TEXT,
  message       TEXT NOT NULL,
  posted_at     TEXT NOT NULL,
  ipv4          TEXT,
  ipv6          TEXT,
  is_admin      BOOLEAN,
  super_admin   BOOLEAN,
  reply_to      TEXT,
  reply_msg     TEXT,
  deleted       BOOLEAN NOT NULL DEFAULT FALSE,
  del_message   TEXT,
  from_user     TEXT,
  from_uid      TEXT,
  from_uid_show TEXT,
  to_user       TEXT,
  to_uid        TEXT,
  to_uid_show   TEXT
);

CREATE TABLE IF NOT EXISTS votes (
  target     TEXT PRIMARY KEY,
  vote_count INTEGER NOT NULL DEFAULT 0
);
`;

/* ------------------------------------------------------------------ */
/* 小さなユーティリティ                                                */
/* ------------------------------------------------------------------ */

// PostgreSQL の TEXT は NUL 文字を保存できないので取り除く
const toText = (v) =>
  v === undefined || v === null ? null : String(v).replace(/\u0000/g, "");
const toBool = (v) =>
  v === undefined || v === null ? null : v === true || v === "true";

function readJsonFile(file) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf-8"));
  } catch (err) {
    if (err.code === "ENOENT") return null;
    throw err;
  }
}

// users.json の users 部分(読めなければ空)
function readUsersJson() {
  try {
    return readJsonFile(usersJsonPath)?.users ?? {};
  } catch (err) {
    console.error("[db] users.json の読み込みに失敗:", err.message);
    return {};
  }
}

const has = (obj, key) => Object.prototype.hasOwnProperty.call(obj, key);

function rowToUser(r) {
  if (!r) return null;
  return {
    username: r.username,
    passwordHash: r.password_hash,
    uid: r.uid,
    isAdmin: r.is_admin,
    superAdmin: r.super_admin,
    color: r.color,
  };
}

// DBの行 → 従来の chatHistory.json と同じ形のメッセージオブジェクト
function rowToMessage(r) {
  if (!r) return null;
  const m = { id: r.id, username: r.username };
  if (r.uid !== null) m.uid = r.uid;
  m.message = r.message;
  m.timestamp = r.posted_at;
  if (r.ipv4 !== null) m.ipv4 = r.ipv4;
  if (r.ipv6 !== null) m.ipv6 = r.ipv6;
  if (r.is_admin !== null) {
    // 通常の投稿メッセージ
    m.isAdmin = r.is_admin;
    m.superAdmin = r.super_admin === true;
    m.replyTo = r.reply_to;
    m.replyMsg = r.reply_msg;
  } else {
    if (r.reply_to !== null) m.replyTo = r.reply_to;
    if (r.reply_msg !== null) m.replyMsg = r.reply_msg;
  }
  if (r.deleted) {
    m.deleted = true;
    if (r.del_message !== null) m.delMessage = r.del_message;
  }
  if (r.from_user !== null) m.from = r.from_user;
  if (r.from_uid !== null) m.fromUid = r.from_uid;
  if (r.from_uid_show !== null) m.fromUidShow = r.from_uid_show;
  if (r.to_user !== null) m.to = r.to_user;
  if (r.to_uid !== null) m.toUid = r.to_uid;
  if (r.to_uid_show !== null) m.toUidShow = r.to_uid_show;
  return m;
}

/* ------------------------------------------------------------------ */
/* ユーザー                                                            */
/* ------------------------------------------------------------------ */

async function getUserByName(username) {
  if (typeof username !== "string" || !username) return null;
  const { rows } = await pool.query("SELECT * FROM users WHERE username = $1", [
    username,
  ]);
  return rowToUser(rows[0]);
}

async function getUserByUid(uid) {
  if (typeof uid !== "string" || !uid) return null;
  const { rows } = await pool.query("SELECT * FROM users WHERE uid = $1", [uid]);
  return rowToUser(rows[0]);
}

const USER_KNOWN_KEYS = new Set([
  "passwordHash",
  "uid",
  "isAdmin",
  "superAdmin",
  "color",
]);

// users.json のユーザー1件を DB に移す。
// uid を持たない古いユーザーには、従来の uid 付与処理と同じ形式で uid を発行する。
async function migrateUserFromJson(username, entry) {
  if (!entry || typeof entry.passwordHash !== "string" || !entry.passwordHash) {
    return null; // パスワードの無いエントリはログインできないので移行しない
  }

  const uid = entry.uid || "'UID'-" + uuidv4();
  if (!entry.uid) {
    console.log(`UIDを発行: ${username} => ${uid}`);
  }

  const extra = {};
  for (const [k, v] of Object.entries(entry)) {
    if (!USER_KNOWN_KEYS.has(k)) extra[k] = v; // publicKey など未知のフィールドも失わない
  }

  // 同名ユーザーが既にいる / 同じ uid が別名(名前変更後)で既にDBにある場合は
  // ON CONFLICT で何もしない = 二重登録しない
  await pool.query(
    `INSERT INTO users (username, password_hash, uid, is_admin, super_admin, color, extra)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT DO NOTHING`,
    [
      username,
      entry.passwordHash,
      uid,
      entry.isAdmin === "true" || entry.isAdmin === true,
      !!entry.superAdmin,
      entry.color || "#aaa",
      JSON.stringify(extra),
    ]
  );

  // 自分が入れた(または既に入っていた)行だけを返す
  let { rows } = await pool.query("SELECT * FROM users WHERE uid = $1", [uid]);
  if (!rows[0] && !entry.uid) {
    // uid を新規発行した場合のみ: 同時リクエストで先に移行された行を拾う
    ({ rows } = await pool.query("SELECT * FROM users WHERE username = $1", [
      username,
    ]));
  }
  if (rows[0] && rows[0].username === username) {
    console.log(`JSONからDBへユーザーを移行: ${username}`);
  }
  return rowToUser(rows[0]);
}

// ユーザー名で探す。DBに無く users.json にだけ存在する場合は DB に移してから返す。
async function findUserOrMigrate(username) {
  if (typeof username !== "string" || !username) return null;
  const existing = await getUserByName(username);
  if (existing) return existing;

  const jsonUsers = readUsersJson();
  if (!has(jsonUsers, username)) return null;
  const entry = jsonUsers[username];

  // 名前変更済みで、同じ uid が別名でDBにあるなら「移行済み」なので存在しない扱い
  if (entry && entry.uid && (await getUserByUid(entry.uid))) return null;

  return migrateUserFromJson(username, entry);
}

// uid で探す。DBに無く users.json にだけ存在する場合は DB に移してから返す。
async function findUserByUidOrMigrate(uid) {
  if (typeof uid !== "string" || !uid) return null;
  const existing = await getUserByUid(uid);
  if (existing) return existing;

  const jsonUsers = readUsersJson();
  for (const [name, entry] of Object.entries(jsonUsers)) {
    if (entry && entry.uid === uid) {
      return migrateUserFromJson(name, entry);
    }
  }
  return null;
}

async function getUsernameByUid(uid) {
  return (await findUserByUidOrMigrate(uid))?.username ?? null;
}

async function getAdminUsernames() {
  const { rows } = await pool.query(
    "SELECT username FROM users WHERE is_admin = TRUE"
  );
  return rows.map((r) => r.username);
}

// 新規登録。ユーザー名が重複していたら false
async function createUser({ username, passwordHash, uid, isAdmin = false, color = "#aaa" }) {
  try {
    await pool.query(
      `INSERT INTO users (username, password_hash, uid, is_admin, color)
       VALUES ($1, $2, $3, $4, $5)`,
      [username, passwordHash, uid, isAdmin, color]
    );
    return true;
  } catch (err) {
    if (err.code === "23505") return false; // unique_violation
    throw err;
  }
}

async function setAdmin(username, isAdmin) {
  await pool.query("UPDATE users SET is_admin = $2 WHERE username = $1", [
    username,
    isAdmin,
  ]);
}

async function setPasswordHash(username, hash) {
  await pool.query("UPDATE users SET password_hash = $2 WHERE username = $1", [
    username,
    hash,
  ]);
}

async function setColor(username, color) {
  await pool.query("UPDATE users SET color = $2 WHERE username = $1", [
    username,
    color,
  ]);
}

// 名前変更。移行先の名前が使われていたら false
async function renameUser(oldName, newName) {
  try {
    const r = await pool.query(
      "UPDATE users SET username = $2 WHERE username = $1",
      [oldName, newName]
    );
    return r.rowCount > 0;
  } catch (err) {
    if (err.code === "23505") return false;
    throw err;
  }
}

// GET /users 用。パスワードハッシュ等は含めない。
// まだDBに移行されていない users.json のユーザーも一覧には載せる(読み取りのみ)。
async function getAllUsersPublic() {
  const { rows } = await pool.query("SELECT * FROM users");
  const result = {};
  const dbUids = new Set();
  for (const r of rows) {
    dbUids.add(r.uid);
    result[r.username] = {
      uid: r.uid,
      isAdmin: r.is_admin ? "true" : "false",
      color: r.color,
    };
    if (r.super_admin) result[r.username].superAdmin = true;
    if (r.extra && r.extra.publicKey) result[r.username].publicKey = r.extra.publicKey;
  }
  for (const [name, info] of Object.entries(readUsersJson())) {
    if (has(result, name) || !info || (info.uid && dbUids.has(info.uid))) continue;
    result[name] = {
      uid: info.uid,
      isAdmin: info.isAdmin === "true" || info.isAdmin === true ? "true" : "false",
      color: info.color || "#aaa",
    };
    if (info.superAdmin) result[name].superAdmin = true;
    if (info.publicKey) result[name].publicKey = info.publicKey;
  }
  return result;
}

/* ------------------------------------------------------------------ */
/* BAN                                                                 */
/* ------------------------------------------------------------------ */

async function isBanned(uid) {
  if (typeof uid !== "string" || !uid) return false;
  const { rowCount } = await pool.query(
    "SELECT 1 FROM banned_users WHERE uid = $1",
    [uid]
  );
  return rowCount > 0;
}

async function addBan(uid) {
  await pool.query(
    "INSERT INTO banned_users (uid) VALUES ($1) ON CONFLICT DO NOTHING",
    [uid]
  );
}

async function removeBan(uid) {
  await pool.query("DELETE FROM banned_users WHERE uid = $1", [uid]);
}

async function getBannedUids() {
  const { rows } = await pool.query(
    "SELECT uid FROM banned_users ORDER BY banned_at, uid"
  );
  return rows.map((r) => r.uid);
}

/* ------------------------------------------------------------------ */
/* チャット履歴                                                        */
/* ------------------------------------------------------------------ */

async function insertMessage(m, client = pool) {
  await client.query(
    `INSERT INTO chat_messages
       (id, username, uid, message, posted_at, ipv4, ipv6, is_admin, super_admin,
        reply_to, reply_msg, deleted, del_message,
        from_user, from_uid, from_uid_show, to_user, to_uid, to_uid_show)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)
     ON CONFLICT (id) DO NOTHING`,
    [
      toText(m.id) ?? uuidv4(),
      toText(m.username) ?? "",
      toText(m.uid),
      toText(m.message) ?? "",
      toText(m.timestamp) ?? "",
      toText(m.ipv4),
      toText(m.ipv6),
      toBool(m.isAdmin),
      toBool(m.superAdmin),
      toText(m.replyTo),
      toText(m.replyMsg),
      toBool(m.deleted) ?? false,
      toText(m.delMessage),
      toText(m.from),
      toText(m.fromUid),
      toText(m.fromUidShow),
      toText(m.to),
      toText(m.toUid),
      toText(m.toUidShow),
    ]
  );
}

// 指定 uid のユーザーに見せる履歴(他人の /tell は除外)。limit を渡すと新しい方から limit 件。
async function getHistory(uid, { limit = null } = {}) {
  const myUid = uid == null ? "" : String(uid);
  const isOwner = myUid.replace(/&#39;/g, "'") === "'UID'-tonkatsu";
  const { rows } = await pool.query(
    `SELECT * FROM (
       SELECT * FROM chat_messages
       WHERE username <> 'systemC3'
          OR to_uid = $1::text
          OR from_uid = $1::text
          OR $2::boolean
       ORDER BY seq DESC
       LIMIT $3::int
     ) t
     ORDER BY seq ASC`,
    [myUid, isOwner, limit]
  );
  return rows.map(rowToMessage);
}

async function getMessageById(id) {
  const { rows } = await pool.query("SELECT * FROM chat_messages WHERE id = $1", [
    String(id),
  ]);
  return rowToMessage(rows[0]);
}

// 返信元の本文(無ければ null)
async function getMessageText(id) {
  const { rows } = await pool.query(
    "SELECT message FROM chat_messages WHERE id = $1",
    [String(id)]
  );
  return rows[0]?.message || null;
}

async function markMessageDeleted(id, delMessage) {
  await pool.query(
    `UPDATE chat_messages
        SET deleted = TRUE,
            del_message = $2,
            reply_msg = CASE WHEN reply_to IS NOT NULL THEN NULL ELSE reply_msg END
      WHERE id = $1`,
    [String(id), delMessage]
  );
}

async function restoreMessage(id) {
  await pool.query(
    `UPDATE chat_messages c
        SET deleted = FALSE,
            del_message = NULL,
            reply_msg = CASE
              WHEN c.reply_to IS NOT NULL
              THEN (SELECT p.message FROM chat_messages p WHERE p.id = c.reply_to)
              ELSE c.reply_msg
            END
      WHERE c.id = $1`,
    [String(id)]
  );
}

async function deleteMessage(id) {
  await pool.query("DELETE FROM chat_messages WHERE id = $1", [String(id)]);
}

async function clearMessages() {
  await pool.query("DELETE FROM chat_messages");
}

/* ------------------------------------------------------------------ */
/* 投票                                                                */
/* ------------------------------------------------------------------ */

// 既に存在する投票先にだけ +1。存在しない投票先なら null
async function incrementVote(target) {
  const { rows } = await pool.query(
    "UPDATE votes SET vote_count = vote_count + 1 WHERE target = $1 RETURNING vote_count",
    [String(target)]
  );
  return rows[0] ? rows[0].vote_count : null;
}

/* ------------------------------------------------------------------ */
/* 初期化 / JSON からの一括移行                                        */
/* ------------------------------------------------------------------ */

// 一度だけ実行する移行処理。成功したら schema_migrations に記録して、以後は実行しない。
// (JSON を読み直して BAN解除や削除が元に戻ってしまうのを防ぐため)
async function importOnce(name, fn) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
      "tonkatsu-import:" + name,
    ]);
    const done = await client.query(
      "SELECT 1 FROM schema_migrations WHERE name = $1",
      [name]
    );
    if (done.rowCount === 0) {
      const count = await fn(client);
      await client.query("INSERT INTO schema_migrations (name) VALUES ($1)", [name]);
      console.log(`[db] ${name}: JSON から ${count} 件を移行しました`);
    }
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    console.error(`[db] ${name} の移行に失敗しました(次回起動時に再試行します):`, err);
  } finally {
    client.release();
  }
}

async function importBannedUsers(client) {
  const json = readJsonFile(bannedJsonPath);
  const list = Array.isArray(json?.users) ? json.users : [];
  let n = 0;
  for (const uid of list) {
    if (typeof uid !== "string" || !uid) continue;
    await client.query(
      "INSERT INTO banned_users (uid) VALUES ($1) ON CONFLICT DO NOTHING",
      [uid]
    );
    n++;
  }
  return n;
}

async function importChatHistory(client) {
  const list = readJsonFile(historyJsonPath);
  if (!Array.isArray(list)) return 0;
  let n = 0;
  for (const m of list) {
    if (!m || typeof m !== "object") continue;
    await insertMessage(m, client);
    n++;
  }
  return n;
}

async function importVotes(client) {
  const json = readJsonFile(voteJsonPath);
  if (!json || typeof json !== "object") return 0;
  let n = 0;
  for (const [target, count] of Object.entries(json)) {
    const c = Number.isFinite(Number(count)) ? Math.trunc(Number(count)) : 0;
    await client.query(
      `INSERT INTO votes (target, vote_count) VALUES ($1, $2)
       ON CONFLICT (target) DO NOTHING`,
      [target, c]
    );
    n++;
  }
  return n;
}

// サーバー起動時に1回呼ぶ: テーブル作成 → JSON(履歴・BAN・投票)の一括移行
// ※ ユーザーは一括では移行せず、ログイン時などに1人ずつ移行します(findUserOrMigrate)
async function init() {
  await pool.query(SCHEMA_SQL);
  await importOnce("banned_users_json", importBannedUsers);
  await importOnce("chat_history_json", importChatHistory);
  await importOnce("votes_json", importVotes);
}

module.exports = {
  pool,
  init,
  // users
  getUserByName,
  getUserByUid,
  findUserOrMigrate,
  findUserByUidOrMigrate,
  getUsernameByUid,
  getAdminUsernames,
  getAllUsersPublic,
  createUser,
  setAdmin,
  setPasswordHash,
  setColor,
  renameUser,
  // bans
  isBanned,
  addBan,
  removeBan,
  getBannedUids,
  // chat
  insertMessage,
  getHistory,
  getMessageById,
  getMessageText,
  markMessageDeleted,
  restoreMessage,
  deleteMessage,
  clearMessages,
  // votes
  incrementVote,
};
