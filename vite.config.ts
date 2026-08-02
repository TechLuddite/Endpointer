import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';

// Normalise any path fragment into a Vite `base` ("" and "/" both mean site root).
const toBase = (p: string) => {
  const trimmed = p.replace(/^\/+|\/+$/g, '');
  return trimmed ? `/${trimmed}/` : '/';
};

const resolveBase = () => {
  // 1. actions/configure-pages gives us the full site URL. This is the only
  //    authoritative source, because it already accounts for a custom domain
  //    (served from the domain root) vs. a project page (served from /<repo>/).
  if (process.env.PAGES_BASE_URL) {
    try {
      return toBase(new URL(process.env.PAGES_BASE_URL).pathname);
    } catch {
      // fall through to the checks below
    }
  }

  // 2. base_path from the same action. It is an empty string when the site is
  //    served from the domain root, so "defined but empty" must NOT be treated
  //    as "unset" -- doing so is what produced a /<repo>/ base on a custom
  //    domain, 404ing every asset and leaving a white screen.
  if (process.env.BASE_PATH !== undefined) {
    return toBase(process.env.BASE_PATH);
  }

  // 3. Guess from the repository name when building in Actions without the
  //    Pages action. A user/org page (<user>.github.io) is served from the root.
  const repoName = process.env.GITHUB_REPOSITORY?.split('/')[1];
  if (repoName) {
    return repoName.endsWith('.github.io') ? '/' : `/${repoName}/`;
  }

  // 4. Anywhere else (AI Studio, Cloud Run, local preview): relative paths work
  //    regardless of the directory the app ends up being served from.
  return './';
};

export default defineConfig({
  base: resolveBase(),
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(process.cwd(), 'src'),
    },
  },
  build: {
    // Split the vendor chunks explicitly so a directory-data change does not
    // invalidate the React runtime chunk for returning visitors.
    rollupOptions: {
      output: {
        manualChunks: (id: string) => {
          if (id.includes('node_modules/react') || id.includes('node_modules/scheduler'))
            return 'react';
          if (id.includes('node_modules/lucide-react')) return 'icons';
          return undefined;
        },
      },
    },
  },
  server: {
    // HMR is disabled in AI Studio via DISABLE_HMR env var.
    // Do not modify—file watching is disabled to prevent flickering during agent edits.
    hmr: process.env.DISABLE_HMR !== 'true',
    // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
    watch: process.env.DISABLE_HMR === 'true' ? null : {},
  },
});
