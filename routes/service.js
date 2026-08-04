const express = require("express");
const app = express();
const path = require("path");
const router = express.Router();
const cookieParser = require("cookie-parser");
const session = require("express-session");
const serviceIds = ["upload", "android", "clock", "youtube", "srev", "kyoshin", "5000generator", "scratch-message-count", "zeller", "htmlget"];
const serviceNames = ["ファイルアップロードサービス", "Androidエミュレーター", "デジタル時計", "YouTube簡易プレーヤー", "リアルタイム地震ビューアー", "リアルタイム震度(強震モニタ)", "5000兆円ジェネレーター", "Scratch通知数取得", "日付から曜日を求める", "HTMLビューアー"];

router.get(["/"], (req, res) => {
  render(req, res, "index", {
    title: "_tonkatsu_のページ",
    page: "service",
    top: "Webサービス",
    serviceIds,
    serviceNames
  }, "service", "service");
});

router.get(["/:id", "/:id.html"], (req, res) => {
  let serviceId = req.params.id;
  serviceId = serviceId.replace(/\.(html|ejs)$/, "");
  const serviceNum = serviceIds.indexOf(serviceId);
  console.log("service.js: serviceNum: ", serviceNum)
  if (serviceNum < 0) return render(req, res, "error", {
    title: "404 Not Found",
    page: "error",
    ec: `service/${serviceId}`,
  });
  const serviceName = serviceNames[serviceNum]
  render(req, res, serviceId, {
    title: serviceName,
    page: `service/${serviceId}`,
    top: serviceName,
    error: null,
    url: null
  }, "service", "service");
});

module.exports = router;