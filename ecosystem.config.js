module.exports = {
  apps: [
    {
      name: 'diskkatalog',
      script: 'index.js',
      cwd: './server',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
      env: {
        NODE_ENV: 'production',
        PORT: 3012,
      },
      error_file: './Logs/pm2-error.log',
      out_file: './Logs/pm2-out.log',
      merge_logs: true,
      time: true,
    },
  ],
};
