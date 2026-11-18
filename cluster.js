// 複数のサーバー(例: Render と Railway)が同じ DB を共有しているとき、
// Socket.IO のイベント(チャットの送受信・削除・BAN・DM など)を互いに中継する。
//
// 使うアダプターは環境変数で決まる:
//   CLUSTER_SYNC=off  → 同期しない(1台だけで動かすとき)
//   REDIS_URL あり    → Redis アダプター(Upstash など)   ← 推奨
//   それ以外          → Postgres アダプター(LISTEN/NOTIFY。Neon では直接接続が必要)
//
// Redis (Upstash) の場合:
//   REDIS_URL には Upstash の「TCP」の接続文字列(rediss://default:パスワード@ホスト:6379)を設定する。
//   REST 用の URL / トークンではないので注意(Pub/Sub は TCP でしか使えない)。
//   必要なパッケージ: npm install @socket.io/redis-adapter ioredis

function chooseMode(env = process.env) {
  if (env.CLUSTER_SYNC === "off") return "off";
  if (env.REDIS_URL) return "redis";
  return "postgres";
}

// 同じエラーを毎回ログに出さない(Upstashの上限超過などで大量に出るのを防ぐ)
function createRateLimitedLogger(intervalMs = 60000) {
  let last = 0;
  return (...args) => {
    const now = Date.now();
    if (now - last >= intervalMs) {
      last = now;
      console.error(...args);
    }
  };
}

async function initRedis(io, env) {
  const { createAdapter } = require("@socket.io/redis-adapter");
  const Redis = require("ioredis");
  const logError = createRateLimitedLogger();

  const options = {
    // 接続が切れている間はコマンドを溜めて、復旧したら送る(エラーにしない)
    maxRetriesPerRequest: null,
    retryStrategy: (times) => Math.min(times * 200, 5000),
  };
  const pubClient = new Redis(env.REDIS_URL, options);
  const subClient = pubClient.duplicate();
  for (const [name, c] of [["pub", pubClient], ["sub", subClient]]) {
    c.on("error", (err) => logError(`[cluster] Redis(${name}) error:`, err.message));
  }

  // アダプターは publish の結果を待たない。Upstash の無料枠の上限超過などでエラーが返ると
  // 「未処理のPromise拒否」になり、Node.js のプロセスが落ちてしまうので、ここで受け止める。
  for (const method of ["publish", "publishBuffer"]) {
    if (typeof pubClient[method] !== "function") continue;
    const original = pubClient[method].bind(pubClient);
    pubClient[method] = (...args) =>
      Promise.resolve(original(...args)).catch((err) => {
        logError(`[cluster] Redis ${method} に失敗(他のサーバーへ届きません):`, err.message);
        return 0;
      });
  }

  // 起動時に接続を確認(10秒で見切る)。つながらなければ同期なしで起動する。
  try {
    await Promise.race([
      pubClient.ping(),
      new Promise((_, reject) => setTimeout(() => reject(new Error("接続がタイムアウトしました")), 10000)),
    ]);
  } catch (err) {
    console.error("[cluster] Redis に接続できません。サーバー間の同期なしで起動します:", err.message);
    pubClient.disconnect();
    subClient.disconnect();
    return;
  }

  io.adapter(createAdapter(pubClient, subClient, { publishOnSpecificResponseChannel: true }));
  console.log("[cluster] サーバー間の同期を有効にしました (Redis)");
}

// ---- Postgres アダプター(Redis を使わない場合) ----
function directUrl(env = process.env) {
  const url = env.DATABASE_URL_DIRECT || env.DATABASE_URL;
  return url ? url.replace(/-pooler(?=\.)/, "") : undefined;
}

async function initPostgres(io, env) {
  const { createAdapter } = require("@socket.io/postgres-adapter");
  const { Pool } = require("pg");
  const pool = new Pool({
    connectionString: directUrl(env),
    ssl: env.PGSSL === "true" ? { rejectUnauthorized: false } : undefined,
    max: 5,
    keepAlive: true,
  });
  pool.on("error", (err) => console.error("[cluster] Postgres error:", err));

  // 8000バイトを超える通知(長いDMなど)を一時的に置く表
  await pool.query(`
    CREATE TABLE IF NOT EXISTS socket_io_attachments (
      id         bigserial UNIQUE,
      created_at timestamptz DEFAULT NOW(),
      payload    bytea
    )
  `);

  io.adapter(createAdapter(pool));
  console.log("[cluster] サーバー間の同期を有効にしました (Postgres LISTEN/NOTIFY)");
}

async function init(io, env = process.env) {
  const mode = chooseMode(env);
  if (mode === "off") {
    console.log("[cluster] CLUSTER_SYNC=off のため、サーバー間の同期は無効です");
  } else if (mode === "redis") {
    await initRedis(io, env);
  } else {
    await initPostgres(io, env);
  }
}

module.exports = { init, chooseMode, directUrl, createRateLimitedLogger };
