import process from 'node:process'
import { reactRouter } from '@react-router/dev/vite'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig, loadEnv } from 'vite'
import tsconfigPaths from 'vite-tsconfig-paths'

export default defineConfig(({ mode }) => {
  // The route loaders read `process.env.API_URL` on the server, and Vite only
  // hands prefixed variables to the client bundle: without this, a local
  // `.env` stays invisible and the landing silently renders its built-in
  // content instead of what the backoffice publishes. In production the
  // variable comes from the host, where nothing reads this file.
  Object.assign(process.env, loadEnv(mode, process.cwd(), 'API_'))

  return {
    plugins: [
      tailwindcss(),
      reactRouter(),
      tsconfigPaths(),
    ],
    server: {
      // 5174 belongs to web-spa; the landing lives next door.
      port: 5175,
    },
  }
})
