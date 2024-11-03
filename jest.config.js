module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>'],
  testRegex: '(/__tests__/.*|(\\.|/)(test|spec))\\.tsx?$',
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'node'],
  transform: {
    '(/__tests__/.*|(\\.|/)(test|spec))\\.tsx?$': [
      'ts-jest',
      { tsconfig: 'tsconfig.jest.json' },
    ],
  },
};
