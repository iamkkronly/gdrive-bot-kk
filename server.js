const express = require('express');
const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');

const app = express();

// Telegram Bot Token
const TOKEN = '8114062897:AAHmK-0d9cvB8SHYLuDfr6U5zuMIHJsrxR8';
const bot = new TelegramBot(TOKEN, { polling: true });

// Start command
bot.onText(/\/start/, (msg) => {
  bot.sendMessage(
    msg.chat.id,
    `📘 *Welcome to Dictionary Bot!*\n\nSend me any English word and I’ll reply with its definition.\n\nExample:\n\`apple\``,
    { parse_mode: 'Markdown' }
  );
});

// Word handler
bot.on('message', async (msg) => {
  const chatId = msg.chat.id;
  const word = msg.text?.trim().toLowerCase();

  if (!word || word.startsWith('/')) return;

  try {
    const res = await axios.get(`https://api.dictionaryapi.dev/api/v2/entries/en/${word}`);
    const data = res.data[0];

    const meanings = data.meanings.map((m) => {
      const def = m.definitions[0].definition;
      return `🔹 *${m.partOfSpeech}*: ${def}`;
    }).join('\n\n');

    const reply = `📖 *${data.word}*\n\n${meanings}`;
    bot.sendMessage(chatId, reply, { parse_mode: 'Markdown' });

  } catch (err) {
    bot.sendMessage(chatId, `❌ Sorry, no definition found for *${word}*.`, { parse_mode: 'Markdown' });
  }
});

// Render health check
app.get('/', (req, res) => {
  res.send('✅ Dictionary Bot is running!');
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
