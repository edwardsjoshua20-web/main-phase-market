import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'
import fs from 'node:fs';
import path from 'node:path';

function copyDirectoryContents(sourceDir, targetDir, { exclude = new Set() } = {}) {
  if (!fs.existsSync(sourceDir)) {
    return;
  }

  fs.mkdirSync(targetDir, { recursive: true });

  for (const entry of fs.readdirSync(sourceDir, { withFileTypes: true })) {
    if (exclude.has(entry.name)) {
      continue;
    }

    const sourcePath = path.join(sourceDir, entry.name);
    const targetPath = path.join(targetDir, entry.name);

    if (entry.isDirectory()) {
      copyDirectoryContents(sourcePath, targetPath);
      continue;
    }

    fs.mkdirSync(path.dirname(targetPath), { recursive: true });
    fs.copyFileSync(sourcePath, targetPath);
  }
}

function copyFilteredPublicAssetsPlugin({ enabled, rootDir }) {
  return {
    name: 'copy-filtered-public-assets',
    apply: 'build',
    writeBundle(outputOptions) {
      if (!enabled) {
        return;
      }

      const publicDir = path.resolve(rootDir, 'public');
      const outDir = path.resolve(rootDir, outputOptions.dir || 'dist');
      copyDirectoryContents(publicDir, outDir, { exclude: new Set(['data']) });
    }
  };
}

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const localApiUrl = env.VITE_LOCAL_API_URL || 'http://127.0.0.1:8787';
  const backendProvider = env.VITE_APP_BACKEND_PROVIDER || 'local';
  const apiOrigin = env.VITE_API_ORIGIN || '';
  const externalizePublicData = String(env.VITE_EXTERNALIZE_PUBLIC_DATA || '').trim() === '1';

  return {
    logLevel: 'error',
    plugins: [
      react(),
      copyFilteredPublicAssetsPlugin({
        enabled: externalizePublicData,
        rootDir: __dirname
      })
    ],
    publicDir: externalizePublicData ? false : 'public',
    build: {
      outDir: 'dist',
      emptyOutDir: true
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, 'src')
      }
    },
    server: {
      host: '127.0.0.1',
      proxy: {
        '/api/local': {
          target: apiOrigin || localApiUrl,
          changeOrigin: true
        }
      }
    },
    optimizeDeps: {
      esbuildOptions: {
        loader: {
          '.js': 'jsx'
        }
      }
    }
  };
});
