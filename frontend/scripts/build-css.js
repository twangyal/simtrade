import { mkdir, readFile, writeFile } from 'node:fs/promises';
import postcss from 'postcss';
import tailwindcss from '@tailwindcss/postcss';

const source = new URL('../src/styles.css', import.meta.url);
const output = new URL('../dist/styles.css', import.meta.url);
const result = await postcss([tailwindcss()]).process(await readFile(source, 'utf8'), {
  from: source.pathname,
  to: output.pathname,
});
await mkdir(new URL('../dist/', import.meta.url), { recursive: true });
await writeFile(output, result.css);
for (const warning of result.warnings()) console.warn(warning.toString());
