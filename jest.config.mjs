export default {
  preset: 'ts-jest/presets/default-esm',
  testEnvironment: 'node',
  roots: ['<rootDir>'],
  testRegex: '(/__tests__/.*|(\\.|/)(test|spec))\\.tsx?$',
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'node'],
  transform: {
    '(/__tests__/.*|(\\.|/)(test|spec))\\.tsx?$': [
      'ts-jest',
      { tsconfig: 'tsconfig.jest.json', useESM: true },
    ],
  },
  extensionsToTreatAsEsm: ['.ts', '.tsx'],
  coverageReporters: ['json-summary'],
  // moduleNameMapper: {
  //   '^@adaptate/utils/(.*)$': '<rootDir>/packages/utils/src/$1',
  // },
};
