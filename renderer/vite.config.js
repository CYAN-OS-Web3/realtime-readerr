import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => ({
  plugins: [react()],
  // electron builds need './' for file:// protocol; web/MiniPay builds use '/'
  base: mode === 'electron' ? './' : '/',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
  server: {
    host: '0.0.0.0', // allows ngrok tunneling for MiniPay dev testing
    port: 5173,
    allowedHosts: true, // allows any ngrok URL
  },
}));
