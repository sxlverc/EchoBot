const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

function loadEnvFile(fileName) {
  const fullPath = path.join(__dirname, fileName);
  if (!fs.existsSync(fullPath)) {
    return {};
  }

  const parsed = dotenv.parse(fs.readFileSync(fullPath));
  return parsed || {};
}

const env = loadEnvFile('.env');

module.exports = {
  apps: [{
    name: 'EchoBot-FloofSquad',
    script: 'index.js',
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: '1G',
    env: {
      ...env,
      NODE_ENV: 'production',
      GUILD_ID: '1290908274518003726'
    },
    error_file: './logs/err.log',
    out_file: './logs/out.log',
    log_file: './logs/combined.log',
    time: true,
    restart_delay: 5000
  }]
};