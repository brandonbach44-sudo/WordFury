import { currentOccurrenceDate, occurrenceStatus } from '../occurrence';

// jest.mock is hoisted above the import.
const mockLoadOccurrence = jest.fn();
jest.mock('../../../../modules/game-center', () => ({ GameCenter: { loadOccurrence: (...args: unknown[]) => mockLoadOccurrence(...args) } }));

const NOW = Date.UTC(2026, 10, 25, 12, 0, 0);
const DAY_S = 24 * 60 * 60;

describe('occurrence status', () => {
  beforeEach(() => {
    jest.spyOn(Date, 'now').mockReturnValue(NOW);
    mockLoadOccurrence.mockReset();
  });
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('reports a board whose first occurrence starts later as not open', async () => {
    mockLoadOccurrence.mockResolvedValue({ startDate: Date.UTC(2026, 10, 30, 8), durationSeconds: 7 * DAY_S, nextStartDate: -1 });
    expect(await occurrenceStatus('board.future')).toEqual({ kind: 'notOpen' });
    expect(await currentOccurrenceDate('board.future')).toBeNull();
  });

  it('reports the open occurrence date', async () => {
    mockLoadOccurrence.mockResolvedValue({ startDate: Date.UTC(2026, 10, 25, 8), durationSeconds: DAY_S, nextStartDate: -1 });
    expect(await occurrenceStatus('board.open')).toEqual({ kind: 'open', dateISO: '2026-11-25' });
    expect(await currentOccurrenceDate('board.open')).toBe('2026-11-25');
  });

  it('reports unknown when Game Center fails', async () => {
    mockLoadOccurrence.mockRejectedValue(new Error('offline'));
    expect(await occurrenceStatus('board.error')).toEqual({ kind: 'unknown' });
    expect(await currentOccurrenceDate('board.error')).toBeNull();
  });
});
