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
const latitude = baseLat + (Math.random() - 0.5) * 0.0001;
const longitude = baseLng + (Math.random() - 0.5) * 0.0001;

(async () => {
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
