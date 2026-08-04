const express = require("express");
const app = express();
const router = express.Router();
const path = require("path");
const fs = require("fs");
const session = require("express-session")
const usersPath = path.join(__dirname, "..", "users.json");
let usersData = JSON.parse(fs.readFileSync(usersPath, "utf-8"));
const votedPath = path.join(__dirname, "..", "vote.json");
let votedData = JSON.parse(fs.readFileSync(votedPath, "utf-8"));
const bcrypt = require("bcrypt");
const http = require("http").createServer(app);
const { v4: uuidv4 } = require("uuid");
const { Server } = require("socket.io");
const io = new Server(http);
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

function getUsernameByUid(uid) {
  const usersData = JSON.parse(fs.readFileSync(usersPath, "utf-8"));
  for (const [username, info] of Object.entries(usersData.users)) {
    if (info.uid === uid) return username;
  }
  return null;
}

const bannedUsersPath = path.join(__dirname, "..", "bannedUsers.json");

let bannedUsers;

function loadBannedUsers() {
  try {
    const data = fs.readFileSync(bannedUsersPath, "utf8");
    bannedUsers = Array.from(JSON.parse(data).users);
  } catch (e) {
    console.error(`loadBannedUsers error: ${e.message}`);
  }
}

loadBannedUsers();

io.on("connection", (socket) => {
  const username = socket.handshake.auth.username;
  if (bannedUsers.includes(username)) {
    socket.emit("redirect", "/chat/ban");
    socket.disconnect(true);
  }
});

/*router.use((req, res, next) => {
  if (req.cookies.new != 2) {
    res.cookie("user", "system:logouted", { httpOnly: false, path: "/", maxAge: 365 * 24 * 60 * 60 * 1000 });
    res.cookie("uid", "'logouted'", { httpOnly: false, path: "/", maxAge: 365 * 24 * 60 * 60 * 1000 });
    next();
  }
});*/

router.post("/login", async (req, res) => {
  const { username, password, save} = req.body;
  const usersData = JSON.parse(fs.readFileSync(usersPath, "utf-8"));
  const users = usersData.users;

  if (!users[username]) {
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

  const match = await bcrypt.compare(password, users[username].passwordHash);

  loadBannedUsers();

  if (match) {
    if (bannedUsers.includes(username)) {
      res.cookie("ban", "true", { httpOnly: false, path: "/" });
      return res.redirect("/chat/ban");
    }

    if (save) {
      res.cookie("user", username, { httpOnly: false, path: "/", maxAge: 365 * 24 * 60 * 60 * 1000 });
      res.cookie("uid", usersData.users[username].uid, { httpOnly: false, path: "/", maxAge: 365 * 24 * 60 * 60 * 1000 });
      res.cookie(
        "isAdmin",
        usersData.users[username].isAdmin === "true" ? "true" : "false",
        { httpOnly: false, path: "/", maxAge: 365 * 24 * 60 * 60 * 1000 }
      );
      res.cookie("ban", "false", { httpOnly: false, path: "/", maxAge: 365 * 24 * 60 * 60 * 1000 });
      console.log(
        "Login:",
        username,
        "isAdmin:",
        usersData.users[username].isAdmin
      );
    } else {
      res.cookie("user", username, { httpOnly: false, path: "/", maxAge: 2000 });
      res.cookie("uid", usersData.users[username].uid, { httpOnly: false, path: "/", maxAge: 2000 });
      res.cookie(
        "isAdmin",
        usersData.users[username].isAdmin === "true" ? "true" : "false",
        { httpOnly: false, path: "/", maxAge: 2000 }
      );
      res.cookie("ban", "false", { httpOnly: false, path: "/", maxAge: 2000 });
      console.log(
        "Login:",
        username,
        "isAdmin:",
        usersData.users[username].isAdmin
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
});

router.post("/signup", async (req, res) => {
  const usersFilePath = path.join(__dirname, "..", "users.json");
  let allUsers;

  try {
    allUsers = JSON.parse(fs.readFileSync(usersFilePath, "utf8"));
  } catch (err) {
    console.error("users.json 読み込み失敗:", err);
    return res.status(500).send("ユーザーデータの読み込みに失敗しました。");
  }

  const users = allUsers.users;
  const { username, password, save } = req.body;
  const invalidName = /["' 　]/g;

  if (users[username]) {
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
  const isAdmin = "false";
  const uid = "'UID'-" + uuidv4();
  /*const cryptoData = await generateCryptoData(password);
  publicKey = cryptoData.publicKey;
  privateKey = cryptoData.privateKey;
  salt = cryptoData.salt;
  iv = cryptoData.iv;
  users[username] = { passwordHash, isAdmin, color: "#aaa", uid, publicKey, privateKey, salt, iv };*/
  users[username] = { passwordHash, isAdmin, color: "#aaa", uid };

  try {
    fs.writeFileSync(usersFilePath, JSON.stringify({ users }, null, 2));
    fs.writeFileSync(
      path.join(__dirname, "..", "usersBackup.json"),
      JSON.stringify({ users }, null, 2)
    );
    console.log("ユーザー登録＆バックアップ成功:", users[username]);
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
});

router.use((req, res, next) => {
  const skipPaths = ["/rules", "/terms", "/ban"];
  if (skipPaths.some((p) => req.path.startsWith(p))) return next();

  let ban = req.cookies.ban;
  const username = req.cookies.user != "system:logouted" ? req.cookies.user : "noUser";

  const usersData = JSON.parse(fs.readFileSync(usersPath, "utf-8"));

  if (usersData.users[username] && !usersData.users[username].uid) {
    usersData.users[username].uid = "'UID'-" + uuidv4();
    fs.writeFileSync(usersPath, JSON.stringify(usersData, null, 2));
    res.cookie("uid", usersData.users[username].uid, { httpOnly: false, path: "/", maxAge: 365 * 24 * 60 * 60 * 1000 })
    console.log(`UIDを発行: ${username} => ${usersData.users[username].uid}`);
  }

  let uid;
  if (username != "noUser" && usersData.users[username]) {
    uid = usersData.users[username].uid;
    res.cookie("uid", uid, { httpOnly: false, path: "/", maxAge: 365 * 24 * 60 * 60 * 1000 })
  }

  loadBannedUsers();

  if (!ban) {
    res.cookie("ban", "false", { httpOnly: false, path: "/", maxAge: 365 * 24 * 60 * 60 * 1000});
    ban = "false";
  } else if (bannedUsers.includes(req.cookies.uid)) {
    res.cookie("ban", "true", { httpOnly: false, path: "/", maxAge: 365 * 24 * 60 * 60 * 1000});
  } else {
    res.cookie("ban", "false", { httpOnly: false, path: "/", maxAge: 365 * 24 * 60 * 60 * 1000});
    ban = "false";
  }
  console.log("uid:", req.cookies.uid, ", username:", req.cookies.user, ", ban:", req.cookies.ban, ", ban:", bannedUsers.includes(req.cookies.uid));
  if (bannedUsers.includes(req.cookies.uid)) {
    res.cookie("ban", "true", { httpOnly: false, path: "/" });
    return res.status(403).redirect("/chat/ban");
  } else {
    res.cookie("ban", "false", { httpOnly: false, path: "/" });
    next();
  }
});



router.get("/", (req, res) => {
  const usersData = JSON.parse(fs.readFileSync(usersPath, "utf-8"));
  const from = req.query.f || "";
  console.log("req.query.f: ", req.query.f);
  console.log("from: ", from);
  loadBannedUsers();
  if (req.cookies.uid && req.cookies.uid != "'logouted'" && req.cookies.uid.includes("'UID'")) {
    if (bannedUsers.includes(req.cookies.uid)) {
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
      res.redirect("/chat/login?f=logouted")
    }
    console.log("usersData.users[req.cookies.user].uid:", usersData.users[req.cookies.user].uid)
    res.cookie("uid", usersData.users[req.cookies.user].uid, { httpOnly: false, path: "/", maxAge: 365 * 24 * 60 * 60 * 1000 });
    
    if (bannedUsers.includes(req.cookies.uid)) {
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
});

router.get(["/main", "/main.html"], (req, res) => {
  let usersData = JSON.parse(fs.readFileSync(usersPath, "utf-8"));
  if (!req.cookies.uid || !req.cookies.uid.includes("'UID'")) {
    if (req.cookies.user) {
      console.log("main: usersData.users[req.cookies.user].uid:", usersData.users[req.cookies.user].uid)
      res.cookie("uid", usersData.users[req.cookies.user].uid, { httpOnly: false, path: "/", maxAge: 365 * 24 * 60 * 60 * 1000 });
      console.log("uid cookie updated:", req.cookies.uid);

      loadBannedUsers();
      if (bannedUsers.includes(req.cookies.uid)) {
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
    if (bannedUsers.includes(req.cookies.uid)) {
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
  usersData = JSON.parse(fs.readFileSync(usersPath, "utf-8"));
  const userInfo = usersData.users[username];
  const isAdminValue = userInfo ? userInfo.isAdmin == "true" : "false";
  const uid = req.cookies.uid;
  res.cookie("uid", uid, { httpOnly: false, path: "/" })
  res.cookie("isAdmin", isAdminValue, { httpOnly: false, path: "/" });
  res.cookie("color", userInfo ? userInfo.color : "#aaa", { httpOnly: false, path: "/" });
  res.cookie("ban", "false", { httpOnly: false, path: "/" });
  loadBannedUsers();
  const superAdmin = (usersData.users[username]?.superAdmin || false ? true : false) || false;
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
      banned: bannedUsers,
      superAdmin
    },
    tag,
    "chat"
  );
});

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

router.get(["/ban", "/ban.html"], (req, res) => {
  const username = req.cookies.user;
  let uid = "unknown";

  if (username && usersData.users[username]) {
    uid = usersData.users[username].uid;
  }
  const text = req.query.text || "null";

  if (bannedUsers.includes(uid)) {
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
});

router.get(["/vote", "/vote.html"], (req, res) => {
  const username = req.cookies.user;
  let uid;
  if (username && usersData.users[username]) {
    uid = usersData.users[username].uid || "unknown";
  }
  loadBannedUsers();
  if (bannedUsers.includes(uid)) {
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
});

router.post("/vote", express.urlencoded({ extended: true }), (req, res) => {
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

  if (username && usersData.users[username]) {
    uid = usersData.users[username].uid;
  }

  if (!voteDates.includes(date)) return res.json({ error: "投票期間ではありません。" });
  if (!target) return res.json({ error: "投票対象が指定されていません。" });
  if (!canVoteList.includes(uid)) return res.json({ error: "投票権がありません。(cannotVote)" });

  console.log(`voted: ${target}`);
  res.cookie("voted", true, { httpOnly: false, path: "/", maxAge: 7 * 24 * 60 * 60 * 1000 });

  try {
    votedData[target] = votedData[target] + 1;
    fs.writeFileSync(votedPath, JSON.stringify(votedData, null, 2));
    console.log(`投票: ${target}`);
    res.json({ voted: true });
  } catch (err) {
    console.error(`投票処理失敗: ${err.message}`);
    res.json({ error: "サーバーエラー" });
  }
});

module.exports = router;
