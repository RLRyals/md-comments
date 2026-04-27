const esbuild = require('esbuild');

const watch = process.argv.includes('--watch');
const production = process.argv.includes('--production');

const common = {
  bundle: true,
  sourcemap: !production,
  minify: production,
  logLevel: 'info'
};

const extensionConfig = {
  ...common,
  entryPoints: ['src/extension.ts'],
  outfile: 'dist/extension.js',
  platform: 'node',
  target: 'node18',
  format: 'cjs',
  external: ['vscode']
};

const webviewConfig = {
  ...common,
  entryPoints: ['webview/main.ts'],
  outfile: 'dist/webview.js',
  platform: 'browser',
  target: 'es2022',
  format: 'iife'
};

async function run() {
  if (watch) {
    const ctxs = await Promise.all([
      esbuild.context(extensionConfig),
      esbuild.context(webviewConfig)
    ]);
    await Promise.all(ctxs.map((c) => c.watch()));
    console.log('esbuild watching...');
  } else {
    await Promise.all([
      esbuild.build(extensionConfig),
      esbuild.build(webviewConfig)
    ]);
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
