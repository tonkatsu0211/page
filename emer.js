const express = require('express');
const app = express();
const path = require('path');
const cookieParser = require("cookie-parser");
const session = require('express-session');
const bcrypt = require('bcrypt');
const users = require('./users.json'); // { username: { passwordHash } }

app.use(session({
  secret: 'tonkatsu-0211',
  resave: false,
  saveUninitialized: false
}));

app.use(cookieParser());

app.use(express.static("public"));

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'pcViews'));

app.use(express.json());

app.post('/log', (req, res) => {
  console.log(req.body.message);
  res.json({ status: 'ok' });
});

app.use("/games", require("./routes/games"));
app.use("/chat", require("./routes/chat"));
app.use("/bbs", require("./routes/bbs"));
app.use("/service", require("./routes/service"));
app.use("/uploads", require("./routes/uploads"));

app.post('/login', async (req, res) => {
  const { username, password } = req.body;
  const user = users[username];

  if (user && await bcrypt.compare(password, user.passwordHash)) {
    req.session.user = username;
    res.redirect('/');
  } else {
    render(req, res, 'login', { title: "ログイン", err: "ユーザー名またはパスワードが違います" });
  }
});

app.post('/signup', async (req, res) => {
  const { username, password } = req.body;

  if (users[username]) {
    return render('signup', { title: "新規登録", err: "既に存在するユーザー名です" });
  }

  const passwordHash = await bcrypt.hash(password, 10);
  users[username] = { passwordHash };
  require('fs').writeFileSync('./users.json', JSON.stringify(users));

  req.session.user = username;
  res.redirect('/');
});

function render(req, res, view, data = {}, locate = "") {
  const qE = req.query.e || "";
  if (view == "error" && qE) {
    console.log(`redirect by 404 to /error?e=${qE} in maintenancing`);
  }
  const name = locate ? `${locate}/${view}` : view;
  res.render(name, { ...data , em: "true"}, (err, html) => {
    if (err) {
      console.log(`404 at /${name} in maintenancing`);
      res.status(404).render('error', {
        title: "404 Not Found",
        page: "error",
        ec: view
      });
    } else {
      console.log(`access to /${name} in maintenancing ... OK`);
      res.send(html);
    }
  });
}


app.get(["/empass", "/empass/index", "/empass/top", "/empass/index.html"], (req, res) => {
  const from = req.query.f || "";
  render(req, res, "index", { from, title: "_tonkatsu_のページ", page: "index", top: "_tonkatsu_ / tonkatsu0211のページにようこそ!!"});
});

app.get(["/empass/my", "/empass/my.html"], (req, res) => {
  render(req, res, "my", { title: "自己紹介(事故紹介)", page: "my", top: "自己紹介(事故紹介)"});
});

app.get(["/empass/projects", "/empass/projects.html"], (req, res) => {
  render(req, res, "projects", { title: "作品", page: "projects", top: "Scratchの作品"});
});

app.get("/empass/const", (req, res) => {
  render(req, res, "constructing", { title: "建設中のページ", page: "const", top: "建設中"});
});

app.get(["/empass/constructing", "/empass/const", "/empass/constructing.html"], (req, res) => {
  render(req, res, "constructing", { title: "建設中のページ", page: "constructing", top: "建設中"});
});

app.get("/empass/const1", (req, res) => {
  render(req, res, "constructing", { title: "建設中のページ", page: "const1", top: "建設中"});
});

app.get(["/empass/constructing1", "/empass/const1", "/empass/constructing1.html"], (req, res) => {
  render(req, res, "constructing1", { title: "建設中のページ", page: "constructing1", top: "建設中"});
});

app.get(["/empass/contact", "/empass/contact.html"], (req, res) => {
  render(req, res, "contact", { title: "お問い合わせ", page: "contact", top: "お問い合わせ"});
});

app.get(["/empass/beforeBreak", "/empass/beforeBreak.html"], (req, res) => {
  render(req, res, "beforeBreak", { title: "_tonkatsu_のページ", page: "beforeBreak", top: "履歴破壊"});
});

app.get(["/empass/updates", "/empass/updates.html"], (req, res) => {
  render(req, res, "updates", { title: "ページ更新履歴", page: "updates", top: "ページ更新履歴"});
});

app.get(["/empass/games", "/empass/games.html"], (req, res) => {
  render(req, res, "games", { title: "_tonkatsu_のページ", page: "games", top: "ゲームをプレイ"});
});

app.get(["/empass/login", "/empass/login.html"], (req, res) => {
  render(req, res, "login", { title: "ログイン", page: "chat", top: "チャットにログイン", err: "none"});
});

app.get(["/empass/games/:id", "/empass/games/:id.html"], (req, res) => {
  let gameId = req.params.id;
  gameId = gameId.replace(/\.(html|ejs)$/, "");
  render(req, res, gameId, {}, "games");
});


app.get(["/empass/error", "/empass/error/.html"], (req, res) => {
  render(req, res, "error", { title: "404 Not Found", page: "error", ec: null });
});

app.use((req, res) => {
  console.log("access in maintenancing")
  res.render("emer", { title: "_tonkatsu_のページ", page: "emer", top: "メンテナンス中", em: "true"});
});

const port = process.env.PORT || 3000;
const listener = app.listen(port, () => {
  console.log("App listening on port " + listener.address().port);
});
