import dotenv from "dotenv";
dotenv.config();

import fs from "fs";
import os from "os";
import path from "path";
import { google } from "googleapis";
import { Client, GatewayIntentBits } from "discord.js";

const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
const GCP_PROJECT_ID = process.env.GCP_PROJECT_ID;
const GCP_ZONE = process.env.GCP_ZONE;
const GCP_INSTANCE_NAME = process.env.GCP_INSTANCE_NAME;

const VPS_IP = process.env.VPS_IP;
const PALWORLD_PORT = process.env.PALWORLD_PORT || "8211";

const GCP_SERVICE_ACCOUNT_JSON = process.env.GCP_SERVICE_ACCOUNT_JSON;
if (!GCP_SERVICE_ACCOUNT_JSON) {
  console.error("❌ 環境変数 GCP_SERVICE_ACCOUNT_JSON が設定されていません。");
  process.exit(1);
}

let cachedKeyPath = null;

async function getAuthClient() {
  if (!cachedKeyPath) {
    // 一時ファイルのパスを作成
    const tmpDir = os.tmpdir();
    const keyPath = path.join(tmpDir, "gcp-sa-key.json");

    // 環境変数のJSONをファイルに書き出し
    fs.writeFileSync(keyPath, GCP_SERVICE_ACCOUNT_JSON, { mode: 0o600 });
    cachedKeyPath = keyPath;
  }

  const auth = new google.auth.GoogleAuth({
    keyFile: cachedKeyPath,
    scopes: ["https://www.googleapis.com/auth/cloud-platform"],
  });

  return auth.getClient();
}

async function getCompute() {
  const authClient = await getAuthClient();
  return google.compute({
    version: "v1",
    auth: authClient,
  });
}

async function getInstanceStatus() {
  const compute = await getCompute();

  const res = await compute.instances.get({
    project: GCP_PROJECT_ID,
    zone: GCP_ZONE,
    instance: GCP_INSTANCE_NAME,
  });

  return res.data.status; // e.g. "RUNNING", "TERMINATED"
}

async function startInstance() {
  const compute = await getCompute();

  const status = await getInstanceStatus();
  if (status === "RUNNING") {
    return "✅ インスタンスはすでに起動中です。";
  }

  await compute.instances.start({
    project: GCP_PROJECT_ID,
    zone: GCP_ZONE,
    instance: GCP_INSTANCE_NAME,
  });

  return "🚀 インスタンス起動を開始しました。";
}

async function stopInstance() {
  const compute = await getCompute();

  await compute.instances.stop({
    project: GCP_PROJECT_ID,
    zone: GCP_ZONE,
    instance: GCP_INSTANCE_NAME,
  });

  return "🛑 インスタンスを停止しました。";
}

async function waitForRunning(maxRetries = 20, delayMs = 10000) {
  for (let i = 0; i < maxRetries; i++) {
    const status = await getInstanceStatus();
    if (status === "RUNNING") return;
    console.log(`⌛ インスタンス起動待ち中... (${i + 1}/${maxRetries})`);
    await new Promise((r) => setTimeout(r, delayMs));
  }
  throw new Error("インスタンスが起動しませんでした（タイムアウト）");
}

// Discord Bot 設定
const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent],
});

client.once("ready", () => {
  console.log(`✅ Bot 起動完了: ${client.user.tag}`);
});

client.on("messageCreate", async (message) => {
  if (message.author.bot) return;

  if (message.content === "!ping") {
    await message.reply("pong!");
  }

  if (message.content === "!start") {
    await message.channel.send("🔓 インスタンス起動処理を開始します...");
    try {
      const msg = await startInstance();
      await message.channel.send(msg);

      await waitForRunning();

      await message.channel.send(`🎮 Palworldサーバーは起動しました。\n📡 接続先: \`${VPS_IP}:${PALWORLD_PORT}\``);
    } catch (err) {
      console.error("!start エラー", err);
      await message.channel.send(`⚠️ エラー: ${err.message}`);
    }
  }

  if (message.content === "!stop") {
    await message.channel.send("🛑 インスタンス停止処理を開始します...");
    try {
      const msg = await stopInstance();
      await message.channel.send(msg);
    } catch (err) {
      console.error("!stop エラー", err);
      await message.channel.send(`⚠️ エラー: ${err.message}`);
    }
  }
});

client.login(DISCORD_TOKEN);

// 常駐維持用（Railwayで使う）
setInterval(() => {}, 1 << 30);
