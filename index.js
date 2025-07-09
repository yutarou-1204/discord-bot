import dotenv from "dotenv";
dotenv.config();

import { Client, GatewayIntentBits } from "discord.js";
import fetch from "node-fetch";
import { exec } from "child_process";

// Discordクライアント設定
const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent],
});

// ConoHa設定
const CONOHA_IDENTITY_URL = "https://identity.c3j1.conoha.io/v3/auth/tokens";
const CONOHA_COMPUTE_URL = "https://compute.c3j1.conoha.io/v2.1";
const TENANT_ID = "7544f37d10be4ff7a638d1b34c6732b1";
const SERVER_ID = "b9d544e5-5606-4125-81f8-05a61d1e6f01";
const USERNAME = "gncu33184909";
const PASSWORD = "Y6xLYEsN-k3muLU";

// VPSサーバー情報
const VPS_IP = "160.251.181.17";
const SSH_USER = "root";
const PALWORLD_START_COMMAND = "/root/palworld/start.sh";

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

  if (!res.ok) throw new Error(`Auth failed: ${res.statusText}`);
  const token = res.headers.get("x-subject-token");
  if (!token) throw new Error("Token not found in response headers");
  return token;
}

// VPS状態取得
async function getVPSStatus(token) {
  const url = `${CONOHA_COMPUTE_URL}/servers/${SERVER_ID}`;
  const res = await fetch(url, {
    method: "GET",
    headers: {
      "X-Auth-Token": token,
      "Content-Type": "application/json",
    },
  });

  if (!res.ok) throw new Error(`VPS status check failed: ${res.statusText}`);
  const data = await res.json();
  return data.server.status; // "ACTIVE", "SHUTOFF" など
}

// VPS起動
async function startVPS(token) {
  const status = await getVPSStatus(token);
  if (status === "ACTIVE") {
    return "VPSはすでに起動しています。";
  }

  const res = await fetch(`${CONOHA_COMPUTE_URL}/servers/${SERVER_ID}/action`, {
    method: "POST",
    headers: {
      "X-Auth-Token": token,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ "os-start": null }),
  });

  if (!res.ok) throw new Error(`VPS start failed: ${res.statusText}`);
  return "VPSを起動しました。";
}

// VPS停止
async function stopVPS(token) {
  const res = await fetch(`${CONOHA_COMPUTE_URL}/servers/${SERVER_ID}/action`, {
    method: "POST",
    headers: {
      "X-Auth-Token": token,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ "os-stop": null }),
  });

  if (!res.ok) throw new Error(`VPS stop failed: ${res.statusText}`);
  return "VPSを停止しました。";
}

// Palworld起動（SSH）
async function startPalworldServer() {
  return new Promise((resolve, reject) => {
    exec(`ssh ${SSH_USER}@${VPS_IP} "${PALWORLD_START_COMMAND}"`, (error, stdout) => {
      if (error) reject(`SSH error: ${error.message}`);
      else resolve(stdout.trim());
    });
  });
}

// Discord Bot 処理
client.on("ready", () => {
  console.log(`Logged in as ${client.user.tag}!`);
});

client.on("messageCreate", async (message) => {
  if (message.author.bot) return;

  if (message.content === "!ping") {
    await message.reply("pong!");
  }

  if (message.content === "!start") {
    try {
      const token = await getToken();
      const startMsg = await startVPS(token);
      const result = await startPalworldServer();
      await message.channel.send(`${startMsg}\nPalworldサーバーを起動しました。\n接続先: ${VPS_IP}\n実行結果: ${result}`);
    } catch (err) {
      await message.channel.send(`エラー: ${err.message}`);
    }
  }

  if (message.content === "!stop") {
    try {
      const token = await getToken();
      const msg = await stopVPS(token);
      await message.channel.send(msg);
    } catch (err) {
      await message.channel.send(`エラー: ${err.message}`);
    }
  }
});

client.login(DISCORD_BOT_TOKEN);

// Railway対応: 常駐維持
setInterval(() => {}, 1 << 30);
