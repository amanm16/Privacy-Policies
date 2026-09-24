// pm2 process file:  pm2 start ecosystem.config.js
// Settings come from .env in this folder (see .env.example).
module.exports = {
  apps: [
    {
      name: 'privacy-policies',
      script: 'server/index.js',
      // One process: the sign-in rate limit is kept in memory.
      instances: 1,
      exec_mode: 'fork',
      env: { NODE_ENV: 'production' },
      max_memory_restart: '300M',
      kill_timeout: 10000,
    },
  ],
};
