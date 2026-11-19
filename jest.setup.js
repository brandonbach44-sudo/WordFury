// Test setup for the pure-function tests (npm test).
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

// The Hex Hive target reads the full word list; tests use a fixed target.
jest.mock('./src/shared/leaderboards/hexTarget', () => ({ hexMasterTargetFor: () => 60 }));
