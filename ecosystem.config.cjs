// PM2 process file for the backend. Build first with `npm run build:server`.
module.exports = {
  apps: [
    {
      name: 'nook',
      script: 'dist-server/index.js',
      cwd: __dirname,
      node_args: '--enable-source-maps',
      // The world lives in this one process's memory, so there must only ever be one.
      instances: 1,
      exec_mode: 'fork',
      max_memory_restart: '400M',
      // Gives the server time to write the world to disk before PM2 force-kills it.
      kill_timeout: 5000,
      time: true,
      env: {
        NODE_ENV: 'production',
      },
    },
  ],
};
