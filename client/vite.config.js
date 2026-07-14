import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import fs from "fs"
// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  // server: {
  //   host: true,
  //   https: {
  //     key: fs.readFileSync('localhost-key.pem'),
  //     cert: fs.readFileSync('localhost.pem'),
  //   },
  //   allowedHosts: ['planly.duckdns.org', 'localhost'],
  //   port: 5173
  // }
})

