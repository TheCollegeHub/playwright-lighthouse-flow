import { defineConfig } from 'tsup';

export default defineConfig([
  {
    entry: ['src/index.ts'],
    format: ['esm', 'cjs'],
    splitting: false,
    dts: true,
    sourcemap: false,
    clean: true,
    outDir: 'dist',
    banner: {} 
  },
  {
    entry: ['src/bin/compare-flow-results.ts'],
    format: ['cjs'],  
    splitting: false,
    dts: false,
    sourcemap: false,
    clean: false,          
    outDir: 'dist/bin',
    banner: {
      js: '#!/usr/bin/env node'
    }
  }
]);
