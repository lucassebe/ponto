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

function isExecutionTimeValid() {
  const now = new Date();

  const hour = now.getHours();
  const minute = now.getMinutes();

  const validTimes = [8, 12, 13, 17];

  return validTimes.includes(hour) && minute < 3;
}

(async () => {
  const randomSeconds = Math.floor(Math.random() * 45) + 20;
  const executionTime = new Date(Date.now() + randomSeconds * 1000);

  console.log(`⏳ Início adiado em ${randomSeconds}s`);

  console.log(`🕒 Horário previsto: ${executionTime.toLocaleString("pt-BR")}`);

  await delay(randomSeconds * 1000);

  if (!isExecutionTimeValid()) {
    const now = new Date();

    const message = `⚠️ Ponto NÃO registrado.

Execução fora do horário permitido.

Horário atual: ${now.toLocaleString("pt-BR")}`;

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

  if (await isHoliday()) {
    console.log("Fim de semana ou feriado. Encerrando.");

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
