import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// BrowserRouter needs a real path base. Locally this is '/'; the Pages deploy
// sets BASE_PATH=/lumen-metrics/ so routes and asset URLs resolve under the
// project-pages prefix.
export default defineConfig({
  base: process.env.BASE_PATH || '/',
  plugins: [react(), tailwindcss()],
})
