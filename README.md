# 🤖 Auto Ponto

Automaçãozinha feita para salvar todos vocês de mandar documento pro papai assinar no fim do mês.
Podem ficar tranquilos que já pensei em tudo.
![yoda2](https://media3.giphy.com/media/v1.Y2lkPTc5MGI3NjExN3V3d3c4N2hkaWVlOWZpdGk1bGZ1b2N6MHg4cHR3MW51ODYxNDg1ZiZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/3ornk03njkdi5mNKJG/giphy.gif)

## O que ele faz?

- abre o sistema
- faz login
- abre a tela de marcação
- pega localização
- registra ponto
- tira screenshot
- manda confirmação no Discord
- não executa sábado/domingo
- (em breve) tratamento melhor de feriados 👀

![celebrate](https://media3.giphy.com/media/v1.Y2lkPTc5MGI3NjExczU4MzFzcTVrOTdhNnBxcWY3a2c0dGdqMmg1N3N5eTVkZWZzYWduOSZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/J2UWRjzrV9Wxfz4hIF/giphy.gif)
---

# 🚀 Instalação

## 1. Clona o projeto

```bash
git clone URL_DO_REPOSITORIO
```

---

## 2. Instala dependências

```bash
npm install
```

---

## 3. Instala browsers do Playwright

```bash
npx playwright install
```

---

# ⚙️ Configuração

Existe um arquivo:

```bash
.env.example
```

Cria um:

```bash
.env
```

e preenche com teus dados:

```env
CPF=SEU_CPF
SENHA=SUA_SENHA

WEBHOOK_URL=SUA_WEBHOOK_DISCORD

BASE_LAT=-3.7863821
BASE_LON=-38.491852
(exemplo daqui de casa)
```

---

# 📍 Como pegar LAT/LON?

Bem fácil 😅

Bate um ponto normalmente no sistema pelo navegador.

Depois vai no histórico/espelho e copia as coordenadas que aparecem lá.

---

# 🔔 Discord Webhook

Pra receber confirmação quando o ponto for batido.

## Criando webhook:

- entra no teu servidor Discord
- abre um canal
- Edit Channel
- Integrations
- Webhooks
- New Webhook
- Copy Webhook URL

Cola no:

```env
WEBHOOK_URL=
```

---

# ▶️ Rodando manualmente

```bash
node ponto.js
```

---

# 🖥️ Agendamento

Se vira 😭

Cada um agenda como quiser:
- Windows Task Scheduler
- cron no Linux
- fé em Jesus Cristo
![jesus](https://media4.giphy.com/media/v1.Y2lkPTc5MGI3NjExZ2lubm9haGppOWVrMzdzeTV5bm45N2NkNmdvYzd4NzNrYzkzMjRlciZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/yNF0XKi2ZLuow/giphy.gif)

Aqui usei Task Scheduler no Windows. Só deixar o pc ligado que ele faz. 
---

# ⚠️ IMPORTANTE

## Quando bate ponto pelo PC:

Ele NÃO aparece imediatamente no app do celular 😅

Mas calma.

![breath](https://media4.giphy.com/media/v1.Y2lkPTc5MGI3NjExam95YmNyZ29ic213cGtuMHoyM2Vjazd6bWF5dXV4b3o4dzhydTRuMSZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/3kHz1oN8NfxJJgVgvL/giphy.gif)

Vai no sistema web e consulta o espelho/pontos que ele aparece normalmente lá.

Então não se desesperem achando que o ponto sumiu.

![naruto](https://media0.giphy.com/media/v1.Y2lkPTc5MGI3NjExdTFpM3VkMjFhcHJ1b3J0bTlsNHBoOWQ0ZjlnYm4yeHRkOWNuem5xMSZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/w7CP59oLYw6PK/giphy.gif)
---

# 📅 Feriados

Ainda tô mexendo nessa parte 👀

Hoje:
- sábado/domingo já não executa
- alguns feriados podem ser adicionados manualmente

Depois talvez eu melhore usando API automática.

---

# 📸 Screenshot

O script salva:

```bash
comprovante.png
```

e manda no Discord também.

![hacker](https://media3.giphy.com/media/v1.Y2lkPTc5MGI3NjExZjl3Z2dwNm8zbnBwZGVrb21ldzAycDN2YzN4Mmx5cmJnNm9qZDJ1OCZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/YQitE4YNQNahy/giphy.gif)
---

# 🤝 Observações

Usem com sabedoria 
![yoda](https://media4.giphy.com/media/v1.Y2lkPTc5MGI3NjExMTJrM21qbDhpaDhybGJzYnkwdGRqZ3F4dW8ydjk1Z29obWEyeGt6YyZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/26tPgV8ceZTSxH9zG/giphy.gif)