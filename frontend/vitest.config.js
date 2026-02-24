import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
    plugins: [react()],
    resolve: {
        alias: {
            '@': path.resolve(__dirname, './src'),
        },
    },
    test: {
        globals: true,
        environment: 'jsdom',
        setupFiles: ['./src/setupTests.js'],
        include: [
            'src/**/*.test.{js,jsx,ts,tsx}',
            'src/**/*.integration.test.{js,jsx,ts,tsx}',
        ],
        coverage: {
            reporter: ['text', 'json', 'html'],
            include: [
                'src/services/uploadService.js',
                'src/components/common/ProgressDialog.jsx',
            ],
        },
    },
});
