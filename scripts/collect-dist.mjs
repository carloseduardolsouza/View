// Copia o build do web (apps/web/dist) para ./dist na raiz do repo: pasta única consumida pelo web-laudos.
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const out = path.join(root, 'dist');
fs.rmSync(out, { recursive: true, force: true });
fs.cpSync(path.join(root, 'apps/web/dist'), out, { recursive: true });
console.log(`Visualizador pronto em ${out}`);
