/* eslint-disable */
export default {
  displayName: 'parser',
  preset: '../../jest.preset.js',
  testEnvironment: 'node',
  transform: {
    '^.+\\.[tj]s$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.spec.json' }],
  },
  moduleFileExtensions: ['ts', 'js', 'html'],
  coverageDirectory: '../../coverage/packages/parser',
  collectCoverageFrom: ['src/lib/**/*.ts', '!src/lib/**/*.spec.ts'],
  coverageReporters: ['json', 'lcov'],
}
