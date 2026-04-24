import { build } from 'esbuild';

await build({
  entryPoints: ['packages/cli/src/index.ts'],
  outfile: 'dist/feas.js',
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22',
  sourcemap: true,
  external: ['@prisma/client', 'fastify', 'commander'],
});
