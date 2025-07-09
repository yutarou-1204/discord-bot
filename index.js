import { Client, GatewayIntentBits } from "discord.js";
import fetch from "node-fetch";
import { exec } from "child_process";

const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent] });

// ConoHa情報
const CONOHA_IDENTITY_URL = "https://identity.c3j1.conoha.io/v3/auth/tokens";
const CONOHA_COMPUTE_URL = "https://compute.c3j1.conoha.io/v2"; // + /<tenant_id>
const TENANT_ID = "7544f37d10be4ff7a638d1b34c6732b1";  // テナントID
const USERNAME = "gncu33184909";
const PASSWORD = "Y6xLYEsN-k3muLU";

// Palworldサーバー起動用SSH情報
const VPS_IP = "160.251.181.17";
const SSH_USER = "root";  // or your ssh user
const PALWORLD_START_COMMAND = "/root/palworld/start.sh";  // VPS内の起動スクリプト例

// Discord Botトークン
const DISCORD_BOT_TOKEN = process.env.DISCORD_TOKEN;

// 1. ConoHa APIでトークン取得
async function getToken() {
  const body = {
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
      scope: {
        project: { id: TENANT_ID },
      },
    },
  };

  const res = await fetch(CONOHA_IDENTITY_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) throw new Error(`Auth failed: ${res.statusText}`);

  // v3 APIはトークンがレスポンスヘッダーにある
  const token = res.headers.get("x-subject-token");
  if (!token) throw new Error("Token not found in response headers");

  return token;
}

// 2. VPS起動
async function startVPS(token) {
  const url = `${CONOHA_COMPUTE_URL}/${TENANT_ID}/servers/b9d544e5-5606-4125-81f8-05a61d1e6f01/action`;

  const body = {
    "os-start": null,
  };

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "X-Auth-Token": token,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) throw new Error(`VPS start failed: ${res.statusText}`);
  return true;
}

// 3. Palworldサーバー起動（SSHでコマンド実行）
async function startPalworldServer() {
  return new Promise((resolve, reject) => {
    exec(`ssh ${SSH_USER}@${VPS_IP} "${PALWORLD_START_COMMAND}"`, (error, stdout, stderr) => {
      if (error) {
        reject(`SSH exec error: ${error.message}`);
      } else {
        resolve(stdout.trim());
      }
    });
  });
}

// 4. Discord Bot起動とコマンド受信処理
client.on("ready", () => {
  console.log(`Logged in as ${client.user.tag}!`);
});

client.on("messageCreate", async (message) => {
  if (message.author.bot) return;

  if (message.content === "!startvps") {
    try {
      const token = await getToken();
      await startVPS(token);
      const result = await startPalworldServer();
      await message.channel.send(`VPSを起動し、Palworldサーバーも起動しました。\n接続先: ${VPS_IP}\n起動結果: ${result}`);
    } catch (err) {
      await message.channel.send(`エラー: ${err.message}`);
    }
  }

  if (message.content === "!stopvps") {
    try {
      const token = await getToken();
      const url = `${CONOHA_COMPUTE_URL}/${TENANT_ID}/servers/<server_id>/action`;
      const body = { "os-stop": null };
      const res = await fetch(url, {
        method: "POST",
        headers: { "X-Auth-Token": token, "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(`VPS stop failed: ${res.statusText}`);
      await message.channel.send("VPSを停止しました。");
    } catch (err) {
      await message.channel.send(`エラー: ${err.message}`);
    }
  }
});

client.login(DISCORD_BOT_TOKEN);
