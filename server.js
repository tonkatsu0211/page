const express = require("express");
const app = express();
const path = require("path");
const cookieParser = require("cookie-parser");
const http = require("http").createServer(app);
const session = require("express-session");
const bcrypt = require("bcrypt");
const fs = require("fs");
const { Server } = require("socket.io");
const io = new Server(http);
const { v4: uuidv4 } = require("uuid");
const db = require("./db");
const adminUsers = new Set();
const { version, last_update } = require(path.join(
  __dirname,
  ".",
  "package.json"
));
const multer = require("multer");
const { safeExt, MAX_UPLOAD_BYTES } = require("./fileServe");
const storage = require("./storage");
global.render = require("./render");
global.arrayBufferToBase64 = require("./render");
global.base64ToArrayBuffer = require("./render");
global.generateCryptoData = require("./render");
global.unlockPrivateKey = require("./render");
global.reEncryptPrivateKey = require("./render");

io.use(async (socket, next) => {
  try {
    const uid = socket.handshake.auth.uid;
    if (await db.isBanned(uid)) {
      return next(new Error("あなたはBANされています"));
    }
    // JSONにしか存在しない管理者でも管理者判定が効くよう、接続時にDBへ移行しておく
    const user = await db.findUserOrMigrate(socket.handshake.auth.username);
    if (user?.isAdmin) adminUsers.add(user.username);
    next();
  } catch (err) {
    console.error("socket auth error:", err);
    next(err);
  }
});

setInterval(() => {
  const now = Date.now();
  for (const [id, last] of Object.entries(lastPing)) {
    if (now - last > 10000) {
      const socket = io.sockets.sockets.get(id);
      if (socket) {
        socket.disconnect(true);
      }
    }
  }
}, 500);

// 画像は一旦メモリで受け取り、そのまま Neon Object Storage へ保存する
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_UPLOAD_BYTES },
});

const users = {};
const uids = {};


const webPush = require("web-push");


function base64urlToBase64(str) {
  return str
    .replace(/-/g, "+")
    .replace(/_/g, "/")
    .padEnd(Math.ceil(str.length / 4) * 4, "=");
}

const publicKey =
  "BBmY-u5pSnhmOhOLWG5w_4MN2wPWloZRzIzp2iXuJBYCJQ48_Qmw5-_vl0vEI4PDzjDBa9lPokKBSVg-V0SL8JE";
const privateKey = "mGbOvFaAMXRMoFIKrJg44gqTJFOPJMLJkKpH5gd-UwM";

webPush.setVapidDetails("mailto:example@example.com", publicKey, privateKey);

const subscriptions = [];

// 接続時に送る履歴の最大件数。環境変数 CHAT_HISTORY_LIMIT で指定(未指定なら全件)
const HISTORY_LIMIT = Number(process.env.CHAT_HISTORY_LIMIT) || null;

app.set("trust proxy", true);

app.post("/subscribe", (req, res) => {
  const subscription = req.body;
  subscriptions.push(subscription);
  res.status(201).json({});
});

function sendPushNotification(title, body) {
  const payload = JSON.stringify({ title, body });
  subscriptions.forEach((sub) => {
    webPush.sendNotification(sub, payload).catch((err) => console.error(err));
  });
}


const lastPing = {};

const lastConnectTime = {};
const lastDisconnectTime = {};
const RECONNECT_THRESHOLD = 5000;
const MIN_CONNECT_INTERVAL = 10000;

function updateAdminList() {
  const onlineUsers = new Set(Object.values(users));
  io.emit("admin list", Array.from(adminUsers), Array.from(onlineUsers));
}

const jaTimestamp = () =>
  new Date().toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" });

// system メッセージを DB に保存して全員に配信
async function sendSystemMessage(text) {
  const sysMsg = {
    id: uuidv4(),
    username: "system",
    message: text,
    timestamp: jaTimestamp(),
  };
  await db.insertMessage(sysMsg);
  io.emit("chat update", sysMsg);
  return sysMsg;
}

// そのユーザーに見せる履歴を DB から取得(他人の /tell は除外される)
function getHistoryFor(uid) {
  return db.getHistory(uid, { limit: HISTORY_LIMIT });
}

// 履歴をスクロール維持で再配信する。
// 接続ごとに絞り込んだ履歴を送るので、他人宛ての /tell が全員に流れることはない。
async function emitHistoryNoScroll() {
  const cache = new Map();
  for (const s of io.sockets.sockets.values()) {
    const key = s.data.uid ?? "";
    if (!cache.has(key)) cache.set(key, getHistoryFor(key));
    try {
      s.emit("chat history noScroll", await cache.get(key));
    } catch (err) {
      console.error("履歴の再配信に失敗:", err);
    }
  }
}

// "'UID'-xxxx" ならUIDで、そうでなければユーザー名で検索(JSONにしか無ければDBへ移行)
function resolveUser(idOrName) {
  return idOrName.startsWith("'UID'-")
    ? db.findUserByUidOrMigrate(idOrName)
    : db.findUserOrMigrate(idOrName);
}

io.on("connection", (socket) => {
  const username = socket.handshake.auth.username;
  const uid = socket.handshake.auth.uid;
  users[socket.id] = username;
  uids[socket.id] = uid;
  lastPing[socket.id] = Date.now();

  updateAdminList();

  const now = Date.now();
  const lastDisc = lastDisconnectTime[username] || 0;

  // 接続メッセージの保存が終わってから履歴を送る(履歴に接続メッセージを含めるため)
  let connectSaved = Promise.resolve();

  if (
    !lastConnectTime[username] ||
    now - lastConnectTime[username] > MIN_CONNECT_INTERVAL
  ) {
    let message;
    if (now - lastDisc <= RECONNECT_THRESHOLD) {
      message = `${username}が再接続しました`;
    } else {
      message = `${username}が接続しました`;
    }

    const connectMsg = {
      id: uuidv4(),
      username: "systemC2",
      message: message,
      timestamp: new Intl.DateTimeFormat("ja-JP", {
        timeZone: "Asia/Tokyo",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false,
      }).format(new Date()),
    };

    io.emit("chat update", connectMsg);
    connectSaved = db
      .insertMessage(connectMsg)
      .catch((err) => console.error("接続メッセージの保存に失敗:", err));

    lastConnectTime[username] = now;
  }

  io.emit("user count", Object.keys(users).length);
  io.emit("user list", Object.values(users));

  socket.on("client ping", () => {
    lastPing[socket.id] = Date.now();
    socket.emit("server ping");
  });

  socket.on("disconnect", () => {
    delete users[socket.id];
    delete lastPing[socket.id];
    delete uids[socket.id];
    io.emit("user count", Object.keys(users).length);
    io.emit("user list", Object.values(users));

    const now = Date.now();
    lastDisconnectTime[username] = now;

    const disconnectMsg = {
      id: uuidv4(),
      username: "systemC2",
      message: `${username}が切断しました`,
      timestamp: new Intl.DateTimeFormat("ja-JP", {
        timeZone: "Asia/Tokyo",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false,
      }).format(new Date()),
    };

    io.emit("chat update", disconnectMsg);
    db.insertMessage(disconnectMsg).catch((err) =>
      console.error("切断メッセージの保存に失敗:", err)
    );
    updateAdminList();
  });

  socket.data.username = username;
  socket.data.isAdmin = adminUsers.has(username);
  socket.data.uid = uid;

  users[socket.id] = username;
  uids[socket.id] = uid;

  io.emit("user count", Object.keys(users).length);
  io.emit("user list", Object.values(users));

  connectSaved
    .then(() => getHistoryFor(uid))
    .then((history) => socket.emit("chat history", history))
    .catch((err) => console.error("チャット履歴の取得に失敗:", err));

  socket.on("requestHistory", async () => {
    try {
      socket.emit("chat history", await getHistoryFor(uid));
    } catch (err) {
      console.error("チャット履歴の取得に失敗:", err);
    }
  });

  socket.on("chat message", async (data) => {
    try {
      const { message, replyTo = null } = data;
      const user = socket.data.username;
      const uid = socket.data.uid.replace(/&#39;/g, "'");

      // 自分のユーザー情報(最高管理者かどうか)
      const me = await db.getUserByName(user);
      const isSuperAdmin = !!me?.superAdmin;

      if (message.trim() === "/delete" && socket.data.isAdmin) {
        await db.clearMessages();
        io.emit("chat history", []);
        return;
      }

      if (message.startsWith("/ban ")) {
        if (!socket.data.isAdmin) {
          socket.emit("chat update", "その操作を行う権限がありません");
          return;
        }
        let target = message.slice(5).trim();
        if (!target) return;
        const targetUser = await resolveUser(target);
        if (!targetUser) {
          socket.emit("chat update", "指定したユーザーが見つかりません");
          return;
        }
        target = targetUser.username;
        const targetUid = targetUser.uid;
        if (
          (targetUid === "'UID'-tonkatsu" && targetUid != uid) ||
          (isSuperAdmin && targetUid != uid)
        ) {
          await db.addBan(uid);
          let targetMsg;
          if (uid == "'UID'-tonkatsu") {
            targetMsg = "製作者";
          } else if (isSuperAdmin) {
            targetMsg = "最高管理者";
          } else {
            targetMsg = "[エラー]";
          }
          await sendSystemMessage(
            `${user} が${targetMsg}のBANを試みたため、BANされました`
          );
          io.emit("reload", user, "あなたはBANされました");
          io.emit("updateBanned", await db.getBannedUids());
          updateAdminList();
          return;
        } else if (targetUid == uid) {
          await sendSystemMessage(`${user} が自己のBANを試みました`);
          return;
        } else if (targetUser.isAdmin && user != "_tonkatsu_") {
          await sendSystemMessage(
            `${user} が管理者 ${target} のBANを試みました(管理者は製作者のみBANできます)`
          );
          return;
        }
        await db.addBan(targetUid);
        await sendSystemMessage(`${user}が${target}をBANしました`);
        io.emit("reload", target, "あなたはBANされました");
        io.emit("updateBanned", await db.getBannedUids());
        updateAdminList();
        return;
      }

      if (message.startsWith("/unban ")) {
        if (!socket.data.isAdmin) {
          socket.emit("chat update", "その操作を行う権限がありません");
          return;
        }
        let target = message.slice(7).trim();
        const targetUser = await resolveUser(target);
        if (!targetUser) {
          socket.emit("chat update", "指定したユーザーが見つかりません");
          return;
        }
        target = targetUser.username;
        await db.removeBan(targetUser.uid);
        await sendSystemMessage(`${user} が ${target} のBANを解除しました`);
        io.emit("reload", target, "BANが解除されました");
        io.emit("updateBanned", await db.getBannedUids());
        updateAdminList();
        return;
      }

      if (message.startsWith("/admin ")) {
        if (!socket.data.isAdmin) {
          socket.emit("chat update", "その操作を行う権限がありません");
          return;
        }
        let target = message.slice(7).trim();
        if (!target) return;
        const targetUser = await resolveUser(target);
        if (!targetUser) {
          socket.emit("chat update", "指定したユーザーが見つかりません");
          return;
        }
        target = targetUser.username;
        await db.setAdmin(target, true);
        adminUsers.add(target);
        await sendSystemMessage(`${user} が ${target} に管理者権限を付与しました`);
        updateAdminList();
        io.emit(
          "reload",
          target,
          "管理者権限が付与されました。再読み込みします。"
        );
        return;
      }

      if (message.startsWith("/reload ")) {
        console.log(`uid: ${uid}`);
        if (uid != "'UID'-tonkatsu" && !isSuperAdmin) {
          socket.emit("chat update", "その操作を行う権限がありません");
          return;
        }
        let target = message.slice(8).trim();
        if (!target) {
          target = await db.getUsernameByUid(uid);
        } else if (target.startsWith("'UID'-")) {
          target = await db.getUsernameByUid(target);
        }
        let targetMsg;
        if (uid == "'UID'-tonkatsu") {
          targetMsg = "製作者";
        } else if (isSuperAdmin) {
          targetMsg = "最高管理者";
        } else {
          targetMsg = "[エラー]";
        }
        io.emit("reload", target, `${targetMsg}により再読み込みが行われます。`);
        return;
      }

      if (message.startsWith("/alert ")) {
        if (uid != "'UID'-tonkatsu" && !isSuperAdmin) {
          socket.emit("chat update", "その操作を行う権限がありません");
          return;
        }
        const payload = message.slice(7).trim();
        const firstSpace = payload.indexOf(" ");
        if (firstSpace === -1) {
          socket.emit("chat update", "文法ミス");
          return;
        }
        let target = payload.slice(0, firstSpace).trim();
        const msgText = payload.slice(firstSpace + 1).trim();
        if (!msgText) {
          socket.emit("chat update", "文法ミス");
          return;
        }
        if (!target) return;
        if (target.startsWith("'UID'-")) {
          // 元のコードは未定義の変数 targetUid を参照していたので target を渡す
          target = await db.getUsernameByUid(target);
        }
        io.emit("alert", target, msgText);
        return;
      }

      if (message.startsWith("/password ")) {
        const newPassword = message.slice(10).trim();
        try {
          const hash = await bcrypt.hash(newPassword, 10);
          await db.setPasswordHash(user, hash);
          socket.emit("password changed", user);
        } catch (err) {
          console.error("パスワード変更失敗:", err);
          socket.emit("password change failed", user);
        }
        return;
      }

      if (message.startsWith("/color ")) {
        const color = message.slice(7).trim();
        if (
          (!/^#[0-9a-fA-F]{3}$/.test(color) &&
            !/^#[0-9a-fA-F]{6}$/.test(color)) ||
          !color
        ) {
          socket.emit("chat update", "無効なカラーコードです");
          return;
        }
        await db.setColor(user, color);
        await sendSystemMessage(`${user} が名前の色を ${color} に変更しました`);
        return;
      }

      if (message.startsWith("/name ")) {
        const newName = message.slice(6).trim();
        // JSONにしか無い未移行ユーザーの名前も「使用済み」として扱う
        if (!newName || (await db.findUserOrMigrate(newName))) {
          socket.emit("chat update", "その名前は使用できません");
          return;
        }
        if (newName.includes("ケッチ")) {
          await db.addBan(uid);
          io.emit("reload", user, "あなたはBANされました");
          return;
        }
        const renamed = await db.renameUser(user, newName);
        if (!renamed) {
          socket.emit("chat update", "その名前は使用できません");
          return;
        }
        if (adminUsers.delete(user)) adminUsers.add(newName);
        socket.data.username = newName;
        users[socket.id] = newName;
        await sendSystemMessage(`${user} が ${newName} に名前を変更しました`);
        return;
      }

      if (message.startsWith("/tell ")) {
        const payload = message.slice(6).trim();
        const firstSpace = payload.indexOf(" ");
        if (firstSpace === -1) {
          socket.emit("chat update", "使用法: /tell ユーザー メッセージ");
          return;
        }
        const targetIdOrName = payload.slice(0, firstSpace).trim();
        const msgText = payload.slice(firstSpace + 1).trim();
        if (!msgText) {
          socket.emit("chat update", "空のメッセージは送信できません");
          return;
        }

        const targetUser = await resolveUser(targetIdOrName);
        if (!targetUser) {
          socket.emit(
            "chat update",
            targetIdOrName.startsWith("'UID'-")
              ? "指定したUIDのユーザーが見つかりません"
              : "指定したユーザーが見つかりません"
          );
          return;
        }
        const targetUsername = targetUser.username;
        const targetUid = targetUser.uid;
        let targetUid2 = targetUid.slice(5).trim();
        targetUid2 = "&#39;UID&#39;" + targetUid2;

        let uid2 = uid.startsWith("&#39;")
          ? uid.slice(13).trim()
          : uid.slice(5).trim();
        uid2 = "'UID'" + uid2;

        const sysMsg = {
          id: uuidv4(),
          username: "systemC3",
          from: user,
          fromUid: uid,
          fromUidShow: uid2,
          to: targetUsername,
          toUid: targetUid2,
          toUidShow: targetUid,
          message: msgText,
          timestamp: jaTimestamp(),
        };

        await db.insertMessage(sysMsg);
        io.emit("chat update", sysMsg);
        console.log("tell:", sysMsg);
        return;
      }

      const forwarded = socket.request.headers["x-forwarded-for"];
      const rawIP = forwarded
        ? forwarded.split(",")[0].trim()
        : socket.handshake.address;

      const ipRaw =
        socket.handshake.headers["x-forwarded-for"] ||
        socket.handshake.address ||
        "";
      const ipList = ipRaw.split(",").map((ip) => ip.trim());

      let ipv4 =
        ipList.find((ip) => /^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$/.test(ip)) || "";
      let ipv6 =
        ipList.find((ip) => /^[a-fA-F0-9:]+$/.test(ip) && !ip.includes(".")) ||
        "";

      if (rawIP.startsWith("::ffff:")) {
        ipv4 = rawIP.replace("::ffff:", "");
        ipv6 = "";
      } else if (rawIP === "::1") {
        ipv4 = "127.0.0.1";
        ipv6 = "::1";
      }

      socket.ipv4 = ipv4;
      socket.ipv6 = ipv6;

      const replyMsg = replyTo ? await db.getMessageText(replyTo) : null;

      const messageData = {
        id: uuidv4(),
        username: user,
        uid: uid,
        message: message,
        timestamp: jaTimestamp(),
        ipv4: socket.ipv4,
        ipv6: socket.ipv6,
        isAdmin: socket.data.isAdmin,
        superAdmin: isSuperAdmin,
        replyTo: replyTo || null,
        replyMsg,
      };

      updateAdminList();

      await db.insertMessage(messageData);

      io.emit("chat update", messageData);
      sendPushNotification(messageData.username, messageData.message);
    } catch (err) {
      console.error("chat message error:", err);
      socket.emit("chat update", "サーバーエラーが発生しました");
    }
  });

  socket.on("delete message", async (id) => {
    try {
      const message = await db.getMessageById(id);
      console.log("delete:", message);
      if (!message) return;
      if (message.username == socket.data.username || socket.data.isAdmin) {
        let delMessage;
        if (message.username == socket.data.username) {
          delMessage = "このメッセージは投稿者によって削除されました";
        } else if (socket.data.username == "_tonkatsu_") {
          delMessage = "このメッセージは製作者によって削除されました";
        } else if ((await db.getUserByName(socket.data.username))?.superAdmin) {
          delMessage = "このメッセージは最高管理者によって削除されました";
        } else {
          delMessage = "このメッセージは管理者によって削除されました";
        }
        await db.markMessageDeleted(id, delMessage);
        await emitHistoryNoScroll();
      }
    } catch (err) {
      console.error("delete message error:", err);
    }
  });

  socket.on("clean delete message", async (id) => {
    try {
      const message = await db.getMessageById(id);
      console.log("clean delete:", message);
      if (!message) return;
      if (message.username === socket.data.username || socket.data.isAdmin) {
        await db.deleteMessage(id);
        await emitHistoryNoScroll();
      }
    } catch (err) {
      console.error("clean delete message error:", err);
    }
  });

  socket.on("restore message", async (id) => {
    try {
      const message = await db.getMessageById(id);
      console.log("restore:", message);
      if (!message) return;
      await db.restoreMessage(id);
      await emitHistoryNoScroll();
    } catch (err) {
      console.error("restore message error:", err);
    }
  });
});

const bbsIO = io.of("/bbs");
bbsIO.on("connection", (socket) => {
  socket.on("join_thread", (threadId) => {
    socket.join(`thread_${threadId}`);

    const db = getDB();
    db.all(
      "SELECT * FROM posts WHERE thread_id=? ORDER BY id ASC",
      [threadId],
      (err, posts) => {
        if (!err) {
          socket.emit("thread_history", posts);
        }
        db.close();
      }
    );
  });

  socket.on("new_post", (data) => {
    const db = getDB();
    const created_at = new Date().toISOString();
    db.run(
      "INSERT INTO posts (thread_id, username, message, reply_to, created_at) VALUES (?,?,?,?,?)",
      [
        data.thread_id,
        data.username,
        data.message,
        data.reply_to || null,
        created_at,
      ],
      function (err) {
        if (!err) {
          db.get(
            "SELECT * FROM posts WHERE id=?",
            [this.lastID],
            (err2, post) => {
              if (!err2) {
                bbsIO.to(`thread_${data.thread_id}`).emit("new_post", post);
              }
            }
          );
        }
        db.close();
      }
    );
  });
});

app.use(express.urlencoded({ extended: true }));
app.use(express.json());

app.post(
  "/upload-image",
  (req, res, next) => {
    upload.single("image")(req, res, (err) => {
      if (err) {
        const error =
          err.code === "LIMIT_FILE_SIZE"
            ? `アップロード失敗: ファイルサイズ制限を超えています(最大${Math.floor(MAX_UPLOAD_BYTES / 1024 / 1024)}MB)`
            : `アップロード失敗: ${error.message}`;
        return res.status(400).json({ error });
      }
      next();
    });
  },
  async (req, res) => {
    if (!req.file) {
      return res
        .status(400)
        .json({ error: "ファイルがアップロードされていません" });
    }
    try {
      const baseName =
        Date.now() + "-" + Math.random().toString(36).substring(2);
      const filename = await storage.saveFile({
        bucket: "uploads",
        baseName,
        ext: safeExt(req.file.originalname),
        data: req.file.buffer,
      });
      res.json({ url: `/uploads/${filename}` });
    } catch (err) {
      console.error("画像の保存に失敗:", err);
      res.status(500).json({ error: "アップロードに失敗しました" });
    }
  }
);

app.use(
  session({
    secret: "tonkatsu-0211",
    resave: false,
    saveUninitialized: false,
  })
);

app.get("/users", async (req, res) => {
  try {
    // パスワードハッシュは返さない
    res.json(await db.getAllUsersPublic());
  } catch (err) {
    console.error("ユーザー一覧の取得エラー:", err);
    res.status(500).json({ error: "サーバーエラー" });
  }
});

app.use("/fonts", express.static("public/fonts", {
  maxAge: "365d",
  immutable: true
}));

app.use(cookieParser());

app.use(express.static("public"));

app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "pcViews"));

app.use(express.json());

app.post("/log", (req, res) => {
  console.log(req.body.message);
  res.json({ status: "ok" });
});

app.post(["/chat/logout", "/chat/logout.html"], (req, res) => {
  console.log("logout: ", req.cookies.user);
  res.clearCookie("user");
  res.clearCookie("isAdmin");
  req.session.destroy(() => {
    res.redirect("/chat/login?f=logout");
  });
});

/*app.use((req, res) => {
  render(
    req,
    res,
    "stopping",
    {
      title: "_tonkatsu_のページ",
      page: req.originalUrl.slice(1),
      top: "_tonkatsu_のページについて",
    },
    "stop"
  );
});*/

app.use("/games", require("./routes/games"));
app.use("/chat", require("./routes/chat"));
app.use("/bbs", require("./routes/bbs"));
app.use("/service", require("./routes/service"));
app.use("/uploads", require("./routes/uploads"));
app.use("/pubAssets", require("./routes/pubAssets"));
app.use("/proc", require("./routes/proc"));
app.use("/api", require("./routes/api"));

app.get("/account/:u", async (req, res) => {
  const url = req.originalUrl;
  const r = await fetch(`https://www.ofoct.com/${url}`);
  res.send(r);
});

app.get(["/stopping", "/stopping.html"], (req, res) => {
  render(
    req,
    res,
    "stopping",
    {
      title: "_tonkatsu_のページ",
      page: "stopping",
      top: "_tonkatsu_のページについて",
    },
    "stop"
  );
});

app.get(["/", "/index", "/top", "/index.html"], (req, res) => {
  const from = req.query.f || "";
  render(
    req,
    res,
    "index",
    {
      from,
      title: "_tonkatsu_のページ",
      page: "index",
      top: "_tonkatsu_ / tonkatsu0211のページにようこそ!!",
    },
    "index"
  );
});

app.get(["/my", "/my.html"], (req, res) => {
  render(
    req,
    res,
    "my",
    {
      title: "自己紹介(事故紹介)",
      page: "my",
      top: "自己紹介(事故紹介)",
    },
    "my"
  );
});

app.get(["/temp", "/temp.html"], (req, res) => {
  render(
    req,
    res,
    "temp",
    {
      title: "パンチゲームテンプレート",
      page: "temp",
      top: "パンチゲームテンプレート",
    },
    "null"
  );
});

app.get(["/projects", "/projects.html"], (req, res) => {
  render(
    req,
    res,
    "projects",
    {
      title: "作品",
      page: "projects",
      top: "Scratchの作品",
    },
    "projects"
  );
});

app.get(["/constructing", "/const", "/constructing.html"], (req, res) => {
  render(
    req,
    res,
    "constructing",
    {
      title: "建設中のページ",
      page: "constructing",
      top: "建設中",
    },
    "const"
  );
});

/*app.get(["/constructing1", "/const1", "/constructing1.html"], (req, res) => {
  render(
    req,
    res,
    "constructing1",
    {
      title: "建設中のページ",
      page: "constructing1",
      top: "建設中",
    },
    "const"
  );
});*/

app.get(["/contact", "/contact.html"], (req, res) => {
  render(
    req,
    res,
    "contact",
    {
      title: "お問い合わせ",
      page: "contact",
      top: "お問い合わせ",
    },
    "contact"
  );
});

app.get(
  ["/beforeBreak", "/beforeBreak.html", "/break", "/break.html"],
  (req, res) => {
    render(
      req,
      res,
      "break",
      {
        title: "_tonkatsu_のページ",
        page: "break",
        top: "履歴破壊",
      },
      "break"
    );
  }
);

app.get(["/updates", "/updates.html"], (req, res) => {
  render(
    req,
    res,
    "updates",
    {
      title: "ページ更新履歴",
      page: "updates",
      top: "ページ更新履歴",
    },
    "updates"
  );
});

app.get(["/error", "/error.html"], (req, res) => {
  render(
    req,
    res,
    "error",
    {
      title: "404 Not Found",
      page: "error",
      ec: "none",
    },
    "error"
  );
});

app.get(["/empass/games/snow", "/empass/games/snow.html"], (req, res) => {
  render(req, res, "snow", {}, "games", "games");
});

const { execFile } = require("child_process");
const { promisify } = require("util");
const execFileAsync = promisify(execFile);

/*app.get("/move", async (req, res) => {
  try {
    const { stdout, stderr } = await execFileAsync(
      "node",
      [path.join(__dirname, "temp.js")],
      { cwd: __dirname, timeout: 60 * 1000 } // 60秒で打ち切り
    );
    if (stderr) console.error("/move stderr:", stderr);
    res.send(`完了しました\n${stdout}`);
  } catch (err) {
    // 終了コードが 0 以外、起動失敗、タイムアウトのいずれもここに来る
    console.error("/move: 失敗:", err.message);
    res.status(500).send(`失敗しました\n${err.stderr || err.message}`);
  }
});*/

app.use((req, res) => {
  const pageName = req.path.replace("/", "");
  console.log(`404 at /${pageName}`);
  res.status(404).render("error", {
    title: "404 Not Found",
    page: "error",
    ec: pageName,
    em: "false",
    version,
    last_update,
    origin: "https://dnw22h-3000.csb.app",
    tag: "error",
    assets: "https://y3sjh2.csb.app",
  });
});

const port = process.env.PORT || 3000;

(async () => {
  try {
    await db.init(); // テーブル作成 + JSON(履歴・BAN・投票)の一回限りの移行
    for (const name of await db.getAdminUsernames()) adminUsers.add(name);
  } catch (err) {
    console.error("DBの初期化に失敗しました:", err);
    process.exit(1);
  }
  storage.check(); // Object Storage への接続確認(失敗してもログだけ)
  http.listen(port, "0.0.0.0", () => {
    console.log("App listening on port", port, ", pid", process.pid);
  });
})();


function runGit(args) {
    return new Promise((resolve, reject) => {
        const git = execFile("git", args, { cwd: "/workspace" });

        git.stdout.on("data", d => console.log(d.toString()));
        git.stderr.on("data", d => console.error(d.toString()));

        git.on("close", code => {
            if (code === 0) resolve();
            else reject(new Error("git " + args.join(" ") + " failed"));
        });
    });
}

async function autoPush() {
    try {
        await runGit(["add", "."]);
        await runGit(["commit", "-m", "update"]);
        await runGit(["push", "origin", "main"]).catch(()=>{});
        console.log("pushed");
    } catch (e) {
        console.error(e.message);
    }
}

//setInterval(autoPush, 900000);
