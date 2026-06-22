const fs = require('fs');

const envKeys = [
  'VITE_SUPABASE_URL',
  'VITE_SUPABASE_PUBLISHABLE_KEY',
  'VITE_GEMINI_API_KEY',
  'VITE_TELEGRAM_BOT_TOKEN',
  'VITE_TELEGRAM_CHAT_ID'
];

let envContent = '';
envKeys.forEach(key => {
  const val = process.env[key];
  if (val) {
    envContent += `${key}="${val}"\n`;
  }
});

fs.writeFileSync('.env', envContent);
console.log('.env file generated successfully for build!');
