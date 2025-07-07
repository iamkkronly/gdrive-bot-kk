const express = require('express');
const TelegramBot = require('node-telegram-bot-api');
const { google } = require('googleapis');
const axios = require('axios');
const fs = require('fs');
const mime = require('mime-types');

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;

// 🛡️ Replace with your actual Render domain
const APP_URL = "https://gdrive-bot-kk.onrender.com";

// === Google OAuth2 credentials ===
const CLIENT_ID = "565413172042-5vmtcbeebff0neonrph9tur33ogcqb5t.apps.googleusercontent.com";
const CLIENT_SECRET = "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";
const REDIRECT_URI = `${APP_URL}/oauth2callback`;

// === Telegram Bot Token ===
const BOT_TOKEN = "8114062897:AAHmK-0d9cvB8SHYLuDfr6U5zuMIHJsrxR8";

// Setup Telegram bot in webhook mode
const bot = new TelegramBot(BOT_TOKEN);
bot.setWebHook(`${APP_URL}/bot${BOT_TOKEN}`);

// Routes
app.post(`/bot${BOT_TOKEN}`, (req, res) => {
  bot.processUpdate(req.body);
  res.sendStatus(200);
});

// In-memory storage for temporary files
let fileQueue = {};

// OAuth2 client
const oauth2Client = new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET, REDIRECT_URI);

function getAuthUrl(chatId) {
  return oauth2Client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: ['https://www.googleapis.com/auth/drive.file'],
    state: chatId.toString()
  });
}

async function uploadToDrive(auth, filePath, fileName) {
  const drive = google.drive({ version: 'v3', auth });
  const mimeType = mime.lookup(filePath) || 'application/octet-stream';
  const media = { mimeType, body: fs.createReadStream(filePath) };
  const res = await drive.files.create({
    resource: { name: fileName },
    media,
    fields: 'id, webViewLink'
  });
  return res.data.webViewLink;
}

// Handle incoming Telegram messages
bot.on('message', async (msg) => {
  const chatId = msg.chat.id;
  if (!msg.document) {
    return bot.sendMessage(chatId, "📎 Please send a document to upload.");
  }

  const fileId = msg.document.file_id;
  const fileName = msg.document.file_name;
  const localPath = `./temp-${chatId}-${fileName}`;

  try {
    const file = await bot.getFile(fileId);
    const url = `https://api.telegram.org/file/bot${BOT_TOKEN}/${file.file_path}`;

    const writer = fs.createWriteStream(localPath);
    const response = await axios({ url, method: 'GET', responseType: 'stream' });
    response.data.pipe(writer);

    writer.on('finish', async () => {
      fileQueue[chatId] = { path: localPath, name: fileName };
      const authUrl = getAuthUrl(chatId);
      await bot.sendMessage(chatId, `🔐 Authorize upload here:\n${authUrl}`);
    });
  } catch (err) {
    console.error(err);
    bot.sendMessage(chatId, "❌ Download failed.");
  }
});

// OAuth2 callback endpoint
app.get('/oauth2callback', async (req, res) => {
  const { code, state } = req.query;
  const chatId = parseInt(state);
  try {
    const { tokens } = await oauth2Client.getToken(code);
    const userAuth = new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET, REDIRECT_URI);
    userAuth.setCredentials(tokens);

    const q = fileQueue[chatId];
    if (!q) return res.send("⛔ No pending file.");

    const link = await uploadToDrive(userAuth, q.path, q.name);
    fs.unlinkSync(q.path);

    await bot.sendMessage(chatId, `✅ Uploaded:\n${link}`);
    delete fileQueue[chatId];
    res.send("✅ All set! You can close this tab.");
  } catch (err) {
    console.error(err);
    res.send("❌ Authorization failed.");
  }
});

// Health check endpoint
app.get('/', (req, res) => res.send('🚀 Bot is live'));
app.listen(PORT, () => console.log(`Server listening on ${PORT}`));
