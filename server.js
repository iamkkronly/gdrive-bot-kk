const express = require('express');
const { exec } = require('child_process');
const app = express();

app.get('/', (req, res) => {
  res.send('🤖 Telegram Bot Runner is live.');
});

// Start Telegram bot logic
exec('node runner_bot.js', (err, stdout, stderr) => {
  if (err) console.error(`❌ Error: ${err.message}`);
  if (stderr) console.error(`⚠️ Stderr: ${stderr}`);
  if (stdout) console.log(`✅ Stdout: ${stdout}`);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🌐 Server running on port ${PORT}`));
