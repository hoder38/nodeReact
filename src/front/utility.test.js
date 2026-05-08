import {
  isValidString,
  killEvent,
  randomFloor,
  clearText,
  checkInput,
  arrayObject,
  arrayId,
  arrayMerge,
  arrayObjectIndexOf,
  addCommas,
  getRandomColor,
} from './utility.js';

describe('isValidString', () => {
  test('rejects non-string non-number input', () => {
    expect(isValidString(null, 'name')).toBe(false);
    expect(isValidString(undefined, 'name')).toBe(false);
    expect(isValidString({}, 'name')).toBe(false);
    expect(isValidString([], 'name')).toBe(false);
  });

  describe('type: name', () => {
    test('valid names', () => {
      expect(isValidString('hello', 'name')).toBeTruthy();
      expect(isValidString('foo bar', 'name')).toBeTruthy();
      expect(isValidString('名前テスト', 'name')).toBeTruthy();
      expect(isValidString('a>b:c', 'name')).toBeTruthy();
    });
    test('invalid names', () => {
      expect(isValidString('', 'name')).toBeFalsy();
      expect(isValidString('a\\b', 'name')).toBeFalsy();
      expect(isValidString('a/b', 'name')).toBeFalsy();
      expect(isValidString('a|b', 'name')).toBeFalsy();
      expect(isValidString('a*b', 'name')).toBeFalsy();
      expect(isValidString('a?b', 'name')).toBeFalsy();
      expect(isValidString('a"b', 'name')).toBeFalsy();
      expect(isValidString('a<b', 'name')).toBeFalsy();
    });
    test('max length 500', () => {
      expect(isValidString('a'.repeat(500), 'name')).toBeTruthy();
      expect(isValidString('a'.repeat(501), 'name')).toBeFalsy();
    });
  });

  describe('type: passwd', () => {
    test('valid passwords', () => {
      expect(isValidString('ab', 'passwd')).toBeTruthy();
      expect(isValidString('Password123!@#$%', 'passwd')).toBeTruthy();
      expect(isValidString('aB', 'passwd')).toBeTruthy();
    });
    test('invalid passwords', () => {
      expect(isValidString('a', 'passwd')).toBeFalsy();
      expect(isValidString('a'.repeat(31), 'passwd')).toBeFalsy();
      expect(isValidString('abc def', 'passwd')).toBeFalsy();
      expect(isValidString('abc^def', 'passwd')).toBeFalsy();
    });
  });

  describe('type: verify', () => {
    test('valid 4-digit codes', () => {
      expect(isValidString('1234', 'verify')).toBeTruthy();
      expect(isValidString('0000', 'verify')).toBeTruthy();
    });
    test('invalid codes', () => {
      expect(isValidString('123', 'verify')).toBeFalsy();
      expect(isValidString('12345', 'verify')).toBeFalsy();
      expect(isValidString('abcd', 'verify')).toBeFalsy();
    });
  });

  describe('type: altpwd', () => {
    test('valid alt passwords', () => {
      expect(isValidString('ab', 'altpwd')).toBeTruthy();
      expect(isValidString('a.b_c!@#$%;', 'altpwd')).toBeTruthy();
      expect(isValidString('中文密碼', 'altpwd')).toBeTruthy();
    });
    test('invalid alt passwords', () => {
      expect(isValidString('a', 'altpwd')).toBeFalsy();
      expect(isValidString('a'.repeat(31), 'altpwd')).toBeFalsy();
      expect(isValidString('a b', 'altpwd')).toBeFalsy();
    });
  });

  describe('type: desc', () => {
    test('valid descriptions', () => {
      expect(isValidString('hello world', 'desc')).toBeTruthy();
      expect(isValidString('', 'desc')).toBeTruthy();
      expect(isValidString('a[[link]]b', 'desc')).toBeTruthy();
    });
    test('invalid descriptions', () => {
      expect(isValidString('a\\b', 'desc')).toBeFalsy();
      expect(isValidString('a/b', 'desc')).toBeFalsy();
      expect(isValidString("a'b", 'desc')).toBeFalsy();
    });
  });

  describe('type: int', () => {
    test('valid positive integers', () => {
      expect(isValidString('1', 'int')).toBe(true);
      expect(isValidString('100', 'int')).toBe(true);
      expect(isValidString(42, 'int')).toBe(true);
    });
    test('invalid: zero or negative', () => {
      expect(isValidString('0', 'int')).toBe(false);
      expect(isValidString('-1', 'int')).toBe(false);
      expect(isValidString('abc', 'int')).toBe(false);
    });
  });

  describe('type: zeroint', () => {
    test('valid zero-inclusive integers', () => {
      expect(isValidString('0', 'zeroint')).toBe(true);
      expect(isValidString('5', 'zeroint')).toBe(true);
      expect(isValidString(0, 'zeroint')).toBe(true);
    });
    test('invalid', () => {
      expect(isValidString('-1', 'zeroint')).toBe(false);
      expect(isValidString('abc', 'zeroint')).toBe(false);
    });
  });

  describe('type: perm', () => {
    test('valid permissions (0-31)', () => {
      expect(isValidString(0, 'perm')).toBe(true);
      expect(isValidString('0', 'perm')).toBe(true);
      expect(isValidString('31', 'perm')).toBe(true);
    });
    test('invalid permissions', () => {
      expect(isValidString('32', 'perm')).toBe(false);
      expect(isValidString('-1', 'perm')).toBe(false);
      expect(isValidString('abc', 'perm')).toBe(false);
    });
  });

  describe('type: url', () => {
    test('valid URLs', () => {
      expect(isValidString('https://example.com', 'url')).toBeTruthy();
      expect(isValidString('http://example.com/path?q=1', 'url')).toBeTruthy();
      expect(isValidString('ftp://files.example.com', 'url')).toBeTruthy();
      expect(isValidString('magnet:?xt=urn:btih:abcdef1234567890abcdef1234567890abcdef12', 'url')).toBeTruthy();
    });
    test('invalid URLs', () => {
      expect(isValidString('not a url', 'url')).toBeFalsy();
      expect(isValidString('', 'url')).toBeFalsy();
    });
  });

  describe('type: email', () => {
    test('valid emails', () => {
      expect(isValidString('user@example.com', 'email')).toBeTruthy();
      expect(isValidString('a.b@c.co', 'email')).toBeTruthy();
    });
    test('invalid emails', () => {
      expect(isValidString('notanemail', 'email')).toBeFalsy();
      expect(isValidString('@example.com', 'email')).toBeFalsy();
    });
  });

  describe('type: number', () => {
    test('valid numbers', () => {
      expect(isValidString('123', 'number')).toBe(true);
      expect(isValidString('-5.5', 'number')).toBe(true);
      expect(isValidString(0, 'number')).toBe(true);
    });
    test('invalid', () => {
      expect(isValidString('abc', 'number')).toBe(false);
    });
    test('empty string is valid (Number("") === 0)', () => {
      expect(isValidString('', 'number')).toBe(true);
    });
  });

  test('unknown type returns false', () => {
    expect(isValidString('test', 'unknown_type')).toBe(false);
  });
});

describe('killEvent', () => {
  test('calls preventDefault, stopPropagation, and func', () => {
    const e = { preventDefault: jest.fn(), stopPropagation: jest.fn() };
    const func = jest.fn();
    killEvent(e, func);
    expect(e.preventDefault).toHaveBeenCalled();
    expect(e.stopPropagation).toHaveBeenCalled();
    expect(func).toHaveBeenCalled();
  });
});

describe('randomFloor', () => {
  test('returns integer within range', () => {
    for (let i = 0; i < 100; i++) {
      const result = randomFloor(5, 10);
      expect(result).toBeGreaterThanOrEqual(5);
      expect(result).toBeLessThanOrEqual(10);
      expect(Number.isInteger(result)).toBe(true);
    }
  });

  test('works with same min and max', () => {
    expect(randomFloor(7, 7)).toBe(7);
  });
});

describe('clearText', () => {
  test('replaces confusing characters', () => {
    expect(clearText('l')).toBe('<little L>');
    expect(clearText('I')).toBe('<big i>');
    expect(clearText('1')).toBe('<number 1>');
    expect(clearText('O')).toBe('<big o>');
    expect(clearText('0')).toBe('<number 0>');
  });

  test('only replaces first occurrence of each', () => {
    expect(clearText('ll')).toBe('<little L>l');
  });
});

describe('checkInput', () => {
  const addalert = jest.fn();

  beforeEach(() => addalert.mockClear());

  test('returns field when changed and valid (no confirm)', () => {
    const result = checkInput('username', { username: 'newval' }, addalert, 'oldval', 'name');
    expect(result).toEqual({ username: 'newval' });
  });

  test('returns false when value unchanged (no confirm)', () => {
    const result = checkInput('username', { username: 'same' }, addalert, 'same', 'name');
    expect(result).toBe(false);
  });

  test('alerts when changed but invalid (no confirm)', () => {
    const result = checkInput('username', { username: 'a\\b' }, addalert, 'old', 'name');
    expect(result).toBe(false);
    expect(addalert).toHaveBeenCalledWith('username not vaild!!!');
  });

  test('returns both fields when confirm matches and valid', () => {
    const result = checkInput('password', { password: 'abc123' }, addalert, 'abc123', 'passwd', 'confirm');
    expect(result).toEqual({ password: 'abc123', confirm: 'abc123' });
  });

  test('alerts when confirm does not match', () => {
    const result = checkInput('password', { password: 'abc' }, addalert, 'xyz', 'passwd', 'confirm');
    expect(result).toBe(false);
    expect(addalert).toHaveBeenCalledWith('password is not the same!!!');
  });

  test('returns false when confirm matches but value is empty', () => {
    const result = checkInput('password', { password: '' }, addalert, '', 'passwd', 'confirm');
    expect(result).toBe(false);
  });
});

describe('arrayObject', () => {
  test('push single item', () => {
    const map = new Map();
    const result = arrayObject('push', map, { id: '1', name: 'test' }, 'id');
    expect(result.get('1')).toEqual({ id: '1', name: 'test' });
  });

  test('push array of items', () => {
    const map = new Map();
    const items = [{ id: '1', name: 'a' }, { id: '2', name: 'b' }];
    const result = arrayObject('push', map, items, 'id');
    expect(result.size).toBe(2);
    expect(result.get('2').name).toBe('b');
  });

  test('push with rest transform', () => {
    const map = new Map();
    const rest = item => ({ ...item, extra: true });
    const result = arrayObject('push', map, { id: '1' }, 'id', rest);
    expect(result.get('1').extra).toBe(true);
  });

  test('pop removes item by key', () => {
    const map = new Map([['1', { id: '1' }], ['2', { id: '2' }]]);
    const result = arrayObject('pop', map, '1');
    expect(result.has('1')).toBe(false);
    expect(result.has('2')).toBe(true);
  });
});

describe('arrayId', () => {
  test('push single item id', () => {
    const set = new Set();
    const result = arrayId('push', set, { id: '1' }, 'id');
    expect(result.has('1')).toBe(true);
  });

  test('push array of item ids', () => {
    const set = new Set();
    const items = [{ id: '1' }, { id: '2' }];
    const result = arrayId('push', set, items, 'id');
    expect(result.size).toBe(2);
    expect(result.has('1')).toBe(true);
    expect(result.has('2')).toBe(true);
  });

  test('pop removes id', () => {
    const set = new Set(['1', '2', '3']);
    const result = arrayId('pop', set, '2');
    expect(result.has('2')).toBe(false);
    expect(result.size).toBe(2);
  });
});

describe('arrayMerge', () => {
  test('merges subset of ids from object map', () => {
    const ids = new Set(['1', '3']);
    const objs = new Map([['1', { a: 1 }], ['2', { a: 2 }], ['3', { a: 3 }]]);
    const result = arrayMerge(ids, objs);
    expect(result.size).toBe(2);
    expect(result.get('1')).toEqual({ a: 1 });
    expect(result.get('3')).toEqual({ a: 3 });
    expect(result.has('2')).toBe(false);
  });
});

describe('arrayObjectIndexOf', () => {
  test('finds index of matching item', () => {
    const arr = [{ name: 'a' }, { name: 'b' }, { name: 'c' }];
    expect(arrayObjectIndexOf(arr, 'b', 'name')).toBe('1');
  });

  test('returns -1 when not found', () => {
    const arr = [{ name: 'a' }];
    expect(arrayObjectIndexOf(arr, 'z', 'name')).toBe(-1);
  });
});

describe('addCommas', () => {
  test('formats integers with commas', () => {
    expect(addCommas(1000)).toBe('1,000');
    expect(addCommas(1000000)).toBe('1,000,000');
    expect(addCommas(123)).toBe('123');
  });

  test('preserves decimals', () => {
    expect(addCommas(1234.56)).toBe('1,234.56');
  });

  test('handles zero and negative', () => {
    expect(addCommas(0)).toBe('0');
    expect(addCommas(-1234)).toBe('-1,234');
  });

  test('handles string input', () => {
    expect(addCommas('9876543')).toBe('9,876,543');
  });
});

describe('getRandomColor', () => {
  test('without opacity returns rgba with opacity 1', () => {
    const color = getRandomColor();
    expect(color).toMatch(/^rgba\(\d+,\d+,\d+,1\)$/);
  });

  test('with opacity returns [bg, border] pair', () => {
    const [bg, border] = getRandomColor(0.5);
    expect(bg).toMatch(/^rgba\(\d+,\d+,\d+,0\.5\)$/);
    expect(border).toMatch(/^rgba\(\d+,\d+,\d+,1\)$/);
  });
});
