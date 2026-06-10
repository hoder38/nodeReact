module.exports = {
  testEnvironment: 'node',
  transform: {},
  moduleFileExtensions: ['js', 'jsx', 'json', 'node'],
  testMatch: ['**/__tests__/**/*.test.js'],
  // ESM support — tests use dynamic import() with jest.unstable_mockModule
  // Jest 27 doesn't resolve `exports.import` condition for dual-mode packages.
  // Map cheerio/slim to its ESM build, and redirect htmlparser2 to the
  // top-level CJS version so the existing jest.unstable_mockModule mock
  // intercepts it (cheerio receives undefined parseDocument but never calls
  // it because all tests pass DOM node arrays, not HTML strings).
  moduleNameMapper: {
    '^cheerio/slim$': '<rootDir>/node_modules/cheerio/dist/esm/slim.js',
    '^htmlparser2$': '<rootDir>/node_modules/htmlparser2/lib/index.js',
  },
};
