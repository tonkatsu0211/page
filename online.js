// オンライン人数・ユーザー一覧・管理者の在席状況を、全サーバーの接続を集めて配信する。
// (サーバーごとのメモリではなく io.fetchSockets() を使うので、別サーバーの接続者も数えられる)
//
// fetchSockets は他のサーバーへの問い合わせ(Redis なら数コマンド)を伴うので、更新要求はまとめる。
//   updateOnline()    ... 接続・切断・名前変更のとき。人数・一覧も配信(300ms でまとめる)
//   updateAdminList() ... チャット送信のたびに呼ばれる。管理者の在席だけ(3秒でまとめる)
module.exports = function createOnline(io, db, { fullDelay = 300, adminDelay = 3000 } = {}) {
  let timer = null;
  let dueAt = 0;
  let withUsers = false;

  async function run() {
    const full = withUsers;
    timer = null;
    withUsers = false;
    try {
      const sockets = await io.fetchSockets();
      // 名前は socket.data.username を優先し、無ければ接続時に送られた名前を使う。
      // 同じ人が複数のタブ・端末(別サーバー含む)で開いていても、1人として数える
      const nameOf = (s) => s.data?.username || s.handshake?.auth?.username;
      const names = [...new Set(sockets.map(nameOf).filter(Boolean))];
      if (process.env.ONLINE_DEBUG === "1") {
        console.log(
          `[online] full=${full} sockets=${sockets.length} names=${JSON.stringify(names)} ` +
            `detail=${JSON.stringify(sockets.map((s) => ({ id: s.id, data: s.data?.username ?? null, auth: s.handshake?.auth?.username ?? null })))}`
        );
      }
      if (full) {
        io.emit("user count", names.length);
        io.emit("user list", names);
      }
      io.emit("admin list", await db.getAdminUsernames(), names);
    } catch (err) {
      console.error("オンライン状況の更新に失敗:", err);
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

  return {
    updateAdminList: () => schedule(false),
    updateOnline: () => schedule(true),
  };
};
