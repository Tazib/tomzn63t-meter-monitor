// PM2 setup for hosting without Docker: `pm2 start ecosystem.config.cjs && pm2 save`
module.exports = {
  apps: [
    {
      name: "energy-web",
      cwd: __dirname,
      script: "node_modules/next/dist/bin/next",
      args: "start -H 127.0.0.1 -p 3000",
      env: { NODE_ENV: "production", TZ: "Asia/Dhaka" },
      max_memory_restart: "600M",
    },
    {
      name: "energy-poller",
      cwd: __dirname,
      script: "node_modules/tsx/dist/cli.mjs",
      args: "scripts/poller.ts",
      env: { NODE_ENV: "production", TZ: "Asia/Dhaka" },
      max_memory_restart: "300M",
    },
  ],
};
