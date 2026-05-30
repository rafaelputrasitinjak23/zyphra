const axios = require('axios');

function getWebhookUrl() {
  return process.env.DISCORD_WEBHOOK_URL || process.env.DISCORD_LOG_WEBHOOK_URL || '';
}

async function sendDiscordLog({ title, description, color = 5793266, fields = [] }) {
  const webhookUrl = getWebhookUrl();
  if (!webhookUrl) return false;
  try {
    await axios.post(webhookUrl, {
      username: process.env.DISCORD_WEBHOOK_USERNAME || 'Calamary Store Logs',
      embeds: [{
        title,
        description,
        color,
        fields: fields.map((field) => ({
          name: String(field.name).slice(0, 256),
          value: String(field.value || '-').slice(0, 1024),
          inline: !!field.inline
        })),
        timestamp: new Date().toISOString()
      }]
    }, { timeout: 15000 });
    return true;
  } catch (error) {
    console.warn('Discord webhook error:', error.message);
    return false;
  }
}

module.exports = { sendDiscordLog };
