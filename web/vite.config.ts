import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, type Plugin } from 'vite';

const here = dirname(fileURLToPath(import.meta.url));
const DATA = resolve(here, '../data');

// Solo questi file di data/ vanno nel sito. I report interni (unresolved.csv, risoluzione.csv,
// dedup.json, set-ingresso.md, baseline-*.md) contengono testo grezzo delle decklist e restano nel repo.
const PUBLIC_DATA = ['cards.json', 'printings.json', 'names.json', 'allnames.json', 'meta.json'];
const PUBLIC_REVIEWS = /^(index\.json|[a-z0-9]+\.(json|md))$/;

function publicDataFiles(): string[] {
  const out = PUBLIC_DATA.filter((f) => existsSync(join(DATA, f)));
  const rev = join(DATA, 'reviews');
  if (existsSync(rev)) {
    for (const f of readdirSync(rev)) {
      if (PUBLIC_REVIEWS.test(f) && f !== 'dedup.json' && statSync(join(rev, f)).isFile()) out.push(`reviews/${f}`);
    }
  }
  return out;
}

const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self'",
  "img-src 'self' https://cards.scryfall.io data:",
  "connect-src 'self'",
  "font-src 'self'",
  "manifest-src 'self'",
  "worker-src 'none'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'none'",
].join('; ');

function celhoData(): Plugin {
  let isBuild = false;
  return {
    name: 'celho-data',
    configResolved(c) {
      isBuild = c.command === 'build';
    },
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = (req.url || '').split('?')[0];
        const m = url.match(/\/data\/(.+)$/);
        if (!m) return next();
        const rel = decodeURIComponent(m[1]);
        if (!publicDataFiles().includes(rel)) {
          res.statusCode = 404;
          return res.end();
        }
        res.setHeader('Content-Type', rel.endsWith('.md') ? 'text/markdown; charset=utf-8' : 'application/json');
        res.end(readFileSync(join(DATA, rel)));
      });
    },
    transformIndexHtml(html) {
      if (!isBuild) return html;
      return html.replace('<meta charset="utf-8">',
        `<meta charset="utf-8">\n<meta http-equiv="Content-Security-Policy" content="${CSP}">`);
    },
    writeBundle(opts) {
      const out = opts.dir || resolve(here, 'dist');
      for (const rel of publicDataFiles()) {
        const dest = join(out, 'data', rel);
        mkdirSync(dirname(dest), { recursive: true });
        copyFileSync(join(DATA, rel), dest);
      }
    },
  };
}

export default defineConfig({
  base: './',
  plugins: [celhoData()],
  build: { target: 'es2022', sourcemap: false },
  server: { port: 5173, strictPort: true },
  preview: { port: 4173, strictPort: true },
});
