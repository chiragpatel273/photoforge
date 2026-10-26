module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: ['<rootDir>/tests/**/*.test.ts', '<rootDir>/tests/**/*.test.tsx'],
  testPathIgnorePatterns: ['/node_modules/', 'offline.test.ts'],
  moduleNameMapper: {
    '^@photoforge/shared$': '<rootDir>/packages/shared/src/index.ts',
    '^@photoforge/shared/server$': '<rootDir>/packages/shared/src/server.ts',
  },
  transform: {
    '^.+\\.tsx?$': [
      'ts-jest',
      {
        tsconfig: {
          ...require('./tsconfig.base.json').compilerOptions,
          jsx: 'react-jsx',
          isolatedModules: true,
        },
        diagnostics: true,
      },
    ],
  },
  testTimeout: 30000,
};
