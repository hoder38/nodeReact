module.exports = {
  testEnvironment: 'jsdom',
  transform: {
    '\\.[jt]sx?$': ['babel-jest', {
      presets: [
        ['@babel/preset-env', { targets: { node: 'current' }, modules: 'commonjs' }],
        '@babel/preset-react',
      ],
      plugins: [
        '@babel/plugin-proposal-class-properties',
      ],
    }],
  },
  transformIgnorePatterns: [
    '/node_modules/(?!isomorphic-fetch)',
  ],
  moduleNameMapper: {
    '\\.(css|less|scss|sass)$': 'identity-obj-proxy',
    '\\.(gif|ttf|eot|svg|png|woff|woff2)$': '<rootDir>/src/front/__tests__/fileMock.js',
  },
  testMatch: ['**/src/front/**/*.test.js'],
  setupFiles: ['<rootDir>/src/front/__tests__/setup.js'],
  setupFilesAfterEnv: ['<rootDir>/src/front/__tests__/setupAfterFramework.js'],
  moduleFileExtensions: ['js', 'jsx', 'json'],
};
