module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  silent: false,
  setupFilesAfterEnv: ['<rootDir>/prisma/singleton.ts'],
};
