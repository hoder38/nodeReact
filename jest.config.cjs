module.exports = {
  testEnvironment: 'node',
  transform: {},
  moduleFileExtensions: ['js', 'jsx', 'json', 'node'],
  testMatch: ['**/__tests__/**/*.test.js'],
  // ESM support — tests use dynamic import() with jest.unstable_mockModule
};
