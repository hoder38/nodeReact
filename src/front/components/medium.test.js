import React from 'react';
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';

jest.mock('../utility.js', () => ({
  ...jest.requireActual('../utility.js'),
  api: jest.fn(),
  doLogin: jest.fn(),
  doLogout: jest.fn(),
  testLogin: jest.fn(),
  killEvent: jest.fn((e, cb) => { if (typeof cb === 'function') cb(); }),
  isValidString: jest.fn(),
  checkInput: jest.fn(),
  clearText: jest.fn(t => t),
  bookmarkItemList: jest.fn(),
}));

jest.mock('../configureStore.js', () => ({
  history: { push: jest.fn(), goBack: jest.fn() },
  default: jest.fn(() => ({})),
}));

jest.mock('./UserInput.js', () => {
  const React = require('react');
  function MockUserInput({ val, getinput, type, placeholder }) {
    return React.createElement('input', {
      type: type || 'text',
      placeholder: placeholder || '',
      value: val || '',
      onChange: getinput ? getinput.onchange : () => {},
      readOnly: false,
    });
  }
  MockUserInput.Input = class {
    constructor(names, submit, change) {
      this.names = names;
      this.submit = submit;
      this.change = change;
    }
    initValue(init = {}) {
      const obj = {};
      this.names.forEach(n => { obj[n] = init[n] !== undefined ? init[n] : ''; });
      return obj;
    }
    getValue() {
      const obj = {};
      this.names.forEach(n => { obj[n] = ''; });
      return obj;
    }
    getInput(target) {
      return {
        getRef: () => {},
        onenter: () => {},
        onchange: () => { if (this.change) this.change(); },
        className: 'form-control',
        style: {},
      };
    }
    initFocus() {}
  };
  return MockUserInput;
});

jest.mock('./Dropdown.js', () => {
  const React = require('react');
  return function MockDropdown({ droplist, children }) {
    return React.createElement('span', { className: 'mock-dropdown' },
      children,
      droplist && droplist.map(item =>
        React.createElement('button', {
          key: item.key,
          onClick: item.onclick,
          'data-testid': `drop-${item.key}`,
        }, item.title)
      )
    );
  };
});

jest.mock('../containers/ReAlertlist.js', () => {
  const React = require('react');
  return function MockReAlertlist() {
    return React.createElement('div', { 'data-testid': 'mock-alertlist' });
  };
});

jest.mock('../containers/RePasswordInfo.js', () => {
  const React = require('react');
  return function MockRePasswordInfo(props) {
    return React.createElement('div', {
      'data-testid': 'mock-password-info',
      onClick: props.onclose,
    }, 'PasswordInfo');
  };
});

import { api, killEvent, isValidString, doLogin, testLogin } from '../utility.js';
import { history } from '../configureStore.js';
import Login from './Login.js';
import GlobalPassword from './GlobalPassword.js';
import Tooltip from './Tooltip.js';
import ItemBitfinex from './ItemBitfinex.js';
import ItemStock from './ItemStock.js';
import ItemPassword from './ItemPassword.js';

const flushPromises = () => new Promise(r => setTimeout(r, 0));

const renderInTable = (el) => render(<table><tbody>{el}</tbody></table>);

// ─── Login ───────────────────────────────────────────────────────────────────

describe('Login', () => {
  let addalert;
  let logSpy;

  beforeEach(() => {
    addalert = jest.fn();
    logSpy = jest.spyOn(console, 'log').mockImplementation();
    jest.clearAllMocks();
  });

  afterEach(() => {
    logSpy.mockRestore();
  });

  test('renders login form', async () => {
    testLogin.mockRejectedValue('no');
    await act(async () => { render(<Login addalert={addalert} />); });
    expect(screen.getByText('Login')).toBeTruthy();
    expect(screen.getByText('Sign In')).toBeTruthy();
  });

  test('testLogin succeeds → pushes ROOT_PAGE', async () => {
    testLogin.mockResolvedValue();
    await act(async () => { render(<Login addalert={addalert} />); });
    expect(history.push).toHaveBeenCalledWith('/');
  });

  test('testLogin fails → logs error', async () => {
    testLogin.mockRejectedValue('test-err');
    await act(async () => { render(<Login addalert={addalert} />); });
    expect(logSpy).toHaveBeenCalledWith('test-err');
  });

  test('submit valid creds → doLogin succeeds → goBack', async () => {
    testLogin.mockRejectedValue('no');
    isValidString.mockReturnValue('ok');
    doLogin.mockResolvedValue();

    let container;
    await act(async () => {
      const r = render(<Login addalert={addalert} />);
      container = r.container;
    });
    const form = container.querySelector('form');
    await act(async () => { fireEvent.submit(form); });

    expect(doLogin).toHaveBeenCalledWith('', '');
    expect(history.goBack).toHaveBeenCalled();
  });

  test('submit valid creds → doLogin fails → addalert', async () => {
    testLogin.mockRejectedValue('no');
    isValidString.mockReturnValue('ok');
    doLogin.mockRejectedValue('login-fail');

    let container;
    await act(async () => {
      const r = render(<Login addalert={addalert} />);
      container = r.container;
    });
    await act(async () => { fireEvent.submit(container.querySelector('form')); });

    expect(addalert).toHaveBeenCalledWith('login-fail');
  });

  test('submit invalid creds (username falsy) → addalert', async () => {
    testLogin.mockRejectedValue('no');
    isValidString.mockReturnValue('');

    let container;
    await act(async () => {
      const r = render(<Login addalert={addalert} />);
      container = r.container;
    });
    await act(async () => { fireEvent.submit(container.querySelector('form')); });

    expect(addalert).toHaveBeenCalledWith('user name or password is not vaild!!!');
  });

  test('submit: username valid, passwd falsy → else branch', async () => {
    testLogin.mockRejectedValue('no');
    isValidString.mockImplementation((val, type) => {
      if (type === 'name') return 'ok';
      return '';
    });

    let container;
    await act(async () => {
      const r = render(<Login addalert={addalert} />);
      container = r.container;
    });
    await act(async () => { fireEvent.submit(container.querySelector('form')); });

    expect(addalert).toHaveBeenCalledWith('user name or password is not vaild!!!');
  });

  test('handles input change', async () => {
    testLogin.mockRejectedValue('no');
    await act(async () => { render(<Login addalert={addalert} />); });
    const input = screen.getByPlaceholderText('Username');
    fireEvent.change(input, { target: { value: 'x' } });
  });
});

// ─── GlobalPassword ──────────────────────────────────────────────────────────

describe('GlobalPassword', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
  });
  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
  });

  test('no delay → renders form', () => {
    const { container } = render(
      <GlobalPassword callback={jest.fn()} onclose={jest.fn()} />
    );
    expect(container.querySelector('form')).toBeTruthy();
    expect(container.querySelector('section')).toBeTruthy();
  });

  test('with delay (null initial) → renders form', () => {
    const { container } = render(
      <GlobalPassword delay="gp-null" callback={jest.fn()} onclose={jest.fn()} />
    );
    expect(container.querySelector('form')).toBeTruthy();
  });

  test('close button calls onclose', () => {
    const onclose = jest.fn();
    const { container } = render(
      <GlobalPassword callback={jest.fn()} onclose={onclose} />
    );
    fireEvent.click(container.querySelector('button[type="button"]'));
    expect(onclose).toHaveBeenCalled();
  });

  test('submit succeeds without delay → calls onclose, no timer', async () => {
    const callback = jest.fn().mockResolvedValue();
    const onclose = jest.fn();
    const { container } = render(
      <GlobalPassword callback={callback} onclose={onclose} />
    );
    await act(async () => { fireEvent.submit(container.querySelector('form')); });
    expect(callback).toHaveBeenCalledWith('');
    expect(onclose).toHaveBeenCalled();
  });

  test('submit succeeds with delay → sets goodboy + timeout, calls onclose', async () => {
    const callback = jest.fn().mockResolvedValue();
    const onclose = jest.fn();
    const { container } = render(
      <GlobalPassword delay="gp-succ" callback={callback} onclose={onclose} />
    );
    await act(async () => { fireEvent.submit(container.querySelector('form')); });
    expect(onclose).toHaveBeenCalled();
  });

  test('submit fails without delay → reinits input, no onclose', async () => {
    const callback = jest.fn().mockRejectedValue('err');
    const onclose = jest.fn();
    const { container } = render(
      <GlobalPassword callback={callback} onclose={onclose} />
    );
    await act(async () => { fireEvent.submit(container.querySelector('form')); });
    expect(onclose).not.toHaveBeenCalled();
  });

  test('submit fails with delay → clears password + timer', async () => {
    const callback = jest.fn().mockRejectedValue('err');
    const onclose = jest.fn();
    const { container } = render(
      <GlobalPassword delay="gp-fail" callback={callback} onclose={onclose} />
    );
    await act(async () => { fireEvent.submit(container.querySelector('form')); });
    expect(onclose).not.toHaveBeenCalled();
  });

  test('render with goodboy set → calls callback with goodboy, returns null', async () => {
    // Step 1: set goodboy by submitting successfully
    const cb1 = jest.fn().mockResolvedValue();
    const oc1 = jest.fn();
    const { container: c1, unmount: u1 } = render(
      <GlobalPassword delay="gp-gb1" callback={cb1} onclose={oc1} />
    );
    await act(async () => { fireEvent.submit(c1.querySelector('form')); });
    expect(oc1).toHaveBeenCalled();
    u1();

    // Step 2: render again with same key → else path
    const cb2 = jest.fn().mockResolvedValue();
    const oc2 = jest.fn();
    let container2;
    await act(async () => {
      const r = render(<GlobalPassword delay="gp-gb1" callback={cb2} onclose={oc2} />);
      container2 = r.container;
    });
    expect(cb2).toHaveBeenCalledWith('goodboy');
    expect(oc2).toHaveBeenCalled();
    expect(container2.querySelector('form')).toBeNull();
  });

  test('goodboy path callback fails → clears password + timer', async () => {
    // Step 1: set goodboy
    const cb1 = jest.fn().mockResolvedValue();
    const oc1 = jest.fn();
    const { container: c1, unmount: u1 } = render(
      <GlobalPassword delay="gp-gb2" callback={cb1} onclose={oc1} />
    );
    await act(async () => { fireEvent.submit(c1.querySelector('form')); });
    u1();

    // Step 2: render with callback that fails
    const cb2 = jest.fn().mockRejectedValue('fail');
    const oc2 = jest.fn();
    await act(async () => {
      render(<GlobalPassword delay="gp-gb2" callback={cb2} onclose={oc2} />);
    });
    expect(cb2).toHaveBeenCalledWith('goodboy');
    expect(oc2).not.toHaveBeenCalled();
  });

  test('AUTH_TIME timeout resets goodboy', async () => {
    const cb1 = jest.fn().mockResolvedValue();
    const oc1 = jest.fn();
    const { container: c1, unmount: u1 } = render(
      <GlobalPassword delay="gp-timer" callback={cb1} onclose={oc1} />
    );
    await act(async () => { fireEvent.submit(c1.querySelector('form')); });
    u1();

    // Advance past AUTH_TIME (60000ms)
    act(() => { jest.advanceTimersByTime(60000); });

    // Render again - goodboy should be cleared, form should render
    const cb2 = jest.fn();
    const oc2 = jest.fn();
    const { container: c2 } = render(
      <GlobalPassword delay="gp-timer" callback={cb2} onclose={oc2} />
    );
    expect(c2.querySelector('form')).toBeTruthy();
  });

  test('handles input change', () => {
    render(<GlobalPassword callback={jest.fn()} onclose={jest.fn()} />);
    const input = screen.getByPlaceholderText('Password');
    fireEvent.change(input, { target: { value: 'pw' } });
  });
});

// ─── Tooltip ─────────────────────────────────────────────────────────────────

describe('Tooltip', () => {
  const renderTooltip = (place) => {
    const { container } = render(
      <div data-testid="parent">
        <Tooltip place={place} tip="test-tip" style={{ color: 'red' }} />
      </div>
    );
    return { container, parent: screen.getByTestId('parent') };
  };

  test('renders with place=right (default case)', () => {
    const { container } = renderTooltip('right');
    expect(container.querySelector('.tooltip.in.right')).toBeTruthy();
    expect(screen.getByText('test-tip')).toBeTruthy();
  });

  test('renders with place=top', () => {
    const { container } = renderTooltip('top');
    expect(container.querySelector('.tooltip.in.top')).toBeTruthy();
  });

  test('renders with place=left', () => {
    const { container } = renderTooltip('left');
    expect(container.querySelector('.tooltip.in.left')).toBeTruthy();
  });

  test('mouseenter → shows tooltip (right/default), sets positioning', () => {
    const { container, parent } = renderTooltip('right');
    fireEvent.mouseEnter(parent);
    const tip = container.querySelector('.tooltip');
    expect(tip.style.visibility).not.toBe('hidden');
  });

  test('mouseenter → shows tooltip (top), sets positioning', () => {
    const { container, parent } = renderTooltip('top');
    fireEvent.mouseEnter(parent);
    const tip = container.querySelector('.tooltip');
    expect(tip.style.visibility).not.toBe('hidden');
  });

  test('mouseenter → shows tooltip (left), sets positioning', () => {
    const { container, parent } = renderTooltip('left');
    fireEvent.mouseEnter(parent);
    const tip = container.querySelector('.tooltip');
    expect(tip.style.visibility).not.toBe('hidden');
  });

  test('mouseleave → hides tooltip', () => {
    const { container, parent } = renderTooltip('right');
    fireEvent.mouseEnter(parent);
    fireEvent.mouseLeave(parent);
    const tip = container.querySelector('.tooltip');
    expect(tip.style.visibility).toBe('hidden');
  });

  test('second mouseenter (showed cache path) → skips recalculation', () => {
    const { container, parent } = renderTooltip('right');
    // First mouseenter: _showed=false, show→true → enters body, sets _showed=true
    fireEvent.mouseEnter(parent);
    // Second mouseenter: _showed=true, show=true → !true||!true → false → skips body
    fireEvent.mouseEnter(parent);
    const tip = container.querySelector('.tooltip');
    expect(tip).toBeTruthy();
  });

  test('mouseenter then mouseleave then mouseenter → full cycle', () => {
    const { container, parent } = renderTooltip('top');
    fireEvent.mouseEnter(parent);
    fireEvent.mouseLeave(parent);
    fireEvent.mouseEnter(parent);
    expect(container.querySelector('.tooltip')).toBeTruthy();
  });

  test('unmount removes event listeners', () => {
    const { unmount } = render(
      <div data-testid="unmount-parent">
        <Tooltip place="right" tip="tip2" />
      </div>
    );
    const parent = screen.getByTestId('unmount-parent');
    const spy = jest.spyOn(parent, 'removeEventListener');
    unmount();
    expect(spy).toHaveBeenCalledWith('mouseenter', expect.any(Function));
    expect(spy).toHaveBeenCalledWith('mouseleave', expect.any(Function));
    spy.mockRestore();
  });
});

// ─── ItemBitfinex ────────────────────────────────────────────────────────────

describe('ItemBitfinex', () => {
  const baseItem = {
    id: 'bf1',
    name: 'TestItem',
    rate: '0.05',
    utime: '2024-01-01',
    type: 0,
    taken: false,
    boost: false,
    str: '',
    str2: '',
  };
  const baseProps = {
    check: false,
    getRef: jest.fn(),
    onchange: jest.fn(),
    sendglbcf: jest.fn(cb => cb()),
    mainUrl: 'http://localhost',
    addalert: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('type=1 → info class', () => {
    const { container } = renderInTable(
      <ItemBitfinex {...baseProps} item={{ ...baseItem, type: 1 }} />
    );
    expect(container.querySelector('tr').className).toBe('info');
  });

  test('type=2 → danger class', () => {
    const { container } = renderInTable(
      <ItemBitfinex {...baseProps} item={{ ...baseItem, type: 2 }} />
    );
    expect(container.querySelector('tr').className).toBe('danger');
  });

  test('type=3 → warning class', () => {
    const { container } = renderInTable(
      <ItemBitfinex {...baseProps} item={{ ...baseItem, type: 3 }} />
    );
    expect(container.querySelector('tr').className).toBe('warning');
  });

  test('type=4 → success class', () => {
    const { container } = renderInTable(
      <ItemBitfinex {...baseProps} item={{ ...baseItem, type: 4 }} />
    );
    expect(container.querySelector('tr').className).toBe('success');
  });

  test('type=0 (default) → empty class', () => {
    const { container } = renderInTable(
      <ItemBitfinex {...baseProps} item={{ ...baseItem, type: 0 }} />
    );
    expect(container.querySelector('tr').className).toBe('');
  });

  test('taken=true → recycled class', () => {
    const { container } = renderInTable(
      <ItemBitfinex {...baseProps} item={{ ...baseItem, type: 1, taken: true }} />
    );
    expect(container.querySelector('tr').className).toBe('info recycled');
  });

  test('boost=true, taken=false → external class', () => {
    const { container } = renderInTable(
      <ItemBitfinex {...baseProps} item={{ ...baseItem, type: 2, boost: true }} />
    );
    expect(container.querySelector('tr').className).toBe('danger external');
  });

  test('neither taken nor boost → no suffix', () => {
    const { container } = renderInTable(
      <ItemBitfinex {...baseProps} item={{ ...baseItem, type: 3 }} />
    );
    expect(container.querySelector('tr').className).toBe('warning');
  });

  test('item.str present → renders Dropdown with str/str2', () => {
    const { container } = renderInTable(
      <ItemBitfinex {...baseProps} item={{ ...baseItem, str: 'hello', str2: 'world' }} />
    );
    expect(screen.getByText('hello')).toBeTruthy();
    expect(screen.getByText('world')).toBeTruthy();
  });

  test('item.str absent → renders plain button', () => {
    const { container } = renderInTable(
      <ItemBitfinex {...baseProps} item={{ ...baseItem, str: '' }} />
    );
    const carets = container.querySelectorAll('.caret');
    expect(carets.length).toBeGreaterThan(0);
  });

  test('taken=true click → sendglbcf, api succeeds', async () => {
    api.mockResolvedValue({});
    const props = { ...baseProps, sendglbcf: jest.fn(cb => cb()) };
    const { container } = renderInTable(
      <ItemBitfinex {...props} item={{ ...baseItem, taken: true }} />
    );
    const tds = container.querySelectorAll('td');
    const nameTd = tds[1];
    await act(async () => { fireEvent.click(nameTd); });
    expect(props.sendglbcf).toHaveBeenCalled();
    expect(api).toHaveBeenCalledWith('http://localhost/api/bitfinex/bot/close/bf1');
  });

  test('taken=true click → api fails → addalert', async () => {
    api.mockRejectedValue('api-err');
    const props = { ...baseProps, sendglbcf: jest.fn(cb => cb()), addalert: jest.fn() };
    const { container } = renderInTable(
      <ItemBitfinex {...props} item={{ ...baseItem, taken: true }} />
    );
    const tds = container.querySelectorAll('td');
    await act(async () => { fireEvent.click(tds[1]); });
    expect(props.addalert).toHaveBeenCalledWith('api-err');
  });

  test('taken=false click → noop (no sendglbcf)', () => {
    const props = { ...baseProps, sendglbcf: jest.fn() };
    const { container } = renderInTable(
      <ItemBitfinex {...props} item={{ ...baseItem, taken: false }} />
    );
    const tds = container.querySelectorAll('td');
    fireEvent.click(tds[1]);
    expect(props.sendglbcf).not.toHaveBeenCalled();
  });

  test('checkbox renders with check prop and calls onchange', () => {
    const onchange = jest.fn();
    const { container } = renderInTable(
      <ItemBitfinex {...baseProps} item={baseItem} check={true} onchange={onchange} />
    );
    const cb = container.querySelector('input[type="checkbox"]');
    expect(cb.checked).toBe(true);
    fireEvent.click(cb);
    expect(onchange).toHaveBeenCalled();
  });
});

// ─── ItemStock ───────────────────────────────────────────────────────────────

describe('ItemStock', () => {
  const baseItem = {
    id: 'st1',
    name: 'AAPL',
    type: 'US',
    index: '0050',
    profit: '10%',
    safety: 'A',
    management: 'B',
  };
  const baseProps = {
    item: baseItem,
    check: false,
    getRef: jest.fn(),
    onchange: jest.fn(),
    latest: '',
    bookmark: 'bk1',
    setLatest: jest.fn(),
    globalinput: jest.fn(),
    addalert: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('renders with latest matching → info class', () => {
    const { container } = renderInTable(
      <ItemStock {...baseProps} latest="st1" />
    );
    expect(container.querySelector('tr').className).toBe('info');
  });

  test('renders with latest not matching → empty class', () => {
    const { container } = renderInTable(
      <ItemStock {...baseProps} latest="other" />
    );
    expect(container.querySelector('tr').className).toBe('');
  });

  test('renders item fields', () => {
    renderInTable(<ItemStock {...baseProps} />);
    expect(screen.getByText(/AAPL/)).toBeTruthy();
    expect(screen.getByText('10%')).toBeTruthy();
    expect(screen.getByText('A')).toBeTruthy();
    expect(screen.getByText('B')).toBeTruthy();
  });

  test('PER dropdown → api succeeds → setLatest + globalinput', async () => {
    api.mockResolvedValue({ per: '15.3' });
    const props = { ...baseProps, setLatest: jest.fn(), globalinput: jest.fn() };
    renderInTable(<ItemStock {...props} />);
    await act(async () => { fireEvent.click(screen.getByTestId('drop-0')); });
    expect(api).toHaveBeenCalledWith('/api/stock/getPER/st1');
    expect(props.setLatest).toHaveBeenCalledWith('st1', 'bk1');
    expect(props.globalinput).toHaveBeenCalledWith(4, expect.any(Function), 'warning', 'Parse Index', '15.3');
  });

  test('PER dropdown → api fails → addalert', async () => {
    api.mockRejectedValue('per-err');
    const props = { ...baseProps, addalert: jest.fn() };
    renderInTable(<ItemStock {...props} />);
    await act(async () => { fireEvent.click(screen.getByTestId('drop-0')); });
    expect(props.addalert).toHaveBeenCalledWith('per-err');
  });

  test('INTERVAL dropdown → api succeeds → setLatest + globalinput', async () => {
    api.mockResolvedValue({ interval: '4.2' });
    const props = { ...baseProps, setLatest: jest.fn(), globalinput: jest.fn() };
    renderInTable(<ItemStock {...props} />);
    await act(async () => { fireEvent.click(screen.getByTestId('drop-2')); });
    expect(api).toHaveBeenCalledWith('/api/stock/getInterval/st1');
    expect(props.setLatest).toHaveBeenCalledWith('st1', 'bk1');
    expect(props.globalinput).toHaveBeenCalledWith(4, expect.any(Function), 'warning', 'Parse Index', '4.2');
  });

  test('INTERVAL dropdown → api fails → addalert', async () => {
    api.mockRejectedValue('int-err');
    const props = { ...baseProps, addalert: jest.fn() };
    renderInTable(<ItemStock {...props} />);
    await act(async () => { fireEvent.click(screen.getByTestId('drop-2')); });
    expect(props.addalert).toHaveBeenCalledWith('int-err');
  });

  test('checkbox renders and calls onchange', () => {
    const onchange = jest.fn();
    const { container } = renderInTable(
      <ItemStock {...baseProps} check={true} onchange={onchange} />
    );
    const cb = container.querySelector('input[type="checkbox"]');
    expect(cb.checked).toBe(true);
    fireEvent.click(cb);
    expect(onchange).toHaveBeenCalled();
  });
});

// ─── ItemPassword ────────────────────────────────────────────────────────────

describe('ItemPassword', () => {
  let mockOpen;

  const baseItem = {
    id: 'pw1',
    name: 'MySite',
    username: 'user1',
    utime: '2024-01-01',
    important: false,
    url: '',
    email: '',
  };
  const baseProps = {
    item: baseItem,
    check: false,
    getRef: jest.fn(),
    onchange: jest.fn(),
    latest: '',
    bookmark: 'bk1',
    addalert: jest.fn(),
    sendglbcf: jest.fn(cb => cb()),
    sendglbpw: jest.fn(cb => cb('testpw')),
    setLatest: jest.fn(),
    globalinput: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockOpen = jest.fn();
    window.open = mockOpen;
  });

  // ── render branches ──

  test('renders with important=true → recycled class', () => {
    const { container } = renderInTable(
      <ItemPassword {...baseProps} item={{ ...baseItem, important: true }} />
    );
    expect(container.querySelector('tr').className).toContain('recycled');
  });

  test('renders with important=false → no recycled class', () => {
    const { container } = renderInTable(
      <ItemPassword {...baseProps} item={baseItem} />
    );
    expect(container.querySelector('tr').className).not.toContain('recycled');
  });

  test('latest matches → info class', () => {
    const { container } = renderInTable(
      <ItemPassword {...baseProps} latest="pw1" item={baseItem} />
    );
    expect(container.querySelector('tr').className).toContain('info');
  });

  test('latest does not match → no info class', () => {
    const { container } = renderInTable(
      <ItemPassword {...baseProps} latest="other" item={baseItem} />
    );
    expect(container.querySelector('tr').className).not.toContain('info');
  });

  test('item.url present → Goto Url in dropdown', () => {
    renderInTable(
      <ItemPassword {...baseProps} item={{ ...baseItem, url: 'http://site.com' }} />
    );
    expect(screen.getByText('Goto Url')).toBeTruthy();
  });

  test('item.url absent → no Goto Url', () => {
    renderInTable(<ItemPassword {...baseProps} item={{ ...baseItem, url: '' }} />);
    expect(screen.queryByText('Goto Url')).toBeNull();
  });

  test('item.email present → Goto Email in dropdown', () => {
    renderInTable(
      <ItemPassword {...baseProps} item={{ ...baseItem, email: 'a@b.com' }} />
    );
    expect(screen.getByText('Goto Email')).toBeTruthy();
  });

  test('item.email absent → no Goto Email', () => {
    renderInTable(<ItemPassword {...baseProps} item={{ ...baseItem, email: '' }} />);
    expect(screen.queryByText('Goto Email')).toBeNull();
  });

  // ── Details / edit ──

  test('Details click → shows RePasswordInfo, close hides it', () => {
    const { container } = renderInTable(
      <ItemPassword {...baseProps} item={{ ...baseItem, url: 'http://x.com', email: 'a@b.com' }} />
    );
    expect(screen.queryByTestId('mock-password-info')).toBeNull();
    fireEvent.click(screen.getByTestId('drop-0')); // Details
    expect(screen.getByTestId('mock-password-info')).toBeTruthy();
    // Click mock-password-info triggers onclose
    fireEvent.click(screen.getByTestId('mock-password-info'));
    expect(screen.queryByTestId('mock-password-info')).toBeNull();
  });

  // ── _gotoUrl ──

  test('_gotoUrl valid url → window.open', () => {
    isValidString.mockReturnValue('');
    renderInTable(
      <ItemPassword {...baseProps} item={{ ...baseItem, url: 'http%3A%2F%2Fsite.com' }} />
    );
    fireEvent.click(screen.getByText('Goto Url'));
    expect(mockOpen).toHaveBeenCalledWith('http://site.com');
  });

  test('_gotoUrl invalid url → addalert', () => {
    isValidString.mockReturnValue('error');
    const props = { ...baseProps, addalert: jest.fn() };
    renderInTable(
      <ItemPassword {...props} item={{ ...baseItem, url: 'bad' }} />
    );
    fireEvent.click(screen.getByText('Goto Url'));
    expect(props.addalert).toHaveBeenCalledWith('url is not vaild!!!');
  });

  // ── _gotoEmail ──

  test('_gotoEmail: isValidString falsy (valid email) → addalert', () => {
    isValidString.mockReturnValue('');
    const props = { ...baseProps, addalert: jest.fn() };
    renderInTable(
      <ItemPassword {...props} item={{ ...baseItem, email: 'u@gmail.com' }} />
    );
    fireEvent.click(screen.getByText('Goto Email'));
    expect(props.addalert).toHaveBeenCalledWith('email is not vaild!!!');
  });

  test('_gotoEmail gmail → window.open gmail', () => {
    isValidString.mockReturnValue('ok');
    renderInTable(
      <ItemPassword {...baseProps} item={{ ...baseItem, email: 'u@gmail.com' }} />
    );
    fireEvent.click(screen.getByText('Goto Email'));
    expect(mockOpen).toHaveBeenCalledWith('https://mail.google.com/');
  });

  test('_gotoEmail gmail with country suffix → window.open gmail', () => {
    isValidString.mockReturnValue('ok');
    renderInTable(
      <ItemPassword {...baseProps} item={{ ...baseItem, email: 'u@gmail.com.tw' }} />
    );
    fireEvent.click(screen.getByText('Goto Email'));
    expect(mockOpen).toHaveBeenCalledWith('https://mail.google.com/');
  });

  test('_gotoEmail yahoo → window.open yahoo', () => {
    isValidString.mockReturnValue('ok');
    renderInTable(
      <ItemPassword {...baseProps} item={{ ...baseItem, email: 'u@yahoo.com' }} />
    );
    fireEvent.click(screen.getByText('Goto Email'));
    expect(mockOpen).toHaveBeenCalledWith('https://login.yahoo.com/config/mail?');
  });

  test('_gotoEmail hotmail → window.open live', () => {
    isValidString.mockReturnValue('ok');
    renderInTable(
      <ItemPassword {...baseProps} item={{ ...baseItem, email: 'u@hotmail.com' }} />
    );
    fireEvent.click(screen.getByText('Goto Email'));
    expect(mockOpen).toHaveBeenCalledWith('https://www.live.com/');
  });

  test('_gotoEmail msn → window.open live', () => {
    isValidString.mockReturnValue('ok');
    renderInTable(
      <ItemPassword {...baseProps} item={{ ...baseItem, email: 'u@msn.com' }} />
    );
    fireEvent.click(screen.getByText('Goto Email'));
    expect(mockOpen).toHaveBeenCalledWith('https://www.live.com/');
  });

  test('_gotoEmail live → window.open live', () => {
    isValidString.mockReturnValue('ok');
    renderInTable(
      <ItemPassword {...baseProps} item={{ ...baseItem, email: 'u@live.com' }} />
    );
    fireEvent.click(screen.getByText('Goto Email'));
    expect(mockOpen).toHaveBeenCalledWith('https://www.live.com/');
  });

  test('_gotoEmail unknown provider → addalert', () => {
    isValidString.mockReturnValue('ok');
    const props = { ...baseProps, addalert: jest.fn() };
    renderInTable(
      <ItemPassword {...props} item={{ ...baseItem, email: 'u@other.com' }} />
    );
    fireEvent.click(screen.getByText('Goto Email'));
    expect(props.addalert).toHaveBeenCalledWith('目前沒有此email類型請自行前往');
  });

  // ── _getUsername ──

  test('click username → globalinput called', () => {
    const props = { ...baseProps, globalinput: jest.fn() };
    const { container } = renderInTable(
      <ItemPassword {...props} item={{ ...baseItem, username: 'myuser' }} />
    );
    const links = container.querySelectorAll('a.item-point');
    fireEvent.click(links[1]); // second link is username
    expect(props.globalinput).toHaveBeenCalledWith(3, expect.any(Function), 'info', 'New Username...', 'myuser');
  });

  // ── _getPassword (not important) ──

  test('click name (not important) → api succeeds → setLatest + globalinput', async () => {
    api.mockResolvedValue({ password: 'secret' });
    const props = { ...baseProps, setLatest: jest.fn(), globalinput: jest.fn() };
    const { container } = renderInTable(
      <ItemPassword {...props} item={{ ...baseItem, important: false }} />
    );
    const links = container.querySelectorAll('a.item-point');
    await act(async () => { fireEvent.click(links[0]); });
    expect(api).toHaveBeenCalledWith('/api/password/getPW/pw1', {}, 'PUT');
    expect(props.setLatest).toHaveBeenCalledWith('pw1', 'bk1');
    expect(props.globalinput).toHaveBeenCalledWith(3, expect.any(Function), 'warning', 'New Password...', 'secret', true);
  });

  test('click name (not important) → api fails → addalert', async () => {
    api.mockRejectedValue('pw-err');
    const props = { ...baseProps, addalert: jest.fn() };
    const { container } = renderInTable(
      <ItemPassword {...props} item={{ ...baseItem, important: false }} />
    );
    const links = container.querySelectorAll('a.item-point');
    await act(async () => { fireEvent.click(links[0]); });
    expect(props.addalert).toHaveBeenCalledWith('pw-err');
  });

  // ── _getPassword (important) ──

  test('click name (important) → isValidString truthy → api succeeds', async () => {
    isValidString.mockReturnValue('ok');
    api.mockResolvedValue({ password: 'imp-secret' });
    const props = {
      ...baseProps,
      setLatest: jest.fn(),
      globalinput: jest.fn(),
      sendglbpw: jest.fn(cb => cb('testpw')),
    };
    const { container } = renderInTable(
      <ItemPassword {...props} item={{ ...baseItem, important: true }} />
    );
    const links = container.querySelectorAll('a.item-point');
    await act(async () => { fireEvent.click(links[0]); });
    expect(props.sendglbpw).toHaveBeenCalled();
    expect(api).toHaveBeenCalledWith('/api/password/getPW/pw1', { userPW: 'testpw' }, 'PUT');
    expect(props.setLatest).toHaveBeenCalledWith('pw1', 'bk1');
    expect(props.globalinput).toHaveBeenCalledWith(3, expect.any(Function), 'warning', 'New Password...', 'imp-secret', true);
  });

  test('click name (important) → isValidString truthy → api fails → addalert + throw', async () => {
    isValidString.mockReturnValue('ok');
    api.mockRejectedValue('imp-err');
    const props = {
      ...baseProps,
      addalert: jest.fn(),
      sendglbpw: jest.fn(cb => {
        const r = cb('testpw');
        if (r && typeof r.catch === 'function') r.catch(() => {});
      }),
    };
    const { container } = renderInTable(
      <ItemPassword {...props} item={{ ...baseItem, important: true }} />
    );
    const links = container.querySelectorAll('a.item-point');
    await act(async () => { fireEvent.click(links[0]); });
    expect(props.addalert).toHaveBeenCalledWith('imp-err');
  });

  test('click name (important) → isValidString falsy → addalert + reject', async () => {
    isValidString.mockReturnValue('');
    const props = {
      ...baseProps,
      addalert: jest.fn(),
      sendglbpw: jest.fn(cb => {
        const r = cb('testpw');
        if (r && typeof r.catch === 'function') r.catch(() => {});
      }),
    };
    const { container } = renderInTable(
      <ItemPassword {...props} item={{ ...baseItem, important: true }} />
    );
    const links = container.querySelectorAll('a.item-point');
    await act(async () => { fireEvent.click(links[0]); });
    expect(props.addalert).toHaveBeenCalledWith('User password not vaild!!!');
  });

  // ── _delPassword (not important) ──

  test('Delete (not important) → api succeeds', async () => {
    api.mockResolvedValue({});
    const props = { ...baseProps, sendglbcf: jest.fn(cb => cb()) };
    renderInTable(
      <ItemPassword {...props} item={{ ...baseItem, important: false }} />
    );
    await act(async () => { fireEvent.click(screen.getByTestId('drop-1')); });
    expect(props.sendglbcf).toHaveBeenCalledWith(expect.any(Function), 'Would you sure to delete MySite ?');
    expect(api).toHaveBeenCalledWith('/api/password/delRow/pw1', {}, 'PUT');
  });

  test('Delete (not important) → api fails → addalert', async () => {
    api.mockRejectedValue('del-err');
    const props = { ...baseProps, sendglbcf: jest.fn(cb => cb()), addalert: jest.fn() };
    renderInTable(
      <ItemPassword {...props} item={{ ...baseItem, important: false }} />
    );
    await act(async () => { fireEvent.click(screen.getByTestId('drop-1')); });
    expect(props.addalert).toHaveBeenCalledWith('del-err');
  });

  // ── _delPassword (important) ──

  test('Delete (important) → isValidString truthy → api succeeds', async () => {
    isValidString.mockReturnValue('ok');
    api.mockResolvedValue({});
    const props = {
      ...baseProps,
      sendglbcf: jest.fn(cb => cb()),
      sendglbpw: jest.fn(cb => cb('testpw')),
    };
    renderInTable(
      <ItemPassword {...props} item={{ ...baseItem, important: true }} />
    );
    await act(async () => { fireEvent.click(screen.getByTestId('drop-1')); });
    expect(props.sendglbpw).toHaveBeenCalled();
    expect(api).toHaveBeenCalledWith('/api/password/delRow/pw1', { userPW: 'testpw' }, 'PUT');
  });

  test('Delete (important) → isValidString truthy → api fails → addalert + throw', async () => {
    isValidString.mockReturnValue('ok');
    api.mockRejectedValue('del-imp-err');
    const props = {
      ...baseProps,
      sendglbcf: jest.fn(cb => {
        const r = cb();
        if (r && typeof r.catch === 'function') r.catch(() => {});
      }),
      sendglbpw: jest.fn(cb => {
        const r = cb('testpw');
        if (r && typeof r.catch === 'function') r.catch(() => {});
      }),
      addalert: jest.fn(),
    };
    renderInTable(
      <ItemPassword {...props} item={{ ...baseItem, important: true }} />
    );
    await act(async () => { fireEvent.click(screen.getByTestId('drop-1')); });
    expect(props.addalert).toHaveBeenCalledWith('del-imp-err');
  });

  test('Delete (important) → isValidString falsy → addalert + reject', async () => {
    isValidString.mockReturnValue('');
    const props = {
      ...baseProps,
      sendglbcf: jest.fn(cb => {
        const r = cb();
        if (r && typeof r.catch === 'function') r.catch(() => {});
      }),
      sendglbpw: jest.fn(cb => {
        const r = cb('testpw');
        if (r && typeof r.catch === 'function') r.catch(() => {});
      }),
      addalert: jest.fn(),
    };
    renderInTable(
      <ItemPassword {...props} item={{ ...baseItem, important: true }} />
    );
    await act(async () => { fireEvent.click(screen.getByTestId('drop-1')); });
    expect(props.addalert).toHaveBeenCalledWith('User password not vaild!!!');
  });

  // ── checkbox ──

  test('checkbox renders and calls onchange', () => {
    const onchange = jest.fn();
    const { container } = renderInTable(
      <ItemPassword {...baseProps} check={true} onchange={onchange} />
    );
    const cb = container.querySelector('input[type="checkbox"]');
    expect(cb.checked).toBe(true);
    fireEvent.click(cb);
    expect(onchange).toHaveBeenCalled();
  });

  // ── important + latest combined ──

  test('important=true + latest matches → recycled info class', () => {
    const { container } = renderInTable(
      <ItemPassword {...baseProps} latest="pw1" item={{ ...baseItem, important: true }} />
    );
    const cls = container.querySelector('tr').className;
    expect(cls).toContain('recycled');
    expect(cls).toContain('info');
  });
});
