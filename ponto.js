// Servidor do Actions roda em UTC; força horário de Brasília em todo Date.
process.env.TZ = "America/Sao_Paulo";

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
// Máximo de pontos por janela do dia: 1 de manhã, 2 no almoço (12h-14h),
// 1 no fim do dia. Soma 4.
const WINDOWS = [
  { name: "manhã", untilHour: 11, limit: 1 },
  { name: "almoço", untilHour: 14, limit: 2 },
  { name: "saída", untilHour: 23, limit: 1 },
];
const CONFIRM_EMOJI = "✅";
const CANCEL_EMOJI = "❌";

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

function windowOf(hour) {
  return WINDOWS.find((w) => hour <= w.untilHour);
}

const ORDINALS = ["PRIMEIRA", "SEGUNDA", "TERCEIRA", "QUARTA"];

async function openSystem() {
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
    await login(page);
  } catch (err) {
    await browser.close();

    throw err;
  }

  return { browser, page };
}

async function login(page) {
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
}

// Horas das marcações já feitas hoje, lidas da tela "Marcações" do sistema
// (linhas no formato "08:27:57 | -3.78,-38.49").
async function todayMarkHours() {
  const { browser, page } = await openSystem();

  try {
    await page.getByText("Marcações", { exact: true }).click();

    await page.waitForTimeout(3000);

    const text = await page.locator("body").innerText();

    return [...text.matchAll(/^(\d{2}):\d{2}:\d{2} \|/gm)].map((m) =>
      parseInt(m[1]),
    );
  } finally {
    await browser.close();
  }
}

async function hasHumanReaction(messageId, emoji) {
  const response = await discordApi(
    `/channels/${DISCORD_CHANNEL_ID}/messages/${messageId}/reactions/${encodeURIComponent(emoji)}`,
  );

  const users = await response.json();

  return Array.isArray(users) && users.some((user) => !user.bot);
}

// Pergunta no Discord se pode bater o ponto. Re-pergunta a cada
// CONFIRM_RETRY_MIN minutos, até CONFIRM_MAX_ATTEMPTS vezes. Retorna
// "confirmed" assim que alguém reagir com ✅, "cancelled" na hora se alguém
// reagir com ❌, ou "timeout" depois de esgotar as tentativas sem resposta.
async function waitForDiscordConfirmation(label) {
  for (let attempt = 1; attempt <= CONFIRM_MAX_ATTEMPTS; attempt++) {
    const askResponse = await discordApi(
      `/channels/${DISCORD_CHANNEL_ID}/messages`,
      {
        method: "POST",
        body: JSON.stringify({
          content: `🕒 ${label}: bater ponto agora? Reaja com ${CONFIRM_EMOJI} pra confirmar ou ${CANCEL_EMOJI} pra cancelar. Expira em ${CONFIRM_RETRY_MIN} min. (tentativa ${attempt}/${CONFIRM_MAX_ATTEMPTS})`,
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
      // ponytail: poll de 15s = até 15s de atraso pra detectar reação;
      // baixar o intervalo se precisar de resposta mais imediata
      await delay(15000);

      if (await hasHumanReaction(askMessage.id, CANCEL_EMOJI)) {
        return "cancelled";
      }

      if (await hasHumanReaction(askMessage.id, CONFIRM_EMOJI)) {
        return "confirmed";
      }
    }
  }

  return "timeout";
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

  const nowHour = parseInt(
    new Date().toLocaleString("en-US", {
      timeZone: "America/Sao_Paulo",
      hour: "numeric",
      hourCycle: "h23",
    }),
  );
  const slot = windowOf(nowHour);
  let done;

  try {
    done = await todayMarkHours();
  } catch (err) {
    console.error("ERRO ao ler marcações:", err);

    await fetch(WEBHOOK_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        content: `❌ ERRO AO LER MARCAÇÕES DO DIA

${err.message}`,
      }),
    });

    return;
  }

  const label = `${ORDINALS[done.length]} MARCAÇÃO DO DIA`;

  if (done.filter((h) => windowOf(h) === slot).length >= slot.limit) {
    console.log(`Já bati ${slot.limit}x na janela ${slot.name}. Encerrando.`);

    return;
  }

  console.log("Pedindo confirmação no Discord...");

  const confirmation = await waitForDiscordConfirmation(label);

  if (confirmation !== "confirmed") {
    const message =
      confirmation === "cancelled"
        ? "🚫 Ponto NÃO registrado. Cancelado pelo usuário."
        : "⚠️ Ponto NÃO registrado. Confirmação não recebida a tempo.";

    console.log(message);

    try {
      await fetch(WEBHOOK_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          content: message,
        }),
      });
    } catch (err) {
      console.error("Erro ao enviar webhook:", err);
    }

    return;
  }

  let browser;

  try {
    let page;

    ({ browser, page } = await openSystem());

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
        content: `✅ Ponto registrado com sucesso — ${label}

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
    await browser?.close();
  }
})();
