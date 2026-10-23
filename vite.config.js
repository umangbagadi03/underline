// Vite settings.
// 1. In the built app, a strict security policy (CSP): the page may only load its own files
//    and talk to the local AI engine. No third-party scripts, no tracking, nothing else.
// 2. In development, the browser eval page can save its results into eval/results/.

import { defineConfig } from 'vite';
import { writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';

const LOCAL_ENGINES = 'http://localhost:11434 http://127.0.0.1:11434 http://localhost:8080 http://127.0.0.1:8080';

const CSP = [
  "default-src 'self'",
  "script-src 'self' 'wasm-unsafe-eval' blob:", // wasm + the AI runtime's worker code
  "worker-src 'self' blob:",
  `connect-src 'self' ${LOCAL_ENGINES}`,
  "img-src 'self' data: blob:",
  "style-src 'self' 'unsafe-inline'",
  "font-src 'self' data:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'none'",
].join('; ');

/** Add the CSP meta tag to the built index.html only (Vite's dev server needs more freedom). */
function securityPolicyPlugin() {
  return {
    name: 'security-policy',
    apply: 'build',
    transformIndexHtml(html) {
      const tag = `<meta http-equiv="Content-Security-Policy" content="${CSP}">`;
      return html.replace('<meta charset="utf-8">', `<meta charset="utf-8">\n  ${tag}`);
    },
  };
}

function saveResultsPlugin() {
  return {
    name: 'save-eval-results',
    configureServer(server) {
      server.middlewares.use('/__save-result', async (req, res) => {
        let body = '';
        for await (const chunk of req) body += chunk;
        const data = JSON.parse(body);
        const name = `${data.provider}-${data.model}`.replace(/[^a-z0-9.-]+/gi, '_');
        const folder = join(process.cwd(), 'eval', 'results');
        await mkdir(folder, { recursive: true });
        await writeFile(join(folder, `${name}.json`), JSON.stringify(data, null, 2));
        res.end('saved');
      });
    },
  };
}

export default defineConfig({
  plugins: [securityPolicyPlugin(), saveResultsPlugin()],
  server: { port: 5173, strictPort: true },
  preview: { port: 4173, strictPort: true },
  optimizeDeps: { exclude: ['@mlc-ai/web-llm'] },
  build: { target: 'es2022' },
});
