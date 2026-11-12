/** Unit tests: fast, no I/O. Coverage is collected together with the integration project (see jest.coverage.config.js). */
/** @type {import('jest').Config} */
module.exports = {
  displayName: 'unit',
  preset: 'ts-jest',
  testEnvironment: 'node',
  rootDir: '.',
  testMatch: ['<rootDir>/src/**/*.spec.ts'],
  moduleFileExtensions: ['ts', 'js', 'json'],
  clearMocks: true,
  setupFiles: ['<rootDir>/test/setup/silence-nest-logger.ts'],
};
