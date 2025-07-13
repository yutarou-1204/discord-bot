import dotenv from "dotenv";
dotenv.config();

import { Client, GatewayIntentBits } from "discord.js";
import fetch from "node-fetch";

// Discordクライアント設定
const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent],
});

// ConoHa API設定
const CONOHA_IDENTITY_URL = "https://identity.c3j1.conoha.io/v3/auth/tokens";
const CONOHA_COMPUTE_URL = "https://compute.c3j1.conoha.io/v2.1";
const TENANT_ID = "7544f37d10be4ff7a638d1b34c6732b1";
const SERVER_ID = "e082a5ff-018b-4bc9-994b-4d5494185094";
const USERNAME = "gncu33184909";
const PASSWORD = "Y6xLYEsN-k3muLU";

// Palworld接続先ポート
const VPS_IP = "160.251.250.40";
const PALWORLD_PORT = 8211;

// Discordトークン
const DISCORD_BOT_TOKEN = process.env.DISCORD_TOKEN;

// トークン取得
async function getToken() {
  const res = await fetch(CONOHA_IDENTITY_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      auth: {
        identity: {
          methods: ["password"],
          password: {
            user: {
              name: USERNAME,
              domain: { id: "default" },
              password: PASSWORD,
            },
          },
        },
        scope: { project: { id: TENANT_ID } },
      },
    }),
  });

  const token = res.headers.get("x-subject-token");
  if (!res.ok) throw new Error(`Auth failed: ${res.statusText}`);
  if (!token) throw new Error("Token not found in response headers");

  return token;
}

// VPS状態取得
async function getVPSStatus(token) {
  const res = await fetch(`${CONOHA_COMPUTE_URL}/servers/${SERVER_ID}`, {
    headers: { "X-Auth-Token": token },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`VPS status check failed: ${res.statusText}`);
  return data.server?.status;
}

// VPS起動
async function startVPS(token) {
  const status = await getVPSStatus(token);
  if (status === "ACTIVE") return "✅ VPSはすでに起動しています。";

  const res = await fetch(`${CONOHA_COMPUTE_URL}/servers/${SERVER_ID}/action`, {
    method: "POST",
    headers: { "X-Auth-Token": token, "Content-Type": "application/json" },
    body: JSON.stringify({ "os-start": null }),
  });

  if (!res.ok) throw new Error(`VPS start failed: ${res.statusText}`);
  return "🚀 VPSの起動コマンドを送信しました。";
}

// VPS停止
async function stopVPS(token) {
  const res = await fetch(`${CONOHA_COMPUTE_URL}/servers/${SERVER_ID}/action`, {
    method: "POST",
    headers: { "X-Auth-Token": token, "Content-Type": "application/json" },
    body: JSON.stringify({ "os-stop": null }),
  });

  if (!res.ok) throw new Error(`VPS stop failed: ${res.statusText}`);
  return "🛑 VPSを停止しました。";
}

// 起動完了までポーリング
async function waitForVPS(token, maxRetries = 15, delayMs = 10000) {
  for (let i = 0; i < maxRetries; i++) {
    const status = await getVPSStatus(token);
    if (status === "ACTIVE") return;
    console.log(`⌛ VPS起動待機中... (${i + 1}/${maxRetries})`);
    await new Promise((res) => setTimeout(res, delayMs));
  }
  throw new Error("VPSが起動しませんでした（タイムアウト）");
}

// Discord Bot 処理
client.on("ready", () => {
  console.log(`✅ Bot起動完了: ${client.user.tag}`);
});

client.on("messageCreate", async (message) => {
  if (message.author.bot) return;

  if (message.content === "!ping") {
    await message.reply("pong!");
  }

  if (message.content === "!start") {
    await message.channel.send("🔓 VPSの起動を開始します...");
    try {
      const token = await getToken();
      const startMsg = await startVPS(token);
      await message.channel.send(startMsg);

      await waitForVPS(token);

      await message.channel.send(`🎮 Palworldサーバーは自動起動しています。\n📡 接続先: \`${VPS_IP}:${PALWORLD_PORT}\``);
    } catch (err) {
      console.error("=== !start エラー ===", err);
      await message.channel.send(`⚠️ エラー: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  if (message.content === "!stop") {
    await message.channel.send("🛑 VPSを停止中...");
    try {
      const token = await getToken();
      const msg = await stopVPS(token);
      await message.channel.send(msg);
    } catch (err) {
      console.error("=== !stop エラー ===", err);
      await message.channel.send(`⚠️ エラー: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
});

client.login(DISCORD_BOT_TOKEN);

// Railwayなどの常駐維持用
setInterval(() => {}, 1 << 30);
