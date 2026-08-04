import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import fs from "fs"
// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
})

