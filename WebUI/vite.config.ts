import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    host: true,  // Listen on all interfaces (0.0.0.0)
    port: 5173,
  },
  build: {
    // Consistent filenames for JUCE BinaryData embedding
    // Without this, Vite generates hashed names like index-ctxP8m3-.js
    // which break BinaryData resource lookups
    rollupOptions: {
      output: {
        entryFileNames: 'assets/index.js',
        chunkFileNames: 'assets/[name].js',
        assetFileNames: 'assets/[name].[ext]'
      }
    }
  }
})
