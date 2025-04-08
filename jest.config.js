module.exports = {
  preset: "ts-jest",
  transform: {
    '^.+\\.ts$': 'ts-jest',
  },
  testEnvironment: "node",
  silent: false,
  setupFilesAfterEnv: ['<rootDir>/prisma/singleton.ts', './jest.setup.js'],
  extensionsToTreatAsEsm: ['.ts'],
  collectCoverage: true,
  coverageDirectory: "coverage",
  coverageReporters: ["text", "lcov"],
};
