// server.js
const express = require('express');
const TelegramBot = require('node-telegram-bot-api');
const fs = require('fs');
const path = require('path');
const https = require('https');
const { exec, spawn, execSync } = require('child_process');

const app = express();
const PORT = process.env.PORT || 3000;

// CONFIG
const BOT_TOKEN = '8114062897:AAEEHfOaEEnZdYCVcssvWQJwr4OKfissgmo';
const bot = new TelegramBot(BOT_TOKEN, { polling: true });

const ADMIN_ID = 6705618257; // Your Telegram ID

const BASE_DIR = __dirname;
const UPLOAD_DIR = path.join(BASE_DIR, 'userbot');
const USERS_FILE = path.join(BASE_DIR, 'users.json');
const KEEP_FILES = ['server.js', 'package.json', 'users.json', 'node_modules'];

// Store running child processes per user
const userBots = {};

// Ensure folders exist
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR);
if (!fs.existsSync(USERS_FILE)) fs.writeFileSync(USERS_FILE, JSON.stringify([]));

// Helper to check admin
function isAdmin(chatId) {
  return chatId === ADMIN_ID;
}

// Express route for UptimeRobot
app.get('/', (req, res) => {
  res.send('🤖 Telegram Bot Runner is live.');
});

// /start command
bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  let users = JSON.parse(fs.readFileSync(USERS_FILE));
  if (!users.includes(chatId)) {
    users.push(chatId);
    fs.writeFileSync(USERS_FILE, JSON.stringify(users));
  }

  bot.sendMessage(chatId, '👋 Send me your `bot.js` and `package.json`. I will install and run it!\n\nCommands: /stop, /restart, /status, /files');
});

// /stop command
bot.onText(/\/stop/, (msg) => {
  const chatId = msg.chat.id;
  if (userBots[chatId]?.process) {
    try {
      process.kill(-userBots[chatId].process.pid);
      delete userBots[chatId];
      bot.sendMessage(chatId, '🛑 Your bot has been stopped.');
    } catch {
      bot.sendMessage(chatId, '⚠️ Failed to stop your bot.');
    }
  } else {
    bot.sendMessage(chatId, 'ℹ️ No running bot found.');
  }
});

// /restart command
bot.onText(/\/restart/, (msg) => {
  const chatId = msg.chat.id;
  const botPath = path.join(UPLOAD_DIR, 'bot.js');
  const pkgPath = path.join(UPLOAD_DIR, 'package.json');

  if (!fs.existsSync(botPath) || !fs.existsSync(pkgPath)) {
    return bot.sendMessage(chatId, '❌ `bot.js` and `package.json` not found.');
  }

  if (userBots[chatId]?.process) {
    try { process.kill(-userBots[chatId].process.pid); } catch {}
  }

  bot.sendMessage(chatId, '🔄 Restarting bot...');
  exec(`cd ${UPLOAD_DIR} && npm install`, (err) => {
    if (err) return bot.sendMessage(chatId, '❌ Install failed.');

    const child = spawn('node', ['bot.js'], {
      cwd: UPLOAD_DIR,
      detached: true,
      stdio: 'ignore'
    });
    child.unref();
    userBots[chatId] = { process: child, startTime: Date.now() };

    setTimeout(() => {
      try {
        process.kill(-child.pid);
        bot.sendMessage(chatId, '🛑 Your bot auto-stopped after 24 hours.');
        delete userBots[chatId];
      } catch {}
    }, 86400000); // 1 day

    bot.sendMessage(chatId, '✅ Bot restarted.');
  });
});

// /status command
bot.onText(/\/status/, (msg) => {
  const chatId = msg.chat.id;
  const botData = userBots[chatId];
  if (botData?.process) {
    const uptime = Date.now() - botData.startTime;
    const hrs = Math.floor(uptime / 3600000);
    const mins = Math.floor((uptime % 3600000) / 60000);
    bot.sendMessage(chatId, `✅ Running for ${hrs}h ${mins}m`);
  } else {
    bot.sendMessage(chatId, 'ℹ️ No bot is currently running.');
  }
});

// /files command
bot.onText(/\/files/, (msg) => {
  const chatId = msg.chat.id;
  fs.readdir(UPLOAD_DIR, (err, files) => {
    if (err || !files.length) return bot.sendMessage(chatId, '📂 No uploaded files.');
    let reply = '📄 Uploaded files:\n\n';
    files.forEach(file => {
      const sizeKB = (fs.statSync(path.join(UPLOAD_DIR, file)).size / 1024).toFixed(1);
      reply += `• ${file} — ${sizeKB} KB\n`;
    });
    bot.sendMessage(chatId, reply);
  });
});

// Admin commands

// /cleanall
bot.onText(/\/cleanall/, (msg) => {
  const chatId = msg.chat.id;
  if (!isAdmin(chatId)) return bot.sendMessage(chatId, '⛔ Not authorized.');

  fs.readdir(BASE_DIR, (err, files) => {
    if (err) return bot.sendMessage(chatId, '❌ Error reading directory.');

    let deletedCount = 0;

    files.forEach(file => {
      if (!KEEP_FILES.includes(file)) {
        const p = path.join(BASE_DIR, file);
        fs.rm(p, { recursive: true, force: true }, () => {});
        deletedCount++;
      }
    });

    bot.sendMessage(chatId, `🧹 Cleaned ${deletedCount} file(s).`);
  });
});

// /shutdown
bot.onText(/\/shutdown/, (msg) => {
  const chatId = msg.chat.id;
  if (!isAdmin(chatId)) return bot.sendMessage(chatId, '⛔ Not authorized.');

  bot.sendMessage(chatId, '🔌 Shutting down server...').then(() => {
    setTimeout(() => process.exit(0), 1000);
  });
});

// /reboot
bot.onText(/\/reboot/, (msg) => {
  const chatId = msg.chat.id;
  if (!isAdmin(chatId)) return bot.sendMessage(chatId, '⛔ Not authorized.');

  bot.sendMessage(chatId, '♻️ Rebooting server...').then(() => {
    setTimeout(() => process.exit(1), 1000); // Exit code 1 triggers restart
  });
});

// Handle uploaded files
bot.on('document', async (msg) => {
  const chatId = msg.chat.id;
  const file = msg.document;
  const fileId = file.file_id;
  const fileName = file.file_name;

  if (file.file_size > 100 * 1024) {
    return bot.sendMessage(chatId, '❌ Max file size is 100KB.');
  }

  const fileUrl = `https://api.telegram.org/file/bot${BOT_TOKEN}/${(await bot.getFile(fileId)).file_path}`;
  const filePath = path.join(UPLOAD_DIR, fileName);
  const fileStream = fs.createWriteStream(filePath);

  https.get(fileUrl, res => {
    res.pipe(fileStream);
    fileStream.on('finish', () => {
      fileStream.close();
      bot.sendMessage(chatId, `✅ Saved ${fileName}`);

      const hasBot = fs.existsSync(path.join(UPLOAD_DIR, 'bot.js'));
      const hasPkg = fs.existsSync(path.join(UPLOAD_DIR, 'package.json'));

      if (hasBot && hasPkg) {
        bot.sendMessage(chatId, '📦 Installing...');
        exec(`cd ${UPLOAD_DIR} && npm install`, (err) => {
          if (err) return bot.sendMessage(chatId, '❌ Install failed.');

          if (userBots[chatId]?.process) {
            try { process.kill(-userBots[chatId].process.pid); } catch {}
          }

          bot.sendMessage(chatId, '🚀 Running...');
          const child = spawn('node', ['bot.js'], {
            cwd: UPLOAD_DIR,
            detached: true,
            stdio: 'ignore'
          });
          child.unref();

          userBots[chatId] = { process: child, startTime: Date.now() };

          setTimeout(() => {
            try {
              process.kill(-child.pid);
              bot.sendMessage(chatId, '🛑 Auto-stopped after 24h.');
              delete userBots[chatId];
            } catch {}
          }, 86400000); // 1 day

          bot.sendMessage(chatId, '✅ Bot is now running.');
        });
      }
    });
  });
});

// Cleanup Function
function runCleanup(reason, cb = null) {
  fs.readdir(BASE_DIR, (err, items) => {
    if (err) return;
    let deleted = false;
    items.forEach(item => {
      if (KEEP_FILES.includes(item)) return;
      const p = path.join(BASE_DIR, item);
      fs.rm(p, { recursive: true, force: true }, () => {});
      deleted = true;
    });

    if (deleted && fs.existsSync(USERS_FILE)) {
      const users = JSON.parse(fs.readFileSync(USERS_FILE));
      const notify = new TelegramBot(BOT_TOKEN);
      const msg = {
        disk80: '⚠️ 80% full. Auto-cleanup and restart.',
        disk70: '⚠️ 70% full. Restarting bot.',
        daily: '🧹 Daily cleanup: Old files deleted.'
      }[reason];

      users.forEach(id => notify.sendMessage(id, msg));
    }

    if (cb) cb();
  });
}

// Daily cleanup every hour
setInterval(() => {
  const now = Date.now();
  const cutoff = now - 86400000;
  fs.readdir(BASE_DIR, (err, files) => {
    if (err) return;
    let deleted = false;
    files.forEach(file => {
      if (KEEP_FILES.includes(file)) return;
      const filePath = path.join(BASE_DIR, file);
      fs.stat(filePath, (err, stats) => {
        if (err) return;
        if (stats.mtimeMs < cutoff) {
          fs.rm(filePath, { recursive: true, force: true }, () => {});
          deleted = true;
        }
      });
    });
    if (deleted) runCleanup('daily');
  });
}, 3600000);

// Disk space monitor every 30 mins
setInterval(() => {
  try {
    const usage = execSync(`df -h /`).toString().split('\n')[1].split(/\s+/)[4].replace('%', '');
    const used = parseInt(usage);
    if (used >= 80) runCleanup('disk80', () => setTimeout(() => process.exit(1), 5000));
    else if (used >= 70) runCleanup('disk70', () => setTimeout(() => process.exit(1), 5000));
  } catch {}
}, 1800000);

// Start server
app.listen(PORT, () => {
  console.log(`🌐 Server running on port ${PORT}`);
});
