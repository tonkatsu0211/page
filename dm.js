// DM(1対1の会話)の Socket.IO 処理。名前空間 "/dm" を使うので、
// 既存のチャットの接続メッセージ・在室人数などには影響しない。
//
// クライアント → サーバー
//   "dm list"                      自分の会話一覧を要求
//   "dm open"  <相手のuid>          その相手との会話の履歴を要求
//   "dm message" {to, message, replyTo}
//   "dm delete" / "dm restore" / "dm clean delete"  <メッセージid>   (送信者本人のみ)
// サーバー → クライアント
//   "dm me" {uid, username} / "dm list" [...] / "dm history" {partner, messages}
//   "dm update" <メッセージ>  (新規・削除・復元)  / "dm removed" {id}  / "dm error" "文言"

const { v4: uuidv4 } = require("uuid");
const dmAuth = require("./dmAuth");

const MAX_LEN = 3000; // 1メッセージの最大文字数

const jaTimestamp = () =>
  new Date().toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" });

module.exports = function setupDm(io, deps = {}) {
  const db = deps.db || require("./db");
  const ns = io.of("/dm");
  const room = (uid) => "u:" + uid; // ユーザーごとのルーム(複数タブ・複数端末にも届く)

  // 認証: ログイン時に発行した署名付きトークンだけを信用する(クライアントが送る uid は見ない)
  ns.use(async (socket, next) => {
    try {
      const uid = dmAuth.uidFromCookieHeader(socket.handshake.headers.cookie);
      if (!uid) return next(new Error("unauthorized"));
      if (await db.isBanned(uid)) return next(new Error("banned"));
      const user = await db.getUserByUid(uid);
      if (!user) return next(new Error("unauthorized"));
      socket.data.uid = uid;
      socket.data.username = user.username;
      next();
    } catch (err) {
      console.error("[dm] auth error:", err);
      next(new Error("server error"));
    }
  });

  ns.on("connection", (socket) => {
    const me = socket.data.uid;
    socket.join(room(me));

    // 連投対策: 最大10通のバースト、その後は毎秒1通ずつ回復
    let tokens = 10;
    let last = Date.now();
    const take = () => {
      const now = Date.now();
      tokens = Math.min(10, tokens + (now - last) / 1000);
      last = now;
      if (tokens < 1) return false;
      tokens -= 1;
      return true;
    };

    const fail = (err, label) => {
      console.error(`[dm] ${label}:`, err);
      socket.emit("dm error", "サーバーエラーが発生しました");
    };

    // 自分と相手の両方(の全タブ)へ送る
    const toBoth = (partnerUid) => ns.to(room(me)).to(room(partnerUid));

    // 今の名前(名前変更に追従)
    const refreshMe = async () => {
      const u = await db.getUserByUid(me);
      if (u) socket.data.username = u.username;
      return socket.data.username;
    };

    socket.emit("dm me", { uid: me, username: socket.data.username });

    socket.on("dm list", async () => {
      try {
        socket.emit("dm list", await db.listDmConversations(me));
      } catch (err) {
        fail(err, "dm list");
      }
    });

    socket.on("dm open", async (partnerUid) => {
      try {
        if (typeof partnerUid !== "string" || partnerUid === me) {
          return socket.emit("dm error", "ユーザーが見つかりません");
        }
        // JSONにしか無い未移行ユーザーでも相手にできるよう、必要ならDBへ移す
        const p = await db.findUserByUidOrMigrate(partnerUid);
        if (!p) return socket.emit("dm error", "ユーザーが見つかりません");
        socket.emit("dm history", {
          partner: { uid: p.uid, username: p.username, color: p.color },
          messages: await db.getDmHistory(me, p.uid),
        });
      } catch (err) {
        fail(err, "dm open");
      }
    });

    socket.on("dm message", async (data) => {
      try {
        const { to, message, replyTo } = data || {};
        if (typeof to !== "string" || typeof message !== "string") return;
        if (to === me) return socket.emit("dm error", "自分自身にはDMを送れません");
        const text = message.trim();
        if (!text) return;
        if (text.length > MAX_LEN) {
          return socket.emit("dm error", `メッセージが長すぎます(最大${MAX_LEN}文字)`);
        }
        if (!take()) return socket.emit("dm error", "送信が速すぎます。少し待ってください");

        const partner = await db.findUserByUidOrMigrate(to);
        if (!partner) return socket.emit("dm error", "ユーザーが見つかりません");

        let replyMsg = null;
        let replyId = null;
        if (typeof replyTo === "string" && replyTo) {
          replyMsg = await db.getDmReplyText(replyTo, me, partner.uid);
          if (replyMsg !== null) replyId = replyTo; // 同じ会話のメッセージのみ有効
        }

        const id = uuidv4();
        await db.insertDm({
          id,
          fromUid: me,
          toUid: partner.uid,
          fromUser: await refreshMe(),
          message: text,
          timestamp: jaTimestamp(),
          replyTo: replyId,
          replyMsg,
        });
        toBoth(partner.uid).emit("dm update", await db.getDmMessageById(id));
      } catch (err) {
        fail(err, "dm message");
      }
    });

    // 削除・復元は送信者本人だけ(管理者でも他人のDMは操作できない)
    const withOwnMessage = (label, fn) => async (id) => {
      try {
        if (typeof id !== "string") return;
        const m = await db.getDmMessageById(id);
        if (!m || m.fromUid !== me) return;
        await fn(m);
      } catch (err) {
        fail(err, label);
      }
    };

    socket.on(
      "dm delete",
      withOwnMessage("dm delete", async (m) => {
        await db.markDmDeleted(m.id, "このメッセージは投稿者によって削除されました");
        toBoth(m.toUid).emit("dm update", await db.getDmMessageById(m.id));
      })
    );

    socket.on(
      "dm restore",
      withOwnMessage("dm restore", async (m) => {
        await db.restoreDm(m.id);
        toBoth(m.toUid).emit("dm update", await db.getDmMessageById(m.id));
      })
    );

    socket.on(
      "dm clean delete",
      withOwnMessage("dm clean delete", async (m) => {
        await db.deleteDm(m.id);
        toBoth(m.toUid).emit("dm removed", { id: m.id });
      })
    );
  });
};
