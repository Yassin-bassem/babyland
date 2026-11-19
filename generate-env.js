import fs from 'fs';
import process from 'process';

const envKeys = [
  'VITE_GEMINI_API_KEY',
  'VITE_TELEGRAM_BOT_TOKEN',
  'VITE_TELEGRAM_CHAT_ID'
];

let envContent = `VITE_SUPABASE_URL="https://ezinpkzlpszzztkcozud.supabase.co"\nVITE_SUPABASE_PUBLISHABLE_KEY="sb_publishable_Xhp2s62tWwhC6M49p6w_aw_2X2362iI"\nVITE_SUPABASE_ANON_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImV6aW5wa3pscHN6enp0a2NvenVkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIxNTE3NzcsImV4cCI6MjA5NzcyNzc3N30.7mZvoyEXTBbha1QF2Qije1C2CDsdo2p4wY2LYABw6LY"\nVITE_SUPABASE_PROJECT_ID="ezinpkzlpszzztkcozud"\n`;

envKeys.forEach(key => {
  const val = process.env[key];
  if (val) {
    envContent += `${key}="${val}"\n`;
  }
});

fs.writeFileSync('.env', envContent);
console.log('.env file generated successfully for Babyland build!');
