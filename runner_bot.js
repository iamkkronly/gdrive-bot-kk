const TelegramBot = require('node-telegram-bot-api');
const fs = require('fs');
const path = require('path');
const https = require('https');
const { exec, spawn } = require('child_process');

const BOT_TOKEN = '8114062897:AAHmK-0d9cvB8SHYLuDfr6U5zuMIHJsrxR8';
const bot = new TelegramBot(BOT_TOKEN, { polling: true });

const UPLOAD_DIR = path.join(__dirname, 'userbot');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR);

bot.onText(/\/start/, (msg) => {
  bot.sendMessage(msg.chat.id, '👋 Send me your `bot.js` and `package.json`. I will install and run it!');
});

bot.on('document', async (msg) => {
  const chatId = msg.chat.id;
  const fileId = msg.document.file_id;
  const fileName = msg.document.file_name;

  const file = await bot.getFile(fileId);
  const fileUrl = `https://api.telegram.org/file/bot${BOT_TOKEN}/${file.file_path}`;
  const filePath = path.join(UPLOAD_DIR, fileName);
  const fileStream = fs.createWriteStream(filePath);

  https.get(fileUrl, (res) => {
    res.pipe(fileStream);
    fileStream.on('finish', () => {
      fileStream.close();
      bot.sendMessage(chatId, `✅ Saved ${fileName}`);

      const files = fs.readdirSync(UPLOAD_DIR);
      if (files.includes('bot.js') && files.includes('package.json')) {
        bot.sendMessage(chatId, '📦 Installing dependencies...');
        exec(`cd ${UPLOAD_DIR} && npm install`, (err, stdout, stderr) => {
          if (err) {
            bot.sendMessage(chatId, `❌ Install error:\n${stderr}`);
            return;
          }

          bot.sendMessage(chatId, '🚀 Running your bot...');
          const child = spawn('node', ['bot.js'], {
            cwd: UPLOAD_DIR,
            detached: true,
            stdio: 'ignore'
          });

          child.unref();
          bot.sendMessage(chatId, '✅ Your bot is now running!');
        });
      }
    });
  });
});
