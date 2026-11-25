import { statusForLoadError } from '../useLeaderboard';

// The shape Expo modules give a native promise.reject(code, message).
const coded = (code: string) => Object.assign(new Error('native'), { code });

describe('board load errors', () => {
  it('shows a missing earlier occurrence as empty', () => {
    expect(statusForLoadError(coded('E_NO_OCCURRENCE'))).toBe('empty');
  });

  it('shows every other failure as an error', () => {
    expect(statusForLoadError(coded('E_LOAD_ENTRIES'))).toBe('error');
    expect(statusForLoadError(coded('E_NOT_AUTHENTICATED'))).toBe('error');
    expect(statusForLoadError(new Error('no occurrence'))).toBe('error');
    expect(statusForLoadError(undefined)).toBe('error');
    expect(statusForLoadError('E_NO_OCCURRENCE')).toBe('error');
  });
});
