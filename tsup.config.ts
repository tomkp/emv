import { defineConfig } from 'tsup';

export default defineConfig({
    entry: ['src/index.ts'],
    format: ['esm', 'cjs'],
    dts: true,
    clean: true,
    sourcemap: true,
    target: 'node18',
    splitting: false,
    outExtension({ format }) {
        return {
            js: format === 'cjs' ? '.cjs' : '.js',
        };
    },
});
