import react from '@vitejs/plugin-react';
import { tanstackStart } from '@tanstack/react-start/plugin/vite';
import { defineConfig } from 'vite';
import tailwindcss from '@tailwindcss/vite';
import mdx from 'fumadocs-mdx/vite';
import { nitro } from 'nitro/vite';

// GitHub Pages serves project pages under https://<user>.github.io/<repo>/.
// In CI/production we deploy under `/unffi/`; locally we serve at `/`.
// The `postbuild` script copies _shell.html → index.html/404.html and
// writes .nojekyll so Pages serves the assets/ dir.
const isProd = process.env.NODE_ENV === 'production';
const basePath = isProd ? '/unffi/' : '/';
const routerBasepath = isProd ? '/unffi' : '/';

export default defineConfig({
  base: basePath,
  server: {
    port: 3000,
  },
  plugins: [
    mdx(),
    tailwindcss(),
    tanstackStart({
      router: {
        basepath: routerBasepath,
      },
      spa: {
        enabled: true,
        prerender: {
          enabled: true,
          crawlLinks: true,
        },
      },

      pages: [
        {
          path: '/docs',
        },
        {
          path: '/api/search',
        },
        {
          path: 'llms-full.txt',
        },
        {
          path: 'llms.txt',
        },
      ],
    }),
    react(),
    // please see https://tanstack.com/start/latest/docs/framework/react/guide/hosting#nitro for guides on hosting
    nitro(),
  ],
  resolve: {
    tsconfigPaths: true,
    alias: {
      tslib: 'tslib/tslib.es6.js',
    },
  },
});
