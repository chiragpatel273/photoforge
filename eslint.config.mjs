import js from '@eslint/js';
import ts from 'typescript-eslint';

export default ts.config(
  { ignores: ['**/dist/**', '**/.next/**', '**/node_modules/**', '**/next-env.d.ts'] },
  {
    languageOptions: {
      globals: {
        process: 'readonly',
        module: 'readonly',
        require: 'readonly',
        Buffer: 'readonly',
        console: 'readonly',
        setTimeout: 'readonly',
        __dirname: 'readonly',
        __ENV: 'readonly',
      },
    },
  },
  js.configs.recommended,
  ...ts.configs.recommended,
  {
    files: ['**/*.ts', '**/*.tsx'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },
  { files: ['**/*.cjs'], rules: { '@typescript-eslint/no-require-imports': 'off' } },
);
