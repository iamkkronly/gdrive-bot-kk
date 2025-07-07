const express = require('express');
const TelegramBot = require('node-telegram-bot-api');
const { google } = require('googleapis');
const axios = require('axios');
const fs = require('fs');
const mime = require('mime-types');

const app = express();
const PORT = process.env.PORT || 3000;

// === Google OAuth2 credentials ===
const CLIENT_ID = "565413172042-05blvf0fqstm3m855g5hpg1om5p3lopu.apps.googleusercontent.com";
const CLIENT_SECRET = "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";

// 🔁 Replace this with your Render domain callback URL:
const REDIRECT_URI = "https://your-app-name.onrender.com/oauth2callback";

// === Telegram Bot Token ===
const BOT_TOKEN = "8114062897:AAHmK-0d9cvB8SHYLuDfr6U5zuMIHJsrxR8";
const bot = new TelegramBot(BOT_TOKEN, { polling: true });

// === Temporary in-memory data ===
let authClients = {};
let fileQueue = {};

const oauth2Client = new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET, REDIRECT_URI);

function getAuthUrl(chatId) {
  const scopes = ['https://www.googleapis.com/auth/drive.file'];
  return oauth2Client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: scopes,
    state: chatId.toString(),
  });
}

async function uploadToDrive(auth, filePath, fileName) {
  const drive = google.drive({ version: 'v3', auth });
  const mimeType = mime.lookup(filePath) || 'application/octet-stream';
  const media = {
    mimeType,
    body: fs.createReadStream(filePath)
  };

  const file = await drive.files.create({
    resource: { name: fileName },
    media,
    fields: 'id, webViewLink'
  });

  return file.data.webViewLink;
}

bot.on('message', async (msg) => {
  const chatId = msg.chat.id;

  if (!msg.document) {
    return bot.sendMessage(chatId, "📎 Please send a document to upload to Google Drive.");
  }

  const fileId = msg.document.file_id;
  const fileName = msg.document.file_name;
  const localPath = `./temp-${chatId}-${fileName}`;

  try {
    const file = await bot.getFile(fileId);
    const fileUrl = `https://api.telegram.org/file/bot${BOT_TOKEN}/${file.file_path}`;

    const writer = fs.createWriteStream(localPath);
    const res = await axios({ url: fileUrl, method: 'GET', responseType: 'stream' });
    res.data.pipe(writer);

    writer.on('finish', async () => {
      fileQueue[chatId] = { path: localPath, name: fileName };
      const url = getAuthUrl(chatId);
      await bot.sendMessage(chatId, `🔐 Click to authorize upload:\n${url}`);
    });

  } catch (err) {
    console.error(err);
    bot.sendMessage(chatId, "❌ Failed to download file.");
  }
});

// === Google OAuth2 callback
app.get('/oauth2callback', async (req, res) => {
  const { code, state } = req.query;
  const chatId = parseInt(state);

  try {
    const { tokens } = await oauth2Client.getToken(code);
    const userAuth = new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET, REDIRECT_URI);
    userAuth.setCredentials(tokens);

    const fileData = fileQueue[chatId];
    if (!fileData) return res.send("⛔ No file found.");

    const link = await uploadToDrive(userAuth, fileData.path, fileData.name);
    fs.unlinkSync(fileData.path);

    bot.sendMessage(chatId, `✅ Uploaded to Google Drive:\n${link}`);
    delete fileQueue[chatId];
    res.send("✅ Upload successful! You may return to Telegram.");

  } catch (err) {
    console.error(err);
    res.send("❌ Authorization failed.");
  }
});

app.get('/', (req, res) => res.send('🚀 Bot is running!'));
app.listen(PORT, () => console.log(`Bot running on port ${PORT}`));
