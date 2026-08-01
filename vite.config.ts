import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';

export default defineConfig(() => {
  // Use BASE_PATH from configure-pages (GitHub Actions), or derive from GITHUB_REPOSITORY, or default to './'
  let base = process.env.BASE_PATH || '';

  if (!base && process.env.GITHUB_REPOSITORY) {
    const repoName = process.env.GITHUB_REPOSITORY.split('/')[1];
    if (repoName && repoName.endsWith('.github.io')) {
      base = '/';
    } else if (repoName) {
      base = `/${repoName}/`;
    }
  }

  if (!base) {
    base = './';
  }

  return {
    base,
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modifyâfile watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
