/** @type {import('jest').Config} */
module.exports = {
  testEnvironment: 'node',
  transform: {
    '^.+\\.tsx?$': ['ts-jest', { tsconfig: { strict: false } }],
  },
  testMatch: ['**/__tests__/**/*.test.ts'],
  moduleNameMapper: {
    '^expo-image-manipulator$': '<rootDir>/__mocks__/expo-image-manipulator.ts',
    '^expo-file-system/legacy$': '<rootDir>/__mocks__/expo-file-system.ts',
    '^./supabase$': '<rootDir>/__mocks__/supabase.ts',
    '^../supabase$': '<rootDir>/__mocks__/supabase.ts',
    '^../../supabase$': '<rootDir>/__mocks__/supabase.ts',
    '^../lib/supabase$': '<rootDir>/__mocks__/supabase.ts',
    '^./cycle$': '<rootDir>/lib/cycle.ts',
    '^../cycle$': '<rootDir>/lib/cycle.ts',
    '^../types$': '<rootDir>/__mocks__/types.ts',
    '^../../types$': '<rootDir>/__mocks__/types.ts',
  },
}
