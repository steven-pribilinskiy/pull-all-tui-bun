import { describe, test, expect } from 'bun:test';
import { appendLines, Semaphore } from '../runner.ts';

describe('appendLines', () => {
  const cases: Array<{
    name: string;
    existing: string[];
    newText: string;
    expected: string[];
  }> = [
    {
      name: 'appends single line',
      existing: [],
      newText: 'hello',
      expected: ['hello'],
    },
    {
      name: 'appends multiple lines',
      existing: ['a'],
      newText: 'b\nc',
      expected: ['a', 'b', 'c'],
    },
    {
      name: 'strips trailing empty from newline',
      existing: [],
      newText: 'line1\nline2\n',
      expected: ['line1', 'line2'],
    },
    {
      name: 'empty newText returns existing',
      existing: ['x'],
      newText: '',
      expected: ['x'],
    },
    {
      name: 'preserves existing lines',
      existing: ['first', 'second'],
      newText: 'third',
      expected: ['first', 'second', 'third'],
    },
  ];

  for (const testCase of cases) {
    test(testCase.name, () => {
      expect(appendLines(testCase.existing, testCase.newText)).toEqual(testCase.expected);
    });
  }

  test('ring buffer cap: trims oldest lines when over 10000', () => {
    const large = Array.from({ length: 10_000 }, (_, idx) => `line ${idx}`);
    const result = appendLines(large, 'new-line');
    expect(result.length).toBe(10_000);
    expect(result[result.length - 1]).toBe('new-line');
    expect(result[0]).toBe('line 1'); // line 0 was dropped
  });
});

describe('Semaphore', () => {
  test('allows N concurrent acquires without blocking', async () => {
    const sem = new Semaphore(3);
    const order: number[] = [];
    await sem.acquire();
    order.push(1);
    await sem.acquire();
    order.push(2);
    await sem.acquire();
    order.push(3);
    expect(order).toEqual([1, 2, 3]);
  });

  test('blocks when over limit', async () => {
    const sem = new Semaphore(1);
    await sem.acquire();
    let released = false;

    // This should block until release
    const pending = sem.acquire().then(() => {
      released = true;
    });

    expect(released).toBe(false);
    sem.release();
    await pending;
    expect(released).toBe(true);
  });

  test('queues multiple waiters in order', async () => {
    const sem = new Semaphore(1);
    await sem.acquire();

    const order: number[] = [];
    const waiter1 = sem.acquire().then(() => {
      order.push(1);
      sem.release();
    });
    const waiter2 = sem.acquire().then(() => {
      order.push(2);
      sem.release();
    });

    sem.release();
    await Promise.all([waiter1, waiter2]);
    expect(order).toEqual([1, 2]);
  });

  test('release increments count when no waiters', () => {
    const sem = new Semaphore(0);
    sem.release();
    // Should be able to acquire immediately now
    let resolved = false;
    sem.acquire().then(() => {
      resolved = true;
    });
    return new Promise<void>(resolve => {
      setTimeout(() => {
        expect(resolved).toBe(true);
        resolve();
      }, 10);
    });
  });
});
