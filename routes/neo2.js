const WebSocket = require("ws");

// ▼ クラウド解析関数（後で定義）
const { decodeCloudNormal } = require("./decodeCloudNormal.js");

const servers = [
  "wss://clouddata.turbowarp.org",
  "wss://clouddata.turbowarp.xyz"
];

async function connect() {
  for (const url of servers) {
    try {
      console.log("接続中:", url);
      await connectOnce(url);
      return;
    } catch (e) {
      console.log("失敗:", url);
    }
  }
  console.log("全てのサーバーへ接続失敗しました");
}

function connectOnce(url) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);

    ws.on("open", () => {
      console.log("接続成功:", url);

      const projectId = "online-tetris-neo2"; // 必要なら変更

      ws.send(JSON.stringify({
        method: "handshake",
        projectId
      }));

      // (通常) の解析に必要なクラウド変数
      // Neo2 は "☁ 0_Neo2" ～ "☁ 9_Neo2" を連結して使う
      for (let i = 0; i < 10; i++) {
        ws.send(JSON.stringify({
          method: "get",
          name: `☁ ${i}_Neo2`
        }));
      }

      resolve();
    });

    const cloudParts = {}; // 0〜9 の値を保持

    ws.on("message", msg => {
      const data = JSON.parse(msg);

      if (!data.name || !data.value) return;
      if (!data.name.startsWith("☁")) return;

      const id = data.name.match(/☁ (\d+)_Neo2/)[1];
      cloudParts[id] = data.value;

      console.log("受信:", data.name, data.value.substring(0,20) + "...");

      // 10個揃ったらデコード
      if (Object.keys(cloudParts).length === 10) {
        const full = Object.values(cloudParts).join("");

        const decoded = decodeCloudNormal(full);

        console.log("デコード結果:", decoded);
      }
    });

    ws.on("error", reject);
    ws.on("close", reject);
  });
}

connect();
