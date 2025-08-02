import dotenv from "dotenv";
dotenv.config();

import { Client, GatewayIntentBits } from "discord.js";
import { google } from "googleapis";

// Discordクライアント設定
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds, 
    GatewayIntentBits.GuildMessages, 
    GatewayIntentBits.MessageContent,
  ],
});

// GCPの設定（環境変数に入れてください）
const PROJECT_ID = process.env.GCP_PROJECT_ID;            // 例: 'palworld-467809'
const ZONE = process.env.GCP_ZONE;                        // 例: 'asia-northeast2-a'
const INSTANCE_NAME = process.env.GCP_INSTANCE_NAME;     // 例: 'palworld'
const DISCORD_BOT_TOKEN = process.env.DISCORD_TOKEN;

if (!PROJECT_ID || !ZONE || !INSTANCE_NAME) {
  console.error("GCP_PROJECT_ID, GCP_ZONE, GCP_INSTANCE_NAME を環境変数で設定してください");
  process.exit(1);
}

// 認証用サービスアカウント JSON キーを環境変数から読み込み
const serviceAccountJson = process.env.GCP_SERVICE_ACCOUNT_JSON;
if (!serviceAccountJson) {
  console.error("GCP_SERVICE_ACCOUNT_JSON を環境変数にセットしてください");
  process.exit(1);
}
const key = JSON.parse(serviceAccountJson);

// Google APIクライアント初期化
const auth = new google.auth.GoogleAuth({
  credentials: key,
  scopes: ["https://www.googleapis.com/auth/cloud-platform"],
});
const compute = google.compute({
  version: "v1",
  auth,
});

// インスタンスの状態取得
async function getInstanceStatus() {
  const res = await compute.instances.get({
    project: PROJECT_ID,
    zone: ZONE,
    instance: INSTANCE_NAME,
  });
  return res.data.status; // 'RUNNING', 'TERMINATED' など
}

// インスタンスの外部IP取得
async function getInstanceExternalIP() {
  const res = await compute.instances.get({
    project: PROJECT_ID,
    zone: ZONE,
    instance: INSTANCE_NAME,
  });

  // ネットワークインターフェースから外部IPを取得
  const interfaces = res.data.networkInterfaces;
  if (!interfaces || interfaces.length === 0) throw new Error("NetworkInterfaces not found");

  for (const iface of interfaces) {
    const accessConfigs = iface.accessConfigs;
    if (!accessConfigs || accessConfigs.length === 0) continue;
    for (const accessConfig of accessConfigs) {
      if (accessConfig.natIP) return accessConfig.natIP;
    }
  }
  throw new Error("External IP not found");
}

// インスタンス起動
async function startInstance() {
  const status = await getInstanceStatus();
  if (status === "RUNNING") return "✅ インスタンスはすでに起動しています。";

  await compute.instances.start({
    project: PROJECT_ID,
    zone: ZONE,
    instance: INSTANCE_NAME,
  });
  return "🚀 インスタンスの起動を開始しました。";
}

// インスタンス停止
async function stopInstance() {
  await compute.instances.stop({
    project: PROJECT_ID,
    zone: ZONE,
    instance: INSTANCE_NAME,
  });
  return "🛑 インスタンスを停止しました。";
}

// 起動完了待ちポーリング
async function waitForInstanceRunning(maxRetries = 15, delayMs = 10000) {
  for (let i = 0; i < maxRetries; i++) {
    const status = await getInstanceStatus();
    if (status === "RUNNING") return;
    console.log(`⌛ インスタンス起動待機中... (${i + 1}/${maxRetries})`);
    await new Promise((r) => setTimeout(r, delayMs));
  }
  throw new Error("インスタンスが起動しませんでした（タイムアウト）");
}

// Palworldのポート（固定）
const PALWORLD_PORT = 8211;

// Discord Bot 起動完了
client.on("ready", () => {
  console.log(`✅ Bot起動完了: ${client.user.tag}`);
});

// Discord メッセージ受信処理
client.on("messageCreate", async (message) => {
  if (message.author.bot) return;

  if (message.content === "!ping") {
    await message.reply("pong!");
  }

  if (message.content === "!start") {
    await message.channel.send("🔓 VPSの起動を開始します...");
    try {
      const startMsg = await startInstance();
      await message.channel.send(startMsg);

      await waitForInstanceRunning();

      const ip = await getInstanceExternalIP();

      await message.channel.send(`🎮 Palworldサーバーは起動中です。\n📡 接続先: \`${ip}:${PALWORLD_PORT}\``);
    } catch (err) {
      console.error("=== !start エラー ===", err);
      await message.channel.send(`⚠️ エラー: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  if (message.content === "!stop") {
    await message.channel.send("🛑 VPSを停止中...");
    try {
      const msg = await stopInstance();
      await message.channel.send(msg);
    } catch (err) {
      console.error("=== !stop エラー ===", err);
      await message.channel.send(`⚠️ エラー: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
});

// Discordログイントークン
client.login(DISCORD_BOT_TOKEN);

// RailwayなどでBotを死なせないための保活（無限待機）
setInterval(() => {}, 1 << 30);
