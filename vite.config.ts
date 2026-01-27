import { defineConfig } from 'vite'

export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        main: 'index.html',
        host: 'host.html',
        play: 'play.html',
      },
    },
  },
})
