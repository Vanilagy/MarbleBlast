import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { defineConfig, minify } from 'vite';

const STATIC_PATHS = ['assets', 'lib/pako.js', 'lib/webm.js', 'manifest.json', 'sw.js'];

export default defineConfig({
	root: 'src',
	base: './',
	publicDir: false,
	build: {
		outDir: '../dist',
		emptyOutDir: true,
		assetsDir: 'bundles',
		rolldownOptions: {
			checks: {
				bundlerTimings: false
			},
			output: {
				assetFileNames: 'bundles/[hash][extname]'
			}
		}
	},
	plugins: [classicScripts(), copyStatic()]
});

function classicScripts() {
	return {
		// Vite only bundles module scripts, so we need a custom plugin to handle classic scripts
		name: 'classic-scripts',
		apply: 'build',
		transformIndexHtml: {
			order: 'pre',
			async handler(html) {
				html = html.replace(/<(img|link)\b(?![^>]*rel="stylesheet")/g, '<$1 vite-ignore');

				const scriptTagRE = /<script src="\.\/([^"]+)" defer><\/script>/g;
				const runRE = new RegExp(`${scriptTagRE.source}(?:\\s*${scriptTagRE.source})*`, 'g');

				for (const [run] of html.matchAll(runRE)) {
					let codes = [];
					for (const [, src] of run.matchAll(scriptTagRE)) {
						const code = fs.readFileSync(path.join(import.meta.dirname, 'src', src), 'utf8');
						const result = await minify(src, code);
						if (result.errors.length > 0) throw new Error(`Failed to minify ${src}: ${result.errors[0].message}`);

						codes.push(result.code);
					}

					const source = codes.join('\n');
					const hash = crypto.createHash('sha256').update(source).digest('hex').slice(0, 12);
					const fileName = `bundles/${hash}.js`;
					this.emitFile({
						type: 'asset',
						fileName,
						source
					});

					html = html.replace(run, `<script src="./${fileName}" defer vite-ignore></script>`);
				}

				return html;
			}
		}
	};
}

function copyStatic() {
	return {
		name: 'copy-static',
		apply: 'build',
		async writeBundle() {
			await Promise.all(STATIC_PATHS.map(staticPath => fs.promises.cp(
				path.join(import.meta.dirname, 'src', staticPath),
				path.join(import.meta.dirname, 'dist', staticPath),
				{
					recursive: true,
					filter: (source) => path.basename(source) !== '.DS_Store'
				}
			)));
		}
	};
}
