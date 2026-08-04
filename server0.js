const express = require("express");
const app = express();
const path = require("path");

app.use(express.static("public"));
app.use(express.static("settings"));

app.get(["/", "/index", "/index/", "/top", "/top/"], (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.get(["/my", "/my/"], (req, res) => {
  res.sendFile(path.join(__dirname, "public", "my.html"));
});

app.get(["/projects", "/projects/"], (req, res) => {
  res.sendFile(path.join(__dirname, "public", "projects.html"));
});

app.get(["/constructing", "/constructing/"], (req, res) => {
  res.sendFile(path.join(__dirname, "public", "constructing.html"));
});

app.get(["/constructing1", "/constructing1/"], (req, res) => {
  res.sendFile(path.join(__dirname, "public", "constructing1.html"));
});

app.get(["/contact", "/contact/"], (req, res) => {
  res.sendFile(path.join(__dirname, "public", "contact.html"));
});

app.get(["/beforeBreak", "/beforeBreak/"], (req, res) => {
  res.sendFile(path.join(__dirname, "public", "beforeBreak.html"));
});

app.get(["/updates", "/updates/"], (req, res) => {
  res.sendFile(path.join(__dirname, "public", "updates.html"));
});

app.get(["/error", "/error/"], (req, res) => {
  res.sendFile(path.join(__dirname, "public", "error.html"));
});

app.get(["/footer", "/footer/"], (req, res) => {
  res.sendFile(path.join(__dirname, "settings", "error.html"))
});

app.use((req, res) => {
  const pageName = req.path.replace("/", "");
  res.status(404).redirect(`/error?e=${encodeURIComponent(pageName)}`);
});

const listener = app.listen(process.env.PORT, () => {
  console.log("App listening on port " + listener.address().port);
});
