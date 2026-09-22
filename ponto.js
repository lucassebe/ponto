require("dotenv").config();
const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright");
const { isHoliday } = require("./feriados");

const CPF = process.env.CPF;
const SENHA = process.env.SENHA;
const WEBHOOK_URL = process.env.WEBHOOK_URL;
const baseLat = parseFloat(process.env.BASE_LAT);
const baseLng = parseFloat(process.env.BASE_LON);
const pontoIndex = parseInt(process.env.PONTO_INDEX || "0");

function tinyVariation(base) {
  const variation = (Math.floor(Math.random() * 5) - 2) * 0.000001;

  return Number((base + variation).toFixed(7));
}

const randomPoint = Math.floor(Math.random() * 4);

const locations = [];

for (let i = 0; i < 4; i++) {
  if (i === randomPoint) {
    locations.push({
      latitude: tinyVariation(baseLat),
      longitude: tinyVariation(baseLng),
    });
  } else {
    locations.push({
      latitude: baseLat,
      longitude: baseLng,
    });
  }
}

const latitude = locations[pontoIndex].latitude;
const longitude = locations[pontoIndex].longitude;
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const DISCORD_BOT_TOKEN = process.env.DISCORD_BOT_TOKEN;
const DISCORD_CHANNEL_ID = process.env.DISCORD_CHANNEL_ID;
const CONFIRM_RETRY_MIN = parseInt(process.env.CONFIRM_RETRY_MIN || "3");
const CONFIRM_MAX_ATTEMPTS = parseInt(process.env.CONFIRM_MAX_ATTEMPTS || "3");
const DAILY_PONTO_LIMIT = parseInt(process.env.DAILY_PONTO_LIMIT || "4");
const CONFIRM_EMOJI = "✅";
const CANCEL_EMOJI = "❌";
const SUCCESS_PREFIX = "✅ Ponto registrado";

async function discordApi(endpoint, options = {}) {
  return fetch(`https://discord.com/api/v10${endpoint}`, {
    ...options,
    headers: {
      Authorization: `Bot ${DISCORD_BOT_TOKEN}`,
      "Content-Type": "application/json",
      ...options.headers,
    },
  });
}

function isToday(isoTimestamp) {
  const opts = { timeZone: "America/Sao_Paulo" };

  return (
    new Date(isoTimestamp).toLocaleDateString("pt-BR", opts) ===
    new Date().toLocaleDateString("pt-BR", opts)
  );
}

// Conta quantos pontos já foram batidos hoje, olhando o histórico do canal.
async function countTodaySuccesses() {
  const response = await discordApi(
    `/channels/${DISCORD_CHANNEL_ID}/messages?limit=50`,
  );

  const messages = await response.json();

  if (!Array.isArray(messages)) {
    return 0;
  }

  return messages.filter(
    (msg) =>
      msg.author?.bot &&
      msg.content?.startsWith(SUCCESS_PREFIX) &&
      isToday(msg.timestamp),
  ).length;
}

async function hasHumanReaction(messageId, emoji) {
  const response = await discordApi(
    `/channels/${DISCORD_CHANNEL_ID}/messages/${messageId}/reactions/${encodeURIComponent(emoji)}`,
  );

  const users = await response.json();

  return Array.isArray(users) && users.some((user) => !user.bot);
}

// Pergunta no Discord se pode bater o ponto. Re-pergunta a cada
// CONFIRM_RETRY_MIN minutos, até CONFIRM_MAX_ATTEMPTS vezes. Retorna true
// assim que alguém reagir com ✅. Retorna false na hora se alguém reagir com
// ❌, ou depois de esgotar as tentativas sem resposta.
async function waitForDiscordConfirmation() {
  for (let attempt = 1; attempt <= CONFIRM_MAX_ATTEMPTS; attempt++) {
    const askResponse = await discordApi(
      `/channels/${DISCORD_CHANNEL_ID}/messages`,
      {
        method: "POST",
        body: JSON.stringify({
          content: `🕒 Bater ponto agora? Reaja com ${CONFIRM_EMOJI} pra confirmar ou ${CANCEL_EMOJI} pra cancelar. Expira em ${CONFIRM_RETRY_MIN} min. (tentativa ${attempt}/${CONFIRM_MAX_ATTEMPTS})`,
        }),
      },
    );

    const askMessage = await askResponse.json();

    await discordApi(
      `/channels/${DISCORD_CHANNEL_ID}/messages/${askMessage.id}/reactions/${encodeURIComponent(CONFIRM_EMOJI)}/@me`,
      { method: "PUT" },
    );

    await discordApi(
      `/channels/${DISCORD_CHANNEL_ID}/messages/${askMessage.id}/reactions/${encodeURIComponent(CANCEL_EMOJI)}/@me`,
      { method: "PUT" },
    );

    const deadline = Date.now() + CONFIRM_RETRY_MIN * 60 * 1000;

    while (Date.now() < deadline) {
      await delay(15000);

      if (await hasHumanReaction(askMessage.id, CANCEL_EMOJI)) {
        return false;
      }

      if (await hasHumanReaction(askMessage.id, CONFIRM_EMOJI)) {
        return true;
      }
    }
  }

  return false;
}

(async () => {
  const randomSeconds = Math.floor(Math.random() * 45) + 20;
  const executionTime = new Date(Date.now() + randomSeconds * 1000);

  console.log(`⏳ Início adiado em ${randomSeconds}s`);

  console.log(`🕒 Horário previsto: ${executionTime.toLocaleString("pt-BR")}`);

  await delay(randomSeconds * 1000);

  if (await isHoliday()) {
    console.log("Fim de semana ou feriado. Encerrando.");

    return;
  }

  if ((await countTodaySuccesses()) >= DAILY_PONTO_LIMIT) {
    console.log(`Já bati ${DAILY_PONTO_LIMIT}x hoje. Encerrando.`);

    return;
  }

  console.log("Pedindo confirmação no Discord...");

  const confirmed = await waitForDiscordConfirmation();

  if (!confirmed) {
    console.log("Não confirmado. Encerrando.");

    try {
      await fetch(WEBHOOK_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          content: "⚠️ Ponto NÃO registrado. Confirmação não recebida a tempo.",
        }),
      });
    } catch (err) {
      console.error("Erro ao enviar webhook:", err);
    }

    return;
  }

  const browser = await chromium.launch({
    headless: true,
  });

  const context = await browser.newContext({
    geolocation: {
      latitude,
      longitude,
    },
    permissions: ["geolocation"],
    locale: "pt-BR",

    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36",

    viewport: {
      width: 1366,
      height: 768,
    },
  });

  await context.addInitScript(() => {
    Object.defineProperty(navigator, "webdriver", {
      get: () => undefined,
    });

    Object.defineProperty(navigator, "platform", {
      get: () => "Win32",
    });

    Object.defineProperty(navigator, "vendor", {
      get: () => "Google Inc.",
    });

    Object.defineProperty(navigator, "languages", {
      get: () => ["pt-BR", "pt"],
    });
  });

  const page = await context.newPage();

  try {
    console.log("Abrindo sistema...");

    await page.goto(
      "https://app.atecsoftwares.com.br/09192042000146/AtecSoftWeb.dll/m",
      {
        waitUntil: "networkidle",
        timeout: 60000,
      },
    );

    console.log("Fazendo login...");

    await page.locator('input[name="O44"]').fill(CPF);

    await page.locator('input[name="O48"]').fill(SENHA);

    await page.keyboard.press("Enter");

    console.log("Esperando menu...");

    await page.waitForTimeout(4000);

    console.log("Abrindo tela de marcação...");

    await page.getByText("Registrar Marcação").click();

    await page.waitForTimeout(3000);

    console.log("Solicitando localização...");

    await page.locator('button[data-componentid="O17F_id"]').click();

    console.log("Esperando localização...");

    await page.waitForSelector("text=Localização OK", {
      timeout: 30000,
    });

    console.log("Localização OK");

    console.log("Clicando em registrar...");

    await page.locator('button[data-componentid="O1A7_id"]').click();

    console.log("Esperando modal...");

    await page.waitForSelector(".swal2-confirm", {
      timeout: 10000,
    });

    console.log("Confirmando...");

    await page.locator("button.swal2-confirm").click();

    console.log("Ponto registrado.");

    await page.waitForTimeout(4000);

    await page.screenshot({
      path: "comprovante.png",
      fullPage: true,
    });

    console.log("Screenshot salva.");

    const form = new FormData();

    const file = fs.readFileSync(path.join(__dirname, "comprovante.png"));

    const blob = new Blob([file], {
      type: "image/png",
    });

    form.append("file", blob, "comprovante.png");

    form.append(
      "payload_json",
      JSON.stringify({
        content: `✅ Ponto registrado com sucesso

🕒 ${new Date().toLocaleString("pt-BR")}

📍 ${latitude}, ${longitude}`,
      }),
    );

    const response = await fetch(WEBHOOK_URL, {
      method: "POST",
      body: form,
    });

    console.log("Discord status:", response.status);

    console.log(await response.text());

    console.log("Webhook enviado.");
  } catch (err) {
    console.error("ERRO:", err);

    await fetch(WEBHOOK_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        content: `❌ ERRO AO BATER PONTO

${err.message}`,
      }),
    });
  } finally {
    await browser.close();
  }
})();
