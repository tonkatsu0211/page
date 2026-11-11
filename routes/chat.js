const express = require("express");
const app = express();
const router = express.Router();
const path = require("path");
const session = require("express-session")
const db = require("../db");
const bcrypt = require("bcrypt");
const http = require("http").createServer(app);
const { v4: uuidv4 } = require("uuid");
const { Server } = require("socket.io");
const io = new Server(http);
const maxFileSize = Number(process.env.MAX_UPLOAD_MB) || 10;
const tag = "chat"
const { version } = require(path.join(
  __dirname,
  "..",
  "package.json"
));
const canVoteList = ["'UID'-793d3685-d485-43b7-9f32-dc5e9921969f", "'UID'-415067d7-2f34-4910-a80c-7d020308666e", "'UID'-5d7cd6cd-9667-45f6-a28c-3c0550262752", "'UID'-94b50222-4c1c-4a73-b065-9eb0aad105ae", "'UID'-a341944f-e06b-4443-80eb-ee6285163739", "'UID'-b67df19e-23c8-4362-9d6c-f9f6f2593420", "'UID'-b475ba14-e87f-4129-a570-4132dd84c34d"];

/*
bcrypt.hash("x_Sanon_x", 10).then(hash => {
  console.log(hash);
});
//*/

app.use(session({
  secret: "tonkatsu0211_tonkatsuChat",
  resave: false,
  saveUninitialized: false,
  cookie: { secure: false }
}));

// async ハンドラ内の例外を Express のエラー処理へ渡す
const ah = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

io.on("connection", async (socket) => {
  try {
    const username = socket.handshake.auth.username;
    if (await db.isBanned(username)) {
      socket.emit("redirect", "/chat/ban");
      socket.disconnect(true);
    }
  } catch (err) {
    console.error(`socket ban check error: ${err.message}`);
  }
});

/*router.use((req, res, next) => {
  if (req.cookies.new != 2) {
    res.cookie("user", "system:logouted", { httpOnly: false, path: "/", maxAge: 365 * 24 * 60 * 60 * 1000 });
    res.cookie("uid", "'logouted'", { httpOnly: false, path: "/", maxAge: 365 * 24 * 60 * 60 * 1000 });
    next();
  }
});*/

router.post("/login", ah(async (req, res) => {
  const { username, password, save} = req.body;

  // DBに存在せず users.json にだけ存在するユーザーは、DBへデータを移してからログイン処理を続ける
  // (uid が未発行のユーザーには、ここで uid も発行される)
  const user = await db.findUserOrMigrate(username);

  if (!user) {
    return render(
      req,
      res,
      "login",
      {
        title: "ログイン",
        page: "login",
        top: "チャットにログイン",
        err: "存在しないユーザー名です",
      },
      tag,
      "chat"
    );
  }

  const match = await bcrypt.compare(password, user.passwordHash);

  if (match) {
    // 元のコードと同じくユーザー名で判定(BANはuidで保存されているため、実際のBAN判定は下のミドルウェアがuidで行う)
    if (await db.isBanned(username)) {
      res.cookie("ban", "true", { httpOnly: false, path: "/" });
      return res.redirect("/chat/ban");
    }

    if (save) {
      res.cookie("user", username, { httpOnly: false, path: "/", maxAge: 365 * 24 * 60 * 60 * 1000 });
      res.cookie("uid", user.uid, { httpOnly: false, path: "/", maxAge: 365 * 24 * 60 * 60 * 1000 });
      res.cookie(
        "isAdmin",
        user.isAdmin ? "true" : "false",
        { httpOnly: false, path: "/", maxAge: 365 * 24 * 60 * 60 * 1000 }
      );
      res.cookie("ban", "false", { httpOnly: false, path: "/", maxAge: 365 * 24 * 60 * 60 * 1000 });
      console.log(
        "Login:",
        username,
        "isAdmin:",
        user.isAdmin
      );
    } else {
      res.cookie("user", username, { httpOnly: false, path: "/", maxAge: 2000 });
      res.cookie("uid", user.uid, { httpOnly: false, path: "/", maxAge: 2000 });
      res.cookie(
        "isAdmin",
        user.isAdmin ? "true" : "false",
        { httpOnly: false, path: "/", maxAge: 2000 }
      );
      res.cookie("ban", "false", { httpOnly: false, path: "/", maxAge: 2000 });
      console.log(
        "Login:",
        username,
        "isAdmin:",
        user.isAdmin
      );
    }
    console.log("login success");
    /*if (!usersData.users[username].publicKey) {
      const cryptoData = await generateCryptoData(password);
      usersData.users[username].publicKey = cryptoData.publicKey;
      usersData.users[username].privateKey = cryptoData.privateKey;
      usersData.users[username].salt = cryptoData.salt;
      usersData.users[username].iv = cryptoData.iv;
    }*/
    return res.redirect("/chat/main");
  } else {
    return render(
      req,
      res,
      "login",
      {
        title: "ログイン",
        page: "login",
        top: "チャットにログイン",
        err: "パスワードが違います",
      },
      tag,
      "chat"
    );
  }
}));

router.post("/signup", ah(async (req, res) => {
  const { username, password, save } = req.body;
  const invalidName = /["' 　]/g;

  // users.json にだけ存在する(未移行の)ユーザー名も「既に存在する」として扱う
  if (await db.findUserOrMigrate(username)) {
    return render(
      req,
      res,
      "signup",
      {
        title: "サインアップ",
        page: "signup",
        top: "サインアップ",
        err: "既に存在するユーザー名です",
      },
      tag,
      "chat"
    );
  }
  if (invalidName.test(username) || username.includes("system")) {
    const message1 = "そのユーザー名は使用できません";
    return render(
      req,
      res,
      "signup",
      {
        title: "サインアップ",
        page: "signup",
        top: "サインアップ",
        err: message1,
      },
      tag,
      "chat"
    );
  }
  if (username.includes("ケッチ")) {
    res.cookie("ban", "true", { httpOnly: false, path: "/", maxAge: 5 * 365 * 24 * 60 * 60 * 1000});
    return res.status(403).redirect("/chat/ban?text=いつもご愛顧いただきありがとうございます^^");
  };

  const passwordHash = await bcrypt.hash(password, 10);
  const uid = "'UID'-" + uuidv4();
  /*const cryptoData = await generateCryptoData(password);
  publicKey = cryptoData.publicKey;
  privateKey = cryptoData.privateKey;
  salt = cryptoData.salt;
  iv = cryptoData.iv;
  users[username] = { passwordHash, isAdmin, color: "#aaa", uid, publicKey, privateKey, salt, iv };*/

  try {
    const created = await db.createUser({
      username,
      passwordHash,
      uid,
      isAdmin: false,
      color: "#aaa",
    });
    if (!created) {
      return render(
        req,
        res,
        "signup",
        {
          title: "サインアップ",
          page: "signup",
          top: "サインアップ",
          err: "既に存在するユーザー名です",
        },
        tag,
        "chat"
      );
    }
    console.log("ユーザー登録成功:", { username, uid });
  } catch (err) {
    console.error("ユーザーデータ保存失敗:", err);
    return res.status(500).send("ユーザーデータの保存に失敗しました。");
  }

  //const rawPrivateKey = unlockPrivateKey(password, privateKey, salt, iv);
  if (save) {
    res.cookie("user", username, { httpOnly: false, path: "/", maxAge: 365 * 24 * 60 * 60 * 1000 });
    res.cookie("uid", uid, { httpOnly: false, path: "/", maxAge: 365 * 24 * 60 * 60 * 1000 });
    res.cookie("isAdmin", "false", { httpOnly: false, path: "/", maxAge: 365 * 24 * 60 * 60 * 1000 });
    //res.cookie("privateKey", rawPrivateKey, { httpOnly: false, path: "/", maxAge: 365 * 24 * 60 * 60 * 1000 });
  } else {
    res.cookie("user", username, { httpOnly: false, path: "/", maxAge: 2000 });
    res.cookie("uid", uid, { httpOnly: false, path: "/", maxAge: 2000 });
    res.cookie("isAdmin", "false", { httpOnly: false, path: "/", maxAge: 2000 });
    //res.cookie("privateKey", rawPrivateKey, { httpOnly: false, path: "/", maxAge: 2000 });
  }
  res.redirect("/chat/main");
}));

router.use(ah(async (req, res, next) => {
  const skipPaths = ["/rules", "/terms", "/ban"];
  if (skipPaths.some((p) => req.path.startsWith(p))) return next();

  let ban = req.cookies.ban;
  const username = req.cookies.user != "system:logouted" ? req.cookies.user : "noUser";

  // DBに無く users.json にだけ存在するユーザーはここでDBへ移す。
  // uid が未発行のユーザーには、移行時に uid を発行する(従来のuid付与処理と同じ)。
  const user = username != "noUser" ? await db.findUserOrMigrate(username) : null;
  if (user) {
    res.cookie("uid", user.uid, { httpOnly: false, path: "/", maxAge: 365 * 24 * 60 * 60 * 1000 })
  }

  const isBanned = await db.isBanned(req.cookies.uid);

  if (!ban) {
    res.cookie("ban", "false", { httpOnly: false, path: "/", maxAge: 365 * 24 * 60 * 60 * 1000});
    ban = "false";
  } else if (isBanned) {
    res.cookie("ban", "true", { httpOnly: false, path: "/", maxAge: 365 * 24 * 60 * 60 * 1000});
  } else {
    res.cookie("ban", "false", { httpOnly: false, path: "/", maxAge: 365 * 24 * 60 * 60 * 1000});
    ban = "false";
  }
  console.log("uid:", req.cookies.uid, ", username:", req.cookies.user, ", ban:", req.cookies.ban, ", ban:", isBanned);
  if (isBanned) {
    res.cookie("ban", "true", { httpOnly: false, path: "/" });
    return res.status(403).redirect("/chat/ban");
  } else {
    res.cookie("ban", "false", { httpOnly: false, path: "/" });
    next();
  }
}));



router.get("/", ah(async (req, res) => {
  const from = req.query.f || "";
  console.log("req.query.f: ", req.query.f);
  console.log("from: ", from);
  if (req.cookies.uid && req.cookies.uid != "'logouted'" && req.cookies.uid.includes("'UID'")) {
    if (await db.isBanned(req.cookies.uid)) {
      res.cookie("ban", "true", { httpOnly: false, path: "/" });
      return res.status(403).redirect("/chat/ban");
    } else {
      res.cookie("ban", "false", { httpOnly: false, path: "/" });
    }
    if (from == "ban") {
      res.redirect("/chat/main?f=ban");
    } else {
      res.redirect("/chat/main");
    }
  } else if (req.cookies.user) {
    if (req.cookies.user == "system:logouted") {
      return res.redirect("/chat/login?f=logouted")
    }
    const user = await db.findUserOrMigrate(req.cookies.user);
    if (!user) {
      return res.redirect("/chat/login?f=chat");
    }
    console.log("user.uid:", user.uid)
    res.cookie("uid", user.uid, { httpOnly: false, path: "/", maxAge: 365 * 24 * 60 * 60 * 1000 });
    
    if (await db.isBanned(user.uid)) {
      res.cookie("ban", "true", { httpOnly: false, path: "/" });
      return res.status(403).redirect("/chat/ban");
    } else {
      res.cookie("ban", "false", { httpOnly: false, path: "/" });
    }
    if (from) {
      res.redirect(`/chat/main?f=${from}`);
    } else {
      res.redirect("/chat/main");
    }
  } else {
    render(
      req,
      res,
      "index",
      {
        title: "チャット",
        page: "chat",
        top: "tonkatsuチャットへようこそ",
        from
      },
      tag,
      "chat"
    );
  }
}));

router.get(["/main", "/main.html"], ah(async (req, res) => {
  if (!req.cookies.uid || !req.cookies.uid.includes("'UID'")) {
    if (req.cookies.user) {
      const user = await db.findUserOrMigrate(req.cookies.user);
      if (!user) {
        return res.redirect("/chat/login?f=chat");
      }
      console.log("main: user.uid:", user.uid)
      res.cookie("uid", user.uid, { httpOnly: false, path: "/", maxAge: 365 * 24 * 60 * 60 * 1000 });
      console.log("uid cookie updated:", user.uid);

      if (await db.isBanned(user.uid)) {
        res.cookie("ban", "true", { httpOnly: false, path: "/" });
        return res.status(403).redirect("/chat/ban");
      } else {
        res.cookie("ban", "false", { httpOnly: false, path: "/" });
        return res.redirect("/chat/main")
      }
    } else {
      return res.redirect("/chat/login?f=chat");
    }
  } else {
    if (await db.isBanned(req.cookies.uid)) {
      res.cookie("ban", "true", { httpOnly: false, path: "/" });
      return res.status(403).redirect("/chat/ban");
    } else {
      res.cookie("ban", "false", { httpOnly: false, path: "/" });
    }
  }
  const from = req.query.f || "undifined";
  console.log("req.query.f: ", req.query.f);
  console.log("from: ", from);
  const username = req.cookies.user;
  const userInfo = await db.findUserOrMigrate(username);
  const isAdminValue = userInfo ? userInfo.isAdmin : "false";
  const uid = req.cookies.uid;
  res.cookie("uid", uid, { httpOnly: false, path: "/" })
  res.cookie("isAdmin", isAdminValue, { httpOnly: false, path: "/" });
  res.cookie("color", userInfo ? userInfo.color : "#aaa", { httpOnly: false, path: "/" });
  res.cookie("ban", "false", { httpOnly: false, path: "/" });
  const banned = await db.getBannedUids();
  const superAdmin = !!userInfo?.superAdmin;
  render(
    req,
    res,
    "main",
    {
      title: "チャット",
      page: "chat/main",
      top: "tonkatsuチャット",
      username: username,
      isAdmin: isAdminValue,
      uid: uid,
      from,
      banned,
      superAdmin,
      maxFileSize
    },
    tag,
    "chat"
  );
}));

router.get(["/login", "/login.html"], (req, res) => {
  render(
    req,
    res,
    "login",
    {
      title: "ログイン",
      page: "chat/login",
      top: "tonkatsuチャットにログイン",
      err: "none"
    },
    tag,
    "chat"
  );
});

router.get(["/signup", "/signup.html"], (req, res) => {
  render(
    req,
    res,
    "signup",
    {
      title: "サインアップ",
      page: "chat/signup",
      top: "tonkatsuチャットにサインアップ",
      err: "none"
    },
    tag,
    "chat"
  );
});

router.get(["/rules", "/rules.html"], (req, res) => {
  res.redirect("/chat/terms");
});

router.get(["/terms", "/terms.html"], (req, res) => {
  render(
    req,
    res,
    "terms",
    {
      title: "利用規約",
      page: "chat/terms",
      top: "tonkatsuチャット利用規約"
    },
    tag,
    "chat"
  );
});

/*
router.get(["/newrules", "/newrules.html"], (req, res) => {
  res.redirect("/chat/newterms");
});

router.get(["/newterms", "/newterms.html"], (req, res) => {
  render(
    req,
    res,
    "newterms",
    {
      title: "新利用規約",
      page: "chat/newterms",
      top: "tonkatsuチャット新利用規約",
    },
    tag,
    "chat"
  );
});
*/

router.get(["/ban", "/ban.html"], ah(async (req, res) => {
  const username = req.cookies.user;
  let uid = "unknown";

  const user = username ? await db.findUserOrMigrate(username) : null;
  if (user) {
    uid = user.uid;
  }
  const text = req.query.text || "null";

  if (await db.isBanned(uid)) {
    res.cookie("ban", "true", { httpOnly: false, path: "/" });
    render(
      req,
      res,
      "ban",
      {
        title: "あなたはBANされています",
        page: "chat/ban",
        text
      },
      tag,
      "chat"
    );
  } else {
    res.cookie("ban", "false", { httpOnly: false, path: "/" });
    res.redirect("/chat/main");
  }
}));

router.get(["/vote", "/vote.html"], ah(async (req, res) => {
  const username = req.cookies.user;
  let uid;
  if (username) {
    const user = await db.findUserOrMigrate(username);
    if (user) uid = user.uid || "unknown";
  }
  if (await db.isBanned(uid)) {
    res.cookie("ban", "true", { httpOnly: false, path: "/" });
    res.status(403).redirect("/chat/ban");
  } else {
    let canVote;
    if (canVoteList.includes(uid) && req.cookies.voted != true) {
      canVote = true;
    } else {
      canVote = false;
    };  
    render(req,
      res,
      "vote",
      {
        title: "投票ページ",
        page: "chat/vote",
        top: "tonkatsuチャット最高管理者投票",
        canVote
      },
      tag,
      "chat"
    );
  }
}));

router.post("/vote", express.urlencoded({ extended: true }), ah(async (req, res) => {
  const target = req.body.target;
  const rawDate = new Date().toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" });
  const firstSpace = rawDate.indexOf(" ");
  let date;
  if (firstSpace !== -1) {
    date = rawDate.slice(0, firstSpace).trim();
  }
  const voteDates = ["2026/3/8", "2026/3/9", "2026/3/10", "2026/3/11", "2026/3/12", "2026/3/13", "2026/3/14", "2026/03/08", "2026/03/09"];
  const username = req.cookies.user;
  let uid = "unknown";

  if (username) {
    const user = await db.findUserOrMigrate(username);
    if (user) uid = user.uid;
  }

  if (!voteDates.includes(date)) return res.json({ error: "投票期間ではありません。" });
  if (!target) return res.json({ error: "投票対象が指定されていません。" });
  if (!canVoteList.includes(uid)) return res.json({ error: "投票権がありません。(cannotVote)" });

  console.log(`voted: ${target}`);
  res.cookie("voted", true, { httpOnly: false, path: "/", maxAge: 7 * 24 * 60 * 60 * 1000 });

  try {
    const count = await db.incrementVote(target);
    if (count === null) {
      return res.json({ error: "投票対象が不正です。" });
    }
    console.log(`投票: ${target}`);
    res.json({ voted: true });
  } catch (err) {
    console.error(`投票処理失敗: ${err.message}`);
    res.json({ error: "サーバーエラー" });
  }
}));

module.exports = router;
