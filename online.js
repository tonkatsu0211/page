// オンライン人数・ユーザー一覧・管理者の在席状況。
//
// 別サーバー(Render と Railway など)の接続は、DB の presence 表で共有する。
//   - 接続・切断・改名のたびに、自分のサーバーの分を表に書き込む
//   - 一覧は「表の内容」+「自分のサーバーに実際につながっている接続」から作る
//     (DB の書き込みが遅れても失敗しても、自分の名前は必ず一覧に入る)
//   - 15秒ごとに、表を実際の接続に合わせ直し、自分のサーバーの接続者へ最新の一覧を送り直す
//     (配信を取りこぼしても、数秒〜15秒で正しい表示に戻る)
//   - 誰も接続していないサーバーは DB に何も問い合わせない(Neon が休止できる)
//
// 呼び出しが多いので、配信は更新要求をまとめる。
//   updateOnline()    ... 接続・切断・名前変更のとき。人数・一覧も配信(300ms でまとめる)
//   updateAdminList() ... チャット送信のたびに呼ばれる。管理者の在席だけ(3秒でまとめる)
const crypto = require("crypto");

module.exports = function createOnline(
  io,
  db,
  {
    fullDelay = 300,
    adminDelay = 3000,
    heartbeatMs = 15000,
    ttlSeconds = 45,
    serverId = crypto.randomUUID(),
  } = {}
) {
  const nameOf = (s) => s.data?.username || s.handshake?.auth?.username;
  const localSockets = () => [...io.of("/").sockets.values()];
  const logError = (label) => (err) => console.error(`[online] ${label}:`, err.message || err);

  // 表(全サーバー)+ 自分のサーバーの実際の接続。同じ人は1人として数える。
  async function currentNames() {
    let dbNames = [];
    try {
      dbNames = await db.presenceNames(ttlSeconds);
    } catch (err) {
      logError("在席の読み込みに失敗")(err);
    }
    const local = localSockets().map(nameOf).filter(Boolean);
    return [...new Set([...dbNames, ...local])];
  }

  // ---- 全員への配信(まとめて1回) ----
  let timer = null;
  let dueAt = 0;
  let withUsers = false;

  async function run() {
    const full = withUsers;
    timer = null;
    withUsers = false;
    try {
      const names = await currentNames();
      if (process.env.ONLINE_DEBUG === "1") {
        console.log(`[online] server=${serverId.slice(0, 8)} full=${full} names=${JSON.stringify(names)}`);
      }
      if (full) {
        io.emit("user count", names.length);
        io.emit("user list", names);
      }
      io.emit("admin list", await db.getAdminUsernames(), names);
    } catch (err) {
      logError("オンライン状況の更新に失敗")(err);
    }
  }

  function schedule(full) {
    withUsers = withUsers || full;
    const due = Date.now() + (full ? fullDelay : adminDelay);
    if (timer && dueAt <= due) return; // すでにもっと早く実行される予定
    clearTimeout(timer);
    dueAt = due;
    timer = setTimeout(run, Math.max(0, due - Date.now()));
  }

  // ---- 定期的な合わせ直し(自己修復) ----
  let hadSockets = false;
  async function heartbeat() {
    const socks = localSockets();
    if (socks.length === 0 && !hadSockets) return; // 誰もいなければ DB に触らない
    hadSockets = socks.length > 0;
    try {
      await db.presenceSync(
        serverId,
        socks.map((s) => ({ id: s.id, username: nameOf(s) })).filter((x) => x.username)
      );
      await db.presenceCleanup(ttlSeconds * 4);
    } catch (err) {
      logError("在席の更新に失敗")(err);
    }
    if (socks.length === 0) return;
    try {
      const names = await currentNames();
      // 自分のサーバーの接続者にだけ送る(他のサーバーは、それぞれ自分の分を送る)
      io.local.emit("user count", names.length);
      io.local.emit("user list", names);
      io.local.emit("admin list", await db.getAdminUsernames(), names);
    } catch (err) {
      logError("一覧の再配信に失敗")(err);
    }
  }
  const heartbeatTimer = setInterval(heartbeat, heartbeatMs);
  heartbeatTimer.unref?.();

  return {
    updateAdminList: () => schedule(false),
    updateOnline: () => schedule(true),
    // 接続した(名前 username の socket が増えた)
    async track(socket, username) {
      hadSockets = true;
      if (username) await db.presenceAdd(serverId, socket.id, username).catch(logError("在席の登録に失敗"));
      schedule(true);
    },
    // 切断した
    async untrack(socket) {
      await db.presenceRemove(serverId, socket.id).catch(logError("在席の削除に失敗"));
      schedule(true);
    },
    // 名前を変更した
    async rename(socket, username) {
      if (username) await db.presenceAdd(serverId, socket.id, username).catch(logError("在席の更新に失敗"));
      schedule(true);
    },
    heartbeat,
    serverId,
  };
};
