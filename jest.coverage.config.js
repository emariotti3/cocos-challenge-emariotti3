/**
 * `npm run test:cov`: runs unit + integration projects in one process and
 * reports merged coverage with thresholds (CI fails below them).
 */
/** @type {import('jest').Config} */
module.exports = {
  projects: ['<rootDir>/jest.config.js', '<rootDir>/test/jest-e2e.config.js'],
  collectCoverage: true,
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.spec.ts',
    '!src/main.ts',
    '!src/tools/**',
    '!src/**/*.module.ts',
    '!src/**/*.dto.ts',
    '!src/**/dto/**',
    '!src/**/index.ts',
    '!src/database/migrations/**',
    '!src/database/seeders/**',
    '!src/database/cli.ts',
    '!src/database/umzug.ts',
    '!src/database/models/**',
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['text-summary', 'text', 'lcov', 'json-summary'],
  coverageThreshold: {
    global: { branches: 80, functions: 85, lines: 85, statements: 85 },
  },
  watchman: false,
  // integration suites share one database: never run them in parallel
  maxWorkers: 1,
};
