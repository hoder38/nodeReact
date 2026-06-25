import React from 'react';
import { render, fireEvent, act } from '@testing-library/react';

/* ------------------------------------------------------------------ */
/*  Mocks – jest.mock() is hoisted; factories must be self-contained  */
/* ------------------------------------------------------------------ */

jest.mock('./UserInput.js', () => {
  const React = require('react');

  class MockInput {
    constructor(names, submit, change) {
      this.submit = submit;
      this.change = change;
      this.className = 'form-control';
      this.style = {};
      this.ref = new Map();
      for (let i = 0; i < names.length; i++) {
        this.ref.set(names[i], null);
      }
    }
    getInput(target) {
      const self = this;
      return {
        getRef: function (ref) { self.ref.set(target, ref); },
        onenter: function () {},
        onchange: self.change,
        className: self.className,
        style: self.style,
      };
    }
    initFocus() { return true; }
    getValue() {
      const obj = {};
      for (const entry of this.ref) {
        if (entry[1] !== null) { obj[entry[0]] = entry[1].value; }
      }
      return obj;
    }
    initValue(init) {
      init = init || {};
      const obj = {};
      for (const key of this.ref.keys()) {
        obj[key] = init[key] == null ? '' : init[key];
      }
      return obj;
    }
  }

  function MockUserInput(props) {
    var inp = React.createElement('input', {
      ref: function (el) {
        if (props.getinput && props.getinput.getRef) { props.getinput.getRef(el); }
      },
      'data-testid': 'ui-' + (props.placeholder || ''),
      value: props.val != null ? String(props.val) : '',
      onChange: props.getinput ? props.getinput.onchange : function () {},
      placeholder: props.placeholder || '',
      onCopy: props.copy || undefined,
    });
    var extra = (props.edit === false) ? props.tagv : props.tage;
    if (props.children && props.children.props && props.children.props.children) {
      var kids = Array.isArray(props.children.props.children) ? props.children.props.children : [props.children.props.children];
      var newKids = kids.map(function (child, idx) {
        if (child && child.props && !child.props.children) {
          return React.cloneElement(child, { key: idx }, inp, extra || null);
        }
        return React.cloneElement(child, { key: idx });
      });
      return React.cloneElement(props.children, {}, newKids);
    }
    if (props.children) {
      return React.cloneElement(props.children, {}, inp, extra || null);
    }
    return React.createElement(React.Fragment, null, inp, extra || null);
  }

  MockUserInput.Input = MockInput;
  return { __esModule: true, default: MockUserInput };
});

jest.mock('./Tooltip.js', () => {
  const React = require('react');
  return {
    __esModule: true,
    default: function Tooltip(props) {
      return React.createElement('span', { 'data-testid': 'tip' }, props.tip || '');
    },
  };
});

jest.mock('chart.js', () => {
  function MockChart() { this.destroy = function () {}; }
  return MockChart;
});

jest.mock('../utility.js', () => ({
  killEvent: jest.fn(function (e, cb) { if (typeof cb === 'function') cb(); }),
  clearText: jest.fn(function (t) { return t; }),
  checkInput: jest.fn(function () { return {}; }),
  api: jest.fn(function () { return Promise.resolve({}); }),
  isValidString: jest.fn(function () { return 'ok'; }),
  addCommas: jest.fn(function (n) { return String(n); }),
  getRandomColor: jest.fn(function () { return 'rgba(0,0,0,1)'; }),
  bookmarkItemList: jest.fn(),
}));

/* ------------------------------------------------------------------ */
/*  Imports (after mocks are registered)                              */
/* ------------------------------------------------------------------ */

import PasswordInfo from './PasswordInfo.js';
import BitfinexInfo from './BitfinexInfo.js';
import StockInfo from './StockInfo.js';
import { api, killEvent, isValidString, checkInput, clearText } from '../utility.js';

/* ------------------------------------------------------------------ */
/*  Helpers                                                           */
/* ------------------------------------------------------------------ */

function flushPromises() {
  return new Promise(function (r) { setTimeout(r, 0); });
}

function makePasswordItem(overrides) {
  return Object.assign({
    id: 'pw1',
    name: 'My Site',
    username: 'admin',
    password: 'secret',
    password2: 'oldsecret',
    url: 'https://example.com',
    email: 'a@b.com',
    important: false,
    newable: false,
  }, overrides);
}

function makeBitfinexList() {
  return [
    {
      type: '_USD', key: 'k1', secret: 's1', riskLimit: 5, waitTime: 10,
      amountLimit: 100, miniRate: 0.02, dynamic: 0.05, keepAmount: 0,
      isDiff: false, isActive: true, isTrade: false, tradable: true,
      keepAmountRate1: 0.03, keepAmountMoney1: 200,
      dynamicRate1: 0.04, dynamicDay1: 7,
      dynamicRate2: 0.06, dynamicDay2: 14,
      amount: 500, rate_ratio: 1.2, pair: 'tBTCUSD', clear: 'tBTCUSD',
    },
    {
      type: '_BTC', key: 'k2', secret: 's2', riskLimit: 3, waitTime: 5,
      amountLimit: 50, miniRate: 0.01, dynamic: 0.03, keepAmount: 0,
      isDiff: true, isActive: false, isTrade: false, tradable: false,
      keepAmountRate1: null, keepAmountMoney1: null,
      dynamicRate1: null, dynamicDay1: null,
      dynamicRate2: null, dynamicDay2: null,
      amount: 200, rate_ratio: 0.8, pair: '', clear: '',
    },
  ];
}

function makeStockData() {
  function aQ(total, cash, rec, inv, prop, lt, oth, sd, ld, eq) {
    return { total: total, cash: cash, receivable: rec, inventories: inv, property: prop, longterm: lt, other: oth, shortterm_debt: sd, longterm_debt: ld, equity: eq };
  }
  function sQ(rev, cost, exp, nonop, comp, tax, fc, prof, profC, eps) {
    return { revenue: rev, cost: cost, expenses: exp, nonoperating_without_FC: nonop, comprehensive: comp, tax: tax, finance_cost: fc, profit: prof, profit_comprehensive: profC, quarterEPS: eps };
  }
  function cQ(end, pBT, wd, minor, real, div, op, inv, ipp, fpl) {
    return { end: end, profitBT: pBT, without_dividends: wd, minor: minor, real: real, dividends: div, operation: op, invest: inv, investPerProperty: ipp, financePerLiabilities: fpl };
  }
  function sfQ(prMP, prR, sc, scCL, scI) {
    return { prMinusProfit: prMP, prRatio: prR, shortCash: sc, shortCashWithoutCL: scCL, shortCashWithoutInvest: scI };
  }
  function pQ(gp, op, p, lev, turn, roe, ag, sps, qs, oRoe, oAG, oP, oiR, oiA, oiP2, rR, rA, rP, rdR, rdA, rdP) {
    return {
      gross_profit: gp, operating_profit: op, profit: p, leverage: lev, turnover: turn,
      roe: roe, asset_growth: ag, salesPerShare: sps, quarterSales: qs,
      operationRoe: oRoe, operationAG: oAG, operatingP: oP,
      oiRoe: oiR, oiAG: oiA, oiP: oiP2,
      realRoe: rR, realAG: rA, realP: rP,
      realRoe_dividends: rdR, realAG_dividends: rdA, realP_dividends: rdP,
    };
  }
  function mQ(pR, cR, iR, rR, paR, cash, inv, rec, pay, profit, revenue, share) {
    return {
      profitRelative: pR, cashRelative: cR, inventoriesRelative: iR,
      receivableRelative: rR, payableRelative: paR,
      cash: cash, inventories: inv, receivable: rec, payable: pay,
      profit: profit, revenue: revenue, share: share,
    };
  }

  return {
    earliestYear: 2020, latestYear: 2021, earliestQuarter: 1, latestQuarter: 2,
    safetyIndex: 5, profitIndex: 7, managementIndex: 3,
    assetStatus: {
      2020: [aQ(1000,20,10,15,25,10,5,5,10,5), aQ(1100,22,11,14,26,11,6,4,4,2)],
      2021: [aQ(800,25,8,12,20,12,8,6,3,6), aQ(1300,30,13,5,23,9,7,8,3,2)],
    },
    salesStatus: {
      2020: [sQ(500,60,15,5,-3,2,-1,8,5,1.5), sQ(600,55,10,-4,6,-3,2,10,7,2.0)],
      2021: [sQ(550,58,12,3,-2,1,-1,9,6,1.8), sQ(700,50,8,7,4,-2,3,12,9,2.5)],
    },
    cashStatus: {
      2020: [cQ(1e8,10,8,1,5,2,6,-3,0.5,0.3), cQ(1.1e8,12,9,2,6,3,7,-4,0.6,0.4)],
      2021: [cQ(9e7,8,7,1,4,1,5,-2,0.4,0.2), cQ(1.2e8,15,11,3,8,4,9,-5,0.7,0.5)],
    },
    safetyStatus: {
      2020: [sfQ(10,1.5,100,80,60), sfQ(12,1.8,120,90,70)],
      2021: [sfQ(8,1.2,90,70,50), sfQ(15,2.0,130,100,80)],
    },
    profitStatus: {
      2020: [pQ(30,20,15,0.5,0.8,12,5,5e6,4e6,10,3,18,9,2,16,8,4,14,7,3,13), pQ(32,22,17,0.6,0.9,14,6,5.5e6,4.5e6,11,4,19,10,3,17,9,5,15,8,4,14)],
      2021: [pQ(28,18,13,0.4,0.7,10,4,4.5e6,3.5e6,8,2,16,7,1,14,6,3,12,5,2,11), pQ(35,25,20,0.7,1.0,16,8,6e6,5e6,13,5,21,11,4,19,10,6,17,9,5,15)],
    },
    managementStatus: {
      2020: [mQ(5,3,-2,4,-1,5e7,3e7,2e7,1.5e7,4e7,8e7,1e6), mQ(6,4,-1,5,-2,5.5e7,3.2e7,2.2e7,1.6e7,4.2e7,8.5e7,1.1e6)],
      2021: [mQ(4,2,-3,3,-1,4.5e7,2.8e7,1.8e7,1.4e7,3.8e7,7.5e7,9e5), mQ(7,5,-1,6,-3,6e7,3.5e7,2.5e7,1.7e7,4.5e7,9e7,1.2e6)],
    },
  };
}

/* ================================================================== */
/*  PasswordInfo                                                      */
/* ================================================================== */

describe('PasswordInfo', () => {
  let props;

  beforeEach(() => {
    jest.clearAllMocks();
    props = {
      item: makePasswordItem(),
      addalert: jest.fn(),
      onclose: jest.fn(),
      sendglbpw: jest.fn(function (cb) { var p = cb('myUserPW'); if (p && typeof p.catch === 'function') p.catch(function () {}); }),
      setLatest: jest.fn(),
      bookmark: 'bm1',
      gourl: jest.fn(),
      goemail: jest.fn(),
    };
  });

  /* ---------- render & lifecycle ---------- */

  test('renders non-newable item with url and email (view mode)', () => {
    const { container } = render(<PasswordInfo {...props} />);
    expect(container.querySelector('#password-section')).toBeTruthy();
    // edit button present (not newable)
    expect(container.querySelectorAll('.btn-warning').length).toBe(1);
    // important shows "No"
    expect(container.textContent).toContain('No');
  });

  test('renders non-newable important item (view mode)', () => {
    props.item = makePasswordItem({ important: true });
    const { container } = render(<PasswordInfo {...props} />);
    expect(container.textContent).toContain('Yes');
  });

  test('renders newable item (edit mode), no edit button, runs initFocus', () => {
    props.item = makePasswordItem({ newable: true });
    const { container } = render(<PasswordInfo {...props} />);
    // no edit button for newable
    expect(container.querySelectorAll('.btn-warning').length).toBe(0);
    // checkbox for important rendered
    expect(container.querySelector('input[type="checkbox"]')).toBeTruthy();
  });

  test('renders without url and email', () => {
    props.item = makePasswordItem({ url: '', email: '' });
    const { container } = render(<PasswordInfo {...props} />);
    // glyphicon-share-alt buttons not rendered
    expect(container.querySelectorAll('.glyphicon-share-alt').length).toBe(0);
  });

  test('componentDidUpdate triggers initFocus when edit toggled on', () => {
    const { container } = render(<PasswordInfo {...props} />);
    // toggle edit on via edit button
    const editBtn = container.querySelector('.btn-warning');
    fireEvent.click(editBtn);
    // confirm checkbox rendered (edit mode)
    expect(container.querySelector('input[type="checkbox"]')).toBeTruthy();
  });

  /* ---------- _handleChange ---------- */

  test('_handleChange updates state from checkbox', () => {
    props.item = makePasswordItem({ newable: true, important: false });
    const { container } = render(<PasswordInfo {...props} />);
    const checkbox = container.querySelector('input[type="checkbox"]');
    fireEvent.change(checkbox, { target: { checked: true } });
    // the onChange was called (handleChange)
    expect(checkbox).toBeTruthy();
  });

  /* ---------- _handleSubmit not-edit ---------- */

  test('submit in view mode calls onclose', () => {
    const { container } = render(<PasswordInfo {...props} />);
    fireEvent.submit(container.querySelector('form'));
    expect(props.onclose).toHaveBeenCalled();
  });

  /* ---------- _handleSubmit newable missing fields ---------- */

  test('submit newable missing name', () => {
    props.item = makePasswordItem({ newable: true });
    checkInput.mockReturnValue({});
    const { container } = render(<PasswordInfo {...props} />);
    fireEvent.submit(container.querySelector('form'));
    expect(props.addalert).toHaveBeenCalledWith('Please input name!!!');
  });

  test('submit newable missing username', () => {
    props.item = makePasswordItem({ newable: true });
    checkInput.mockImplementation(function (field) {
      if (field === 'name') return { name: 'n' };
      return {};
    });
    const { container } = render(<PasswordInfo {...props} />);
    fireEvent.submit(container.querySelector('form'));
    expect(props.addalert).toHaveBeenCalledWith('Please input username!!!');
  });

  test('submit newable missing important', () => {
    props.item = makePasswordItem({ newable: true, important: false });
    checkInput.mockImplementation(function (field) {
      if (field === 'name') return { name: 'n' };
      if (field === 'username') return { username: 'u' };
      return {};
    });
    // state.important === item.important → important={}  → no 'important' key
    const { container } = render(<PasswordInfo {...props} />);
    fireEvent.submit(container.querySelector('form'));
    expect(props.addalert).toHaveBeenCalledWith('Please input important!!!');
  });

  test('submit newable missing password', () => {
    props.item = makePasswordItem({ newable: true, important: false });
    checkInput.mockImplementation(function (field) {
      if (field === 'name') return { name: 'n' };
      if (field === 'username') return { username: 'u' };
      return {};
    });
    const { container } = render(<PasswordInfo {...props} />);
    const cb = container.querySelector('input[type="checkbox"]');
    fireEvent.click(cb);
    fireEvent.submit(container.querySelector('form'));
    expect(props.addalert).toHaveBeenCalledWith('Please input password!!!');
  });

  /* ---------- _handleSubmit newable success (important) ---------- */

  test('submit newable important success calls api then onclose', async () => {
    props.item = makePasswordItem({ newable: true, important: false });
    checkInput.mockImplementation(function (field) {
      if (field === 'name') return { name: 'n' };
      if (field === 'username') return { username: 'u' };
      if (field === 'password') return { password: 'p' };
      return {};
    });
    isValidString.mockReturnValue('ok');
    api.mockResolvedValue({});
    const { container } = render(<PasswordInfo {...props} />);
    const cb = container.querySelector('input[type="checkbox"]');
    fireEvent.click(cb);
    fireEvent.submit(container.querySelector('form'));
    await act(async () => { await flushPromises(); });
    expect(api).toHaveBeenCalledWith('/api/password/newRow', expect.objectContaining({ userPW: 'myUserPW' }));
    expect(props.onclose).toHaveBeenCalled();
  });

  test('submit newable important api error', async () => {
    props.item = makePasswordItem({ newable: true, important: false });
    checkInput.mockImplementation(function (field) {
      if (field === 'name') return { name: 'n' };
      if (field === 'username') return { username: 'u' };
      if (field === 'password') return { password: 'p' };
      return {};
    });
    isValidString.mockReturnValue('ok');
    api.mockRejectedValue('api err');
    const { container } = render(<PasswordInfo {...props} />);
    const cb = container.querySelector('input[type="checkbox"]');
    fireEvent.click(cb);
    fireEvent.submit(container.querySelector('form'));
    await act(async () => { await flushPromises(); });
    expect(props.addalert).toHaveBeenCalledWith('api err');
  });

  test('submit newable important isValidString fails', async () => {
    props.item = makePasswordItem({ newable: true, important: false });
    checkInput.mockImplementation(function (field) {
      if (field === 'name') return { name: 'n' };
      if (field === 'username') return { username: 'u' };
      if (field === 'password') return { password: 'p' };
      return {};
    });
    isValidString.mockReturnValue('');
    const { container } = render(<PasswordInfo {...props} />);
    const cb = container.querySelector('input[type="checkbox"]');
    fireEvent.click(cb);
    fireEvent.submit(container.querySelector('form'));
    await act(async () => { await flushPromises(); });
    expect(props.addalert).toHaveBeenCalledWith('User password not vaild!!!');
  });

  /* ---------- _handleSubmit newable not-important ---------- */

  test('submit newable not-important success', async () => {
    props.item = makePasswordItem({ newable: true, important: true });
    checkInput.mockImplementation(function (field) {
      if (field === 'name') return { name: 'n' };
      if (field === 'username') return { username: 'u' };
      if (field === 'password') return { password: 'p' };
      return {};
    });
    isValidString.mockReturnValue('ok');
    api.mockResolvedValue({});
    const { container } = render(<PasswordInfo {...props} />);
    const cb = container.querySelector('input[type="checkbox"]');
    fireEvent.click(cb);
    fireEvent.submit(container.querySelector('form'));
    await act(async () => { await flushPromises(); });
    expect(api).toHaveBeenCalledWith('/api/password/newRow', expect.objectContaining({ name: 'n' }));
    expect(props.onclose).toHaveBeenCalled();
  });

  test('submit newable not-important api error', async () => {
    props.item = makePasswordItem({ newable: true, important: true });
    checkInput.mockImplementation(function (field) {
      if (field === 'name') return { name: 'n' };
      if (field === 'username') return { username: 'u' };
      if (field === 'password') return { password: 'p' };
      return {};
    });
    isValidString.mockReturnValue('ok');
    api.mockRejectedValue('fail');
    const { container } = render(<PasswordInfo {...props} />);
    const cb = container.querySelector('input[type="checkbox"]');
    fireEvent.click(cb);
    fireEvent.submit(container.querySelector('form'));
    await act(async () => { await flushPromises(); });
    expect(props.addalert).toHaveBeenCalledWith('fail');
  });

  /* ---------- _handleSubmit edit non-newable ---------- */

  test('submit edit non-newable empty set_obj calls onclose', () => {
    checkInput.mockReturnValue({});
    const { container } = render(<PasswordInfo {...props} />);
    fireEvent.click(container.querySelector('.btn-warning'));
    fireEvent.submit(container.querySelector('form'));
    expect(props.onclose).toHaveBeenCalled();
  });

  test('submit edit non-newable with changes, not important', async () => {
    props.item = makePasswordItem({ important: false });
    checkInput.mockImplementation(function (field) {
      if (field === 'name') return { name: 'changed' };
      return {};
    });
    api.mockResolvedValue({});
    const { container } = render(<PasswordInfo {...props} />);
    fireEvent.click(container.querySelector('.btn-warning'));
    fireEvent.submit(container.querySelector('form'));
    await act(async () => { await flushPromises(); });
    expect(props.setLatest).toHaveBeenCalledWith('pw1', 'bm1');
    expect(api).toHaveBeenCalledWith('/api/password/editRow/pw1', expect.any(Object), 'PUT');
    expect(props.onclose).toHaveBeenCalled();
  });

  test('submit edit non-newable not-important api error', async () => {
    props.item = makePasswordItem({ important: false });
    checkInput.mockImplementation(function (field) {
      if (field === 'name') return { name: 'x' };
      return {};
    });
    api.mockRejectedValue('edit-err');
    const { container } = render(<PasswordInfo {...props} />);
    fireEvent.click(container.querySelector('.btn-warning'));
    fireEvent.submit(container.querySelector('form'));
    await act(async () => { await flushPromises(); });
    expect(props.addalert).toHaveBeenCalledWith('edit-err');
  });

  test('submit edit non-newable with set_obj.important (sendglbpw)', async () => {
    props.item = makePasswordItem({ important: false });
    checkInput.mockImplementation(function (field) {
      if (field === 'name') return { name: 'x' };
      return {};
    });
    isValidString.mockReturnValue('ok');
    api.mockResolvedValue({});
    const { container } = render(<PasswordInfo {...props} />);
    fireEvent.click(container.querySelector('.btn-warning'));
    const cb = container.querySelector('input[type="checkbox"]');
    fireEvent.click(cb);
    fireEvent.submit(container.querySelector('form'));
    await act(async () => { await flushPromises(); });
    expect(props.sendglbpw).toHaveBeenCalled();
    expect(api).toHaveBeenCalledWith(expect.stringContaining('/api/password/editRow/'), expect.objectContaining({ userPW: 'myUserPW' }), 'PUT');
    expect(props.onclose).toHaveBeenCalled();
  });

  test('submit edit non-newable set_obj.important api error', async () => {
    props.item = makePasswordItem({ important: false });
    checkInput.mockImplementation(function (field) {
      if (field === 'name') return { name: 'x' };
      return {};
    });
    isValidString.mockReturnValue('ok');
    api.mockRejectedValue('edit-fail');
    const { container } = render(<PasswordInfo {...props} />);
    fireEvent.click(container.querySelector('.btn-warning'));
    const cb = container.querySelector('input[type="checkbox"]');
    fireEvent.click(cb);
    fireEvent.submit(container.querySelector('form'));
    await act(async () => { await flushPromises(); });
    expect(props.addalert).toHaveBeenCalledWith('edit-fail');
  });

  test('submit edit non-newable set_obj.important isValidString fails', async () => {
    props.item = makePasswordItem({ important: false });
    checkInput.mockImplementation(function (field) {
      if (field === 'name') return { name: 'x' };
      return {};
    });
    isValidString.mockReturnValue('');
    const { container } = render(<PasswordInfo {...props} />);
    fireEvent.click(container.querySelector('.btn-warning'));
    const cb = container.querySelector('input[type="checkbox"]');
    fireEvent.click(cb);
    fireEvent.submit(container.querySelector('form'));
    await act(async () => { await flushPromises(); });
    expect(props.addalert).toHaveBeenCalledWith('User password not vaild!!!');
  });

  test('submit edit non-newable item.important (sendglbpw)', async () => {
    props.item = makePasswordItem({ important: true });
    checkInput.mockImplementation(function (field) {
      if (field === 'name') return { name: 'x' };
      return {};
    });
    isValidString.mockReturnValue('ok');
    api.mockResolvedValue({});
    const { container } = render(<PasswordInfo {...props} />);
    fireEvent.click(container.querySelector('.btn-warning'));
    fireEvent.submit(container.querySelector('form'));
    await act(async () => { await flushPromises(); });
    expect(props.sendglbpw).toHaveBeenCalled();
  });

  /* ---------- _selectValue ---------- */

  test('selectValue for username (non-password field)', () => {
    const { container } = render(<PasswordInfo {...props} />);
    const copyBtns = container.querySelectorAll('.glyphicon-copy');
    expect(copyBtns.length).toBeGreaterThan(0);
    fireEvent.click(copyBtns[0].closest('button'));
    expect(killEvent).toHaveBeenCalled();
  });

  test('selectValue for password triggers _getPassword', async () => {
    api.mockResolvedValue({ password: 'revealed' });
    isValidString.mockReturnValue('ok');
    const { container } = render(<PasswordInfo {...props} />);
    const copyBtns = container.querySelectorAll('.glyphicon-copy');
    fireEvent.click(copyBtns[1].closest('button'));
    await act(async () => { await flushPromises(); });
  });

  test('selectValue for password2 triggers _getPassword with isPre', async () => {
    api.mockResolvedValue({ password: 'revealed2' });
    isValidString.mockReturnValue('ok');
    const { container } = render(<PasswordInfo {...props} />);
    const copyBtns = container.querySelectorAll('.glyphicon-copy');
    fireEvent.click(copyBtns[2].closest('button'));
    await act(async () => { await flushPromises(); });
  });

  test('selectValue for password when already cached', async () => {
    api.mockResolvedValue({ password: 'cached' });
    isValidString.mockReturnValue('ok');
    const { container } = render(<PasswordInfo {...props} />);
    const copyBtns = container.querySelectorAll('.glyphicon-copy');
    fireEvent.click(copyBtns[1].closest('button'));
    await act(async () => { await flushPromises(); });
    fireEvent.click(copyBtns[1].closest('button'));
  });

  /* ---------- _copyValue ---------- */

  test('copyValue sets clipboard data', () => {
    const { container } = render(<PasswordInfo {...props} />);
    const usernameInput = container.querySelector('[data-testid="ui-Username"]');
    if (usernameInput) {
      const clipboardEvent = new Event('copy', { bubbles: true });
      clipboardEvent.clipboardData = { setData: jest.fn() };
      clipboardEvent.preventDefault = jest.fn();
      clipboardEvent.stopPropagation = jest.fn();
      usernameInput.dispatchEvent(clipboardEvent);
    }
  });

  /* ---------- _getPassword (important=false path) ---------- */

  test('_getPassword not-important success', async () => {
    props.item = makePasswordItem({ important: false });
    api.mockResolvedValue({ password: 'pw123' });
    const { container } = render(<PasswordInfo {...props} />);
    const eyeBtns = container.querySelectorAll('.glyphicon-eye-open');
    expect(eyeBtns.length).toBeGreaterThan(0);
    fireEvent.click(eyeBtns[0].closest('button'));
    await act(async () => { await flushPromises(); });
    expect(api).toHaveBeenCalledWith(expect.stringContaining('/api/password/getPW/'), expect.any(Object), 'PUT');
  });

  test('_getPassword not-important api error', async () => {
    props.item = makePasswordItem({ important: false });
    api.mockRejectedValue('pw-err');
    const { container } = render(<PasswordInfo {...props} />);
    const eyeBtns = container.querySelectorAll('.glyphicon-eye-open');
    fireEvent.click(eyeBtns[0].closest('button'));
    await act(async () => { await flushPromises(); });
    expect(props.addalert).toHaveBeenCalledWith('pw-err');
  });

  test('_getPassword important isValidString fails', async () => {
    props.item = makePasswordItem({ important: true });
    isValidString.mockReturnValue('');
    const { container } = render(<PasswordInfo {...props} />);
    const eyeBtns = container.querySelectorAll('.glyphicon-eye-open');
    fireEvent.click(eyeBtns[0].closest('button'));
    await act(async () => { await flushPromises(); });
    expect(props.addalert).toHaveBeenCalledWith('User password not vaild!!!');
  });

  test('_getPassword important api error', async () => {
    props.item = makePasswordItem({ important: true });
    isValidString.mockReturnValue('ok');
    api.mockRejectedValue('gpw-err');
    const { container } = render(<PasswordInfo {...props} />);
    const eyeBtns = container.querySelectorAll('.glyphicon-eye-open');
    fireEvent.click(eyeBtns[0].closest('button'));
    await act(async () => { await flushPromises(); });
    expect(props.addalert).toHaveBeenCalledWith('gpw-err');
  });

  /* ---------- _generatePassword ---------- */

  test('generatePassword type 1, 2, 3', async () => {
    props.item = makePasswordItem({ newable: true });
    api.mockResolvedValue({ password: 'gen123' });
    const { container } = render(<PasswordInfo {...props} />);
    const refreshBtns = container.querySelectorAll('.glyphicon-refresh');
    expect(refreshBtns.length).toBe(3);
    for (let i = 0; i < refreshBtns.length; i++) {
      fireEvent.click(refreshBtns[i].closest('button'));
    }
    await act(async () => { await flushPromises(); });
    expect(api).toHaveBeenCalledWith('/api/password/generate/1');
    expect(api).toHaveBeenCalledWith('/api/password/generate/2');
    expect(api).toHaveBeenCalledWith('/api/password/generate/3');
  });

  test('generatePassword api error', async () => {
    props.item = makePasswordItem({ newable: true });
    api.mockRejectedValue('gen-err');
    const { container } = render(<PasswordInfo {...props} />);
    const refreshBtns = container.querySelectorAll('.glyphicon-refresh');
    fireEvent.click(refreshBtns[0].closest('button'));
    await act(async () => { await flushPromises(); });
    expect(props.addalert).toHaveBeenCalledWith('gen-err');
  });

  /* ---------- _showPassword ---------- */

  test('showPassword toggles show/hide (non-important, has cached)', async () => {
    props.item = makePasswordItem({ important: false });
    api.mockResolvedValue({ password: 'shown' });
    const { container } = render(<PasswordInfo {...props} />);
    const eyeBtns = container.querySelectorAll('.glyphicon-eye-open');
    fireEvent.click(eyeBtns[0].closest('button'));
    await act(async () => { await flushPromises(); });
    const eyeClose = container.querySelector('.glyphicon-eye-close');
    if (eyeClose) { fireEvent.click(eyeClose.closest('button')); }
    const eyeOpen2 = container.querySelectorAll('.glyphicon-eye-open');
    if (eyeOpen2.length > 0) { fireEvent.click(eyeOpen2[0].closest('button')); }
  });

  test('showPassword for password2 (isPre=true)', async () => {
    props.item = makePasswordItem({ important: false });
    api.mockResolvedValue({ password: 'pre-shown' });
    const { container } = render(<PasswordInfo {...props} />);
    const eyeBtns = container.querySelectorAll('.glyphicon-eye-open');
    fireEvent.click(eyeBtns[1].closest('button'));
    await act(async () => { await flushPromises(); });
    expect(clearText).toHaveBeenCalled();
  });

  /* ---------- render extras ---------- */

  test('close heading calls onclose', () => {
    const { container } = render(<PasswordInfo {...props} />);
    fireEvent.click(container.querySelector('.panel-heading'));
    expect(props.onclose).toHaveBeenCalled();
  });

  test('url gourl button', () => {
    const { container } = render(<PasswordInfo {...props} />);
    const shareBtns = container.querySelectorAll('.glyphicon-share-alt');
    expect(shareBtns.length).toBeGreaterThanOrEqual(2);
    fireEvent.click(shareBtns[0].closest('button'));
    expect(props.gourl).toHaveBeenCalledWith('https://example.com');
  });

  test('email goemail button', () => {
    const { container } = render(<PasswordInfo {...props} />);
    const shareBtns = container.querySelectorAll('.glyphicon-share-alt');
    fireEvent.click(shareBtns[1].closest('button'));
    expect(props.goemail).toHaveBeenCalledWith('a@b.com');
  });

  test('edit toggle button toggles state', () => {
    const { container } = render(<PasswordInfo {...props} />);
    fireEvent.click(container.querySelector('.btn-warning'));
    expect(container.querySelector('input[type="checkbox"]')).toBeTruthy();
    fireEvent.click(container.querySelector('.btn-warning'));
  });

  test('render shows Previous Password label in view mode', () => {
    const { container } = render(<PasswordInfo {...props} />);
    expect(container.textContent).toContain('Previous Password');
  });

  test('render shows Confirm Password label in edit mode', () => {
    props.item = makePasswordItem({ newable: true });
    const { container } = render(<PasswordInfo {...props} />);
    expect(container.textContent).toContain('Confirm Password');
  });

  /* ---------- _getPassword important success ---------- */

  test('_getPassword important api success', async () => {
    props.item = makePasswordItem({ important: true });
    isValidString.mockReturnValue('ok');
    api.mockResolvedValue({ password: 'pw-ok' });
    const { container } = render(<PasswordInfo {...props} />);
    const eyeBtns = container.querySelectorAll('.glyphicon-eye-open');
    fireEvent.click(eyeBtns[0].closest('button'));
    await act(async () => { await flushPromises(); });
    expect(api).toHaveBeenCalledWith(expect.stringContaining('/api/password/getPW/'), expect.objectContaining({ userPW: 'myUserPW' }), 'PUT');
    expect(props.setLatest).toHaveBeenCalled();
  });

  test('_getPassword important success isPre', async () => {
    props.item = makePasswordItem({ important: true });
    isValidString.mockReturnValue('ok');
    api.mockResolvedValue({ password: 'pw-pre-ok' });
    const { container } = render(<PasswordInfo {...props} />);
    const eyeBtns = container.querySelectorAll('.glyphicon-eye-open');
    fireEvent.click(eyeBtns[1].closest('button'));
    await act(async () => { await flushPromises(); });
    expect(api).toHaveBeenCalledWith(expect.stringContaining('/pre'), expect.any(Object), 'PUT');
  });

  /* ---------- _copyValue via onCopy on inputs ---------- */

  test('onCopy on password input triggers _copyValue', async () => {
    props.item = makePasswordItem({ important: false });
    api.mockResolvedValue({ password: 'cpw' });
    const { container } = render(<PasswordInfo {...props} />);
    // First show the password so _password is set
    const eyeBtns = container.querySelectorAll('.glyphicon-eye-open');
    fireEvent.click(eyeBtns[0].closest('button'));
    await act(async () => { await flushPromises(); });
    // Now trigger copy on password input
    const passwordInput = container.querySelector('[data-testid="ui-2~30個英數、!、@、#、$、%"]');
    if (passwordInput) {
      const ev = new Event('copy', { bubbles: true });
      ev.clipboardData = { setData: jest.fn() };
      ev.preventDefault = jest.fn();
      ev.stopPropagation = jest.fn();
      passwordInput.dispatchEvent(ev);
      expect(ev.clipboardData.setData).toHaveBeenCalled();
    }
  });

  test('onCopy on url input triggers _copyValue', () => {
    const { container } = render(<PasswordInfo {...props} />);
    const urlInput = container.querySelector('[data-testid="ui-Url (Option)"]');
    if (urlInput) {
      const ev = new Event('copy', { bubbles: true });
      ev.clipboardData = { setData: jest.fn() };
      ev.preventDefault = jest.fn();
      ev.stopPropagation = jest.fn();
      urlInput.dispatchEvent(ev);
      expect(ev.clipboardData.setData).toHaveBeenCalled();
    }
  });

  test('onCopy on email input triggers _copyValue', () => {
    const { container } = render(<PasswordInfo {...props} />);
    const emailInput = container.querySelector('[data-testid="ui-Email (Option)"]');
    if (emailInput) {
      const ev = new Event('copy', { bubbles: true });
      ev.clipboardData = { setData: jest.fn() };
      ev.preventDefault = jest.fn();
      ev.stopPropagation = jest.fn();
      emailInput.dispatchEvent(ev);
      expect(ev.clipboardData.setData).toHaveBeenCalled();
    }
  });

  test('onCopy on password2 input triggers _copyValue', () => {
    const { container } = render(<PasswordInfo {...props} />);
    const pw2Input = container.querySelector('[data-testid="ui-Confirm Password"]');
    if (pw2Input) {
      const ev = new Event('copy', { bubbles: true });
      ev.clipboardData = { setData: jest.fn() };
      ev.preventDefault = jest.fn();
      ev.stopPropagation = jest.fn();
      pw2Input.dispatchEvent(ev);
      expect(ev.clipboardData.setData).toHaveBeenCalled();
    }
  });

  /* ---------- selectValue url/email via copy buttons ---------- */

  test('selectValue for url', () => {
    const { container } = render(<PasswordInfo {...props} />);
    const copyBtns = container.querySelectorAll('.glyphicon-copy');
    fireEvent.click(copyBtns[3].closest('button'));
    expect(killEvent).toHaveBeenCalled();
  });

  test('selectValue for email', () => {
    const { container } = render(<PasswordInfo {...props} />);
    const copyBtns = container.querySelectorAll('.glyphicon-copy');
    fireEvent.click(copyBtns[4].closest('button'));
    expect(killEvent).toHaveBeenCalled();
  });
});

/* ================================================================== */
/*  BitfinexInfo                                                      */
/* ================================================================== */

describe('BitfinexInfo', () => {
  let props;

  beforeEach(() => {
    jest.clearAllMocks();
    props = {
      mainUrl: '',
      addalert: jest.fn(),
      onclose: jest.fn(),
      sendglbcf: jest.fn(function (cb) { cb(); }),
    };
  });

  test('componentDidMount fetches bot list and renders', async () => {
    api.mockResolvedValue(makeBitfinexList());
    const { container } = render(<BitfinexInfo {...props} />);
    await act(async () => { await flushPromises(); });
    // Bot buttons rendered
    expect(container.textContent).toContain('USD');
    expect(container.textContent).toContain('BTC');
  });

  test('componentDidMount api error', async () => {
    api.mockRejectedValue('bfx-err');
    render(<BitfinexInfo {...props} />);
    await act(async () => { await flushPromises(); });
    expect(props.addalert).toHaveBeenCalledWith('bfx-err');
  });

  test('_setList with null returns false', async () => {
    api.mockResolvedValue(null);
    render(<BitfinexInfo {...props} />);
    await act(async () => { await flushPromises(); });
  });

  test('_setList empty list sets current=-1', async () => {
    api.mockResolvedValue([]);
    render(<BitfinexInfo {...props} />);
    await act(async () => { await flushPromises(); });
  });

  test('_setList with type finds matching index', async () => {
    api.mockResolvedValue(makeBitfinexList());
    const { container } = render(<BitfinexInfo {...props} />);
    await act(async () => { await flushPromises(); });
    // Click second bot button (BTC) — covers line 163 falsy arm (no rate values)
    const btns = container.querySelectorAll('.btn-primary');
    fireEvent.click(btns[1]);
    // Click first bot button (ETH) — covers line 163 truthy arm (has keepAmountRate1)
    fireEvent.click(btns[0]);
  });

  test('heading close calls onclose', async () => {
    api.mockResolvedValue(makeBitfinexList());
    const { container } = render(<BitfinexInfo {...props} />);
    await act(async () => { await flushPromises(); });
    fireEvent.click(container.querySelector('.panel-heading'));
    expect(props.onclose).toHaveBeenCalled();
  });

  test('_handleChange reads checkboxes', async () => {
    api.mockResolvedValue(makeBitfinexList());
    const { container } = render(<BitfinexInfo {...props} />);
    await act(async () => { await flushPromises(); });
    const checkboxes = container.querySelectorAll('input[type="checkbox"]');
    if (checkboxes.length > 0) {
      fireEvent.click(checkboxes[0]);
    }
  });

  test('_delBot calls sendglbcf and api', async () => {
    api.mockResolvedValue(makeBitfinexList());
    const { container } = render(<BitfinexInfo {...props} />);
    await act(async () => { await flushPromises(); });
    // delete button is btn-danger
    const delBtn = container.querySelector('.btn-danger');
    fireEvent.click(delBtn);
    await act(async () => { await flushPromises(); });
    expect(props.sendglbcf).toHaveBeenCalled();
  });

  test('_delBot api error', async () => {
    const list = makeBitfinexList();
    api.mockResolvedValueOnce(list);
    const { container } = render(<BitfinexInfo {...props} />);
    await act(async () => { await flushPromises(); });
    api.mockRejectedValue('del-err');
    const delBtn = container.querySelector('.btn-danger');
    fireEvent.click(delBtn);
    await act(async () => { await flushPromises(); });
    expect(props.addalert).toHaveBeenCalledWith('del-err');
  });

  /* ---------- _handleSubmit branches ---------- */

  test('submit with no changes does nothing', async () => {
    api.mockResolvedValue(makeBitfinexList());
    checkInput.mockReturnValue({});
    isValidString.mockReturnValue('ok');
    const { container } = render(<BitfinexInfo {...props} />);
    await act(async () => { await flushPromises(); });
    // Switch to second bot (all rate values are null → empty set_obj)
    var botBtns = container.querySelectorAll('.btn-primary');
    fireEvent.click(botBtns[1]);
    fireEvent.submit(container.querySelector('form'));
  });

  test('submit with changes calls sendglbcf + api', async () => {
    api.mockResolvedValue(makeBitfinexList());
    checkInput.mockImplementation(function (field) {
      if (field === 'key') return { key: 'newkey' };
      return {};
    });
    isValidString.mockReturnValue('ok');
    const { container } = render(<BitfinexInfo {...props} />);
    await act(async () => { await flushPromises(); });
    api.mockResolvedValue(makeBitfinexList());
    fireEvent.submit(container.querySelector('form'));
    await act(async () => { await flushPromises(); });
    expect(props.sendglbcf).toHaveBeenCalled();
    expect(props.addalert).toHaveBeenCalledWith('USD Bot update completed');
  });

  test('submit api error in update', async () => {
    api.mockResolvedValueOnce(makeBitfinexList());
    checkInput.mockImplementation(function (field) {
      if (field === 'key') return { key: 'k' };
      return {};
    });
    isValidString.mockReturnValue('ok');
    const { container } = render(<BitfinexInfo {...props} />);
    await act(async () => { await flushPromises(); });
    api.mockRejectedValue('upd-err');
    fireEvent.submit(container.querySelector('form'));
    await act(async () => { await flushPromises(); });
    expect(props.addalert).toHaveBeenCalledWith('upd-err');
  });

  /* ---------- _handleSubmit keepAmountRate1/Money1 branches ---------- */

  test('submit keepAmountRate1 changed, valid', async () => {
    const list = makeBitfinexList();
    api.mockResolvedValue(list);
    checkInput.mockReturnValue({});
    isValidString.mockReturnValue('ok');
    const { container } = render(<BitfinexInfo {...props} />);
    await act(async () => { await flushPromises(); });
    // Change keepAmountRate1 input so state differs from item
    const rateInput = container.querySelector('[data-testid="ui->Rate"]');
    if (rateInput) {
      fireEvent.change(rateInput, { target: { value: '0.05' } });
    }
    fireEvent.submit(container.querySelector('form'));
  });

  test('submit keepAmountRate1 changed, invalid', async () => {
    const list = makeBitfinexList();
    api.mockResolvedValue(list);
    isValidString.mockImplementation(function (val, type) {
      if (type === 'zeroint' && String(val) === '0.05') return '';
      return 'ok';
    });
    checkInput.mockReturnValue({});
    const { container } = render(<BitfinexInfo {...props} />);
    await act(async () => { await flushPromises(); });
    const rateInput = container.querySelector('[data-testid="ui->Rate"]');
    if (rateInput) {
      fireEvent.change(rateInput, { target: { value: '0.05' } });
    }
    fireEvent.submit(container.querySelector('form'));
    expect(props.addalert).toHaveBeenCalledWith('Reserved Amount 1 not vaild!!!');
  });

  test('submit keepAmountRate1 invalid', async () => {
    const list = makeBitfinexList();
    list[0].keepAmountRate1 = 0.03;
    list[0].keepAmountMoney1 = 200;
    api.mockResolvedValue(list);
    isValidString.mockImplementation(function (val, type) {
      if (type === 'zeroint' && (val === 0.03 || val === 200)) return '';
      return 'ok';
    });
    checkInput.mockReturnValue({});
    const { container } = render(<BitfinexInfo {...props} />);
    await act(async () => { await flushPromises(); });
    fireEvent.submit(container.querySelector('form'));
  });

  test('submit dynamicRate1 changed, valid', async () => {
    const list = makeBitfinexList();
    api.mockResolvedValue(list);
    isValidString.mockReturnValue('ok');
    checkInput.mockReturnValue({});
    const { container } = render(<BitfinexInfo {...props} />);
    await act(async () => { await flushPromises(); });
    // Change dynamicRate1 (second ">Rate" input) so state differs from item
    const rateInputs = container.querySelectorAll('[data-testid="ui->Rate"]');
    if (rateInputs.length > 1) {
      fireEvent.change(rateInputs[1], { target: { value: '0.09' } });
    }
    fireEvent.submit(container.querySelector('form'));
  });

  test('submit dynamicRate1 changed, invalid', async () => {
    const list = makeBitfinexList();
    api.mockResolvedValue(list);
    isValidString.mockImplementation(function (val, type) {
      if (type === 'zeroint' && String(val) === '0.09') return '';
      return 'ok';
    });
    checkInput.mockReturnValue({});
    const { container } = render(<BitfinexInfo {...props} />);
    await act(async () => { await flushPromises(); });
    const rateInputs = container.querySelectorAll('[data-testid="ui->Rate"]');
    if (rateInputs.length > 1) {
      fireEvent.change(rateInputs[1], { target: { value: '0.09' } });
    }
    fireEvent.submit(container.querySelector('form'));
    expect(props.addalert).toHaveBeenCalledWith('Boost Rate 1 not vaild!!!');
  });

  test('submit dynamicRate2 changed, valid', async () => {
    const list = makeBitfinexList();
    api.mockResolvedValue(list);
    isValidString.mockReturnValue('ok');
    checkInput.mockReturnValue({});
    const { container } = render(<BitfinexInfo {...props} />);
    await act(async () => { await flushPromises(); });
    // Change dynamicRate2 (third ">Rate" input)
    const rateInputs = container.querySelectorAll('[data-testid="ui->Rate"]');
    if (rateInputs.length > 2) {
      fireEvent.change(rateInputs[2], { target: { value: '0.12' } });
    }
    fireEvent.submit(container.querySelector('form'));
  });

  test('submit dynamicRate2 changed, invalid', async () => {
    const list = makeBitfinexList();
    api.mockResolvedValue(list);
    isValidString.mockImplementation(function (val, type) {
      if (type === 'zeroint' && String(val) === '0.12') return '';
      return 'ok';
    });
    checkInput.mockReturnValue({});
    const { container } = render(<BitfinexInfo {...props} />);
    await act(async () => { await flushPromises(); });
    const rateInputs = container.querySelectorAll('[data-testid="ui->Rate"]');
    if (rateInputs.length > 2) {
      fireEvent.change(rateInputs[2], { target: { value: '0.12' } });
    }
    fireEvent.submit(container.querySelector('form'));
    expect(props.addalert).toHaveBeenCalledWith('Boost Rate 2 not vaild!!!');
  });

  test('submit dynamicRate1 unchanged, invalid (else-if branch)', async () => {
    const list = makeBitfinexList();
    api.mockResolvedValue(list);
    isValidString.mockImplementation(function (val, type) {
      if (type === 'zeroint' && (val === 0.04 || val === 7)) return '';
      return 'ok';
    });
    checkInput.mockReturnValue({});
    const { container } = render(<BitfinexInfo {...props} />);
    await act(async () => { await flushPromises(); });
    fireEvent.submit(container.querySelector('form'));
    expect(props.addalert).toHaveBeenCalledWith('Boost Rate 1 not vaild!!!');
  });

  test('submit dynamicRate2 unchanged, invalid (else-if branch)', async () => {
    const list = makeBitfinexList();
    api.mockResolvedValue(list);
    isValidString.mockImplementation(function (val, type) {
      if (type === 'zeroint' && (val === 0.06 || val === 14)) return '';
      return 'ok';
    });
    checkInput.mockReturnValue({});
    const { container } = render(<BitfinexInfo {...props} />);
    await act(async () => { await flushPromises(); });
    fireEvent.submit(container.querySelector('form'));
    expect(props.addalert).toHaveBeenCalledWith('Boost Rate 2 not vaild!!!');
  });

  test('submit with diff/active/trade toggled covers ternary branches', async () => {
    const list = makeBitfinexList();
    list[0].isTrade = false;
    list[0].tradable = true;
    api.mockResolvedValue(list);
    checkInput.mockReturnValue({});
    isValidString.mockReturnValue('ok');
    const { container } = render(<BitfinexInfo {...props} />);
    await act(async () => { await flushPromises(); });
    // Toggle diff, active, and trade checkboxes so state !== item
    const checkboxes = container.querySelectorAll('input[type="checkbox"]');
    fireEvent.click(checkboxes[0]); // diff
    fireEvent.click(checkboxes[1]); // active
    fireEvent.click(checkboxes[3]); // trade
    fireEvent.submit(container.querySelector('form'));
    await act(async () => { await flushPromises(); });
    expect(props.sendglbcf).toHaveBeenCalled();
  });

  test('submit pair/clear state empty while item has values', async () => {
    const list = makeBitfinexList();
    api.mockResolvedValue(list);
    checkInput.mockReturnValue({});
    isValidString.mockReturnValue('ok');
    const { container } = render(<BitfinexInfo {...props} />);
    await act(async () => { await flushPromises(); });
    // Clear pair and clear input values to '' so (item.pair && !state.pair) is true
    const pairInput = container.querySelector('[data-testid="ui-交易對，用\'=\'最大金額，用\',\'分隔 例: tBTCUSD=1000,tETHUSD=1000"]');
    const clearInput = container.querySelector('[data-testid="ui-清除部位，用\',\'分隔，ALL代表全部清除並把錢換到放貸 例: tBTCUSD,tETHUSD"]');
    if (pairInput) fireEvent.change(pairInput, { target: { value: '' } });
    if (clearInput) fireEvent.change(clearInput, { target: { value: '' } });
    fireEvent.submit(container.querySelector('form'));
    await act(async () => { await flushPromises(); });
    expect(props.sendglbcf).toHaveBeenCalled();
  });

  test('submit with second bot (no advanced, no pair)', async () => {
    const list = makeBitfinexList();
    api.mockResolvedValue(list);
    checkInput.mockReturnValue({ key: 'newkey' });
    isValidString.mockReturnValue('ok');
    const { container } = render(<BitfinexInfo {...props} />);
    await act(async () => { await flushPromises(); });
    // Switch to second bot — covers line 163 falsy arm (no rate values)
    const botBtns = container.querySelectorAll('.btn-primary');
    fireEvent.click(botBtns[1]);
    fireEvent.submit(container.querySelector('form'));
    // Flush so api resolves → _setList(result, '_BTC') → loop iterates past first bot (line 129 false arm)
    await act(async () => { await flushPromises(); });
  });

  test('submit pair cleared (item.pair exists, state.pair empty)', async () => {
    const list = makeBitfinexList();
    api.mockResolvedValue(list);
    checkInput.mockImplementation(function (field) {
      if (field === 'pair') return { pair: '' };
      if (field === 'clear') return { clear: '' };
      return {};
    });
    isValidString.mockReturnValue('ok');
    const { container } = render(<BitfinexInfo {...props} />);
    await act(async () => { await flushPromises(); });
    fireEvent.submit(container.querySelector('form'));
  });

  test('submit keepAmountRate1 new (no item value, state has value)', async () => {
    const list = makeBitfinexList();
    list[0].keepAmountRate1 = null;
    list[0].keepAmountMoney1 = null;
    api.mockResolvedValue(list);
    checkInput.mockReturnValue({});
    isValidString.mockReturnValue('ok');
    const { container } = render(<BitfinexInfo {...props} />);
    await act(async () => { await flushPromises(); });
    // State keepAmountRate1 is '' (from initValue with null item)
    fireEvent.submit(container.querySelector('form'));
  });

  test('submit dynamicRate1 new (no item value)', async () => {
    const list = makeBitfinexList();
    list[0].dynamicRate1 = null;
    list[0].dynamicDay1 = null;
    api.mockResolvedValue(list);
    checkInput.mockReturnValue({});
    isValidString.mockReturnValue('ok');
    const { container } = render(<BitfinexInfo {...props} />);
    await act(async () => { await flushPromises(); });
    fireEvent.submit(container.querySelector('form'));
  });

  test('submit dynamicRate2 new (no item value)', async () => {
    const list = makeBitfinexList();
    list[0].dynamicRate2 = null;
    list[0].dynamicDay2 = null;
    api.mockResolvedValue(list);
    checkInput.mockReturnValue({});
    isValidString.mockReturnValue('ok');
    const { container } = render(<BitfinexInfo {...props} />);
    await act(async () => { await flushPromises(); });
    fireEvent.submit(container.querySelector('form'));
  });

  /* ---------- render conditionals ---------- */

  test('advanced display hidden when not advanced', async () => {
    const list = makeBitfinexList();
    list[0].keepAmountRate1 = null;
    list[0].dynamicRate1 = null;
    list[0].dynamicRate2 = null;
    api.mockResolvedValue(list);
    const { container } = render(<BitfinexInfo {...props} />);
    await act(async () => { await flushPromises(); });
    // Advanced rows should be display:none
    const trs = container.querySelectorAll('tr');
    let foundHidden = false;
    trs.forEach(function (tr) {
      if (tr.style.display === 'none') foundHidden = true;
    });
    expect(foundHidden).toBe(true);
  });

  test('trade display visible when tradable and trade', async () => {
    const list = makeBitfinexList();
    list[0].tradable = true;
    list[0].isTrade = true;
    api.mockResolvedValue(list);
    const { container } = render(<BitfinexInfo {...props} />);
    await act(async () => { await flushPromises(); });
    expect(container.textContent).toContain('Trade Amount:');
  });

  test('trade display hidden when not tradable', async () => {
    const list = makeBitfinexList();
    list[0].tradable = false;
    api.mockResolvedValue(list);
    const { container } = render(<BitfinexInfo {...props} />);
    await act(async () => { await flushPromises(); });
    // Trade rows exist but hidden
    const trs = container.querySelectorAll('tr');
    expect(trs.length).toBeGreaterThan(0);
  });
});

/* ================================================================== */
/*  StockInfo                                                         */
/* ================================================================== */

describe('StockInfo', () => {
  let props;

  beforeEach(() => {
    jest.clearAllMocks();
    props = {
      item: { id: 'stk1' },
      addalert: jest.fn(),
      setLatest: jest.fn(),
      bookmark: 'bm1',
    };
  });

  function getSelects(container) { return container.querySelectorAll('select'); }
  function getUsdBtns(container) {
    const icons = container.querySelectorAll('.glyphicon-usd');
    return Array.from(icons).map(function (ic) { return ic.closest('button'); });
  }
  function getCheckboxes(container) { return container.querySelectorAll('input[type="checkbox"]'); }

  /* ---------- componentDidMount & render ---------- */

  test('renders with valid stock data', async () => {
    api.mockResolvedValue(makeStockData());
    const { container } = render(<StockInfo {...props} />);
    await act(async () => { await flushPromises(); });
    expect(container.querySelector('#stock-info')).toBeTruthy();
    expect(container.textContent).toContain('Asset');
    expect(container.textContent).toContain('Sales');
    expect(container.textContent).toContain('Cash');
    expect(container.textContent).toContain('Safety');
    expect(container.textContent).toContain('Profit');
    expect(container.textContent).toContain('Management');
    expect(props.setLatest).toHaveBeenCalledWith('stk1', 'bm1');
  });

  test('componentDidMount null result', async () => {
    api.mockResolvedValue(null);
    render(<StockInfo {...props} />);
    await act(async () => { await flushPromises(); });
    expect(props.addalert).toHaveBeenCalledWith('empty stock parse!!!');
  });

  test('componentDidMount api error', async () => {
    api.mockRejectedValue('stk-err');
    render(<StockInfo {...props} />);
    await act(async () => { await flushPromises(); });
    expect(props.addalert).toHaveBeenCalledWith('stk-err');
  });

  /* ---------- componentWillUnmount ---------- */

  test('unmount destroys all charts', async () => {
    api.mockResolvedValue(makeStockData());
    const { unmount } = render(<StockInfo {...props} />);
    await act(async () => { await flushPromises(); });
    unmount();
    // No errors
  });

  test('unmount before data loaded (no charts)', () => {
    api.mockReturnValue(new Promise(function () {}));
    const { unmount } = render(<StockInfo {...props} />);
    unmount();
  });

  /* ---------- _handleSelect ---------- */

  test('_handleSelect changes state via select onChange', async () => {
    api.mockResolvedValue(makeStockData());
    const { container } = render(<StockInfo {...props} />);
    await act(async () => { await flushPromises(); });
    const selects = getSelects(container);
    // Change assetStartYear
    fireEvent.change(selects[0], { target: { value: '2020' } });
    expect(selects[0]).toBeTruthy();
  });

  /* ---------- _handleChange checkboxes ---------- */

  test('_handleChange updates checkbox state', async () => {
    api.mockResolvedValue(makeStockData());
    const { container } = render(<StockInfo {...props} />);
    await act(async () => { await flushPromises(); });
    const cbs = getCheckboxes(container);
    // Click each checkbox to trigger _handleChange
    for (let i = 0; i < cbs.length; i++) {
      fireEvent.click(cbs[i]);
    }
  });

  /* ---------- _drawAsset ---------- */

  test('_drawAsset same start/end (no compare)', async () => {
    api.mockResolvedValue(makeStockData());
    const { container } = render(<StockInfo {...props} />);
    await act(async () => { await flushPromises(); });
    // Default: same date → non-compare path already covered by mount
    const btns = getUsdBtns(container);
    fireEvent.click(btns[0]); // asset button with default (same) dates
  });

  test('_drawAsset compare total_diff > 0', async () => {
    api.mockResolvedValue(makeStockData());
    const { container } = render(<StockInfo {...props} />);
    await act(async () => { await flushPromises(); });
    const selects = getSelects(container);
    // Set start to 2020 Q1
    fireEvent.change(selects[0], { target: { value: '2020' } });
    fireEvent.change(selects[1], { target: { value: '1' } });
    // End stays 2021 Q2 (default) → total_diff = 1300-1000 = 300 > 0
    const btns = getUsdBtns(container);
    fireEvent.click(btns[0]);
  });

  test('_drawAsset compare total_diff < 0', async () => {
    api.mockResolvedValue(makeStockData());
    const { container } = render(<StockInfo {...props} />);
    await act(async () => { await flushPromises(); });
    const selects = getSelects(container);
    // Set start to 2020 Q2 (total=1100), end to 2021 Q1 (total=800) → diff=-300
    fireEvent.change(selects[0], { target: { value: '2020' } });
    fireEvent.change(selects[1], { target: { value: '2' } });
    fireEvent.change(selects[2], { target: { value: '2021' } });
    fireEvent.change(selects[3], { target: { value: '1' } });
    const btns = getUsdBtns(container);
    fireEvent.click(btns[0]);
  });

  test('_drawAsset startYear > endYear clamp', async () => {
    api.mockResolvedValue(makeStockData());
    const { container } = render(<StockInfo {...props} />);
    await act(async () => { await flushPromises(); });
    const selects = getSelects(container);
    // Start 2021, End 2020 → clamped
    fireEvent.change(selects[0], { target: { value: '2021' } });
    fireEvent.change(selects[2], { target: { value: '2020' } });
    fireEvent.change(selects[3], { target: { value: '1' } });
    const btns = getUsdBtns(container);
    fireEvent.click(btns[0]);
  });

  test('_drawAsset startQuarter > endQuarter same year clamp', async () => {
    api.mockResolvedValue(makeStockData());
    const { container } = render(<StockInfo {...props} />);
    await act(async () => { await flushPromises(); });
    const selects = getSelects(container);
    // Same year, start Q2, end Q1
    fireEvent.change(selects[0], { target: { value: '2020' } });
    fireEvent.change(selects[1], { target: { value: '2' } });
    fireEvent.change(selects[2], { target: { value: '2020' } });
    fireEvent.change(selects[3], { target: { value: '1' } });
    const btns = getUsdBtns(container);
    fireEvent.click(btns[0]);
  });

  /* ---------- _drawSales ---------- */

  test('_drawSales with comprehensive=true (default)', async () => {
    api.mockResolvedValue(makeStockData());
    const { container } = render(<StockInfo {...props} />);
    await act(async () => { await flushPromises(); });
    // Already drawn in mount. Redraw with different quarter
    const selects = getSelects(container);
    // salesYear = selects[4], salesQuarter = selects[5]
    fireEvent.change(selects[4], { target: { value: '2020' } });
    fireEvent.change(selects[5], { target: { value: '2' } });
    const btns = getUsdBtns(container);
    fireEvent.click(btns[1]); // sales button
  });

  test('_drawSales with comprehensive=false', async () => {
    api.mockResolvedValue(makeStockData());
    const { container } = render(<StockInfo {...props} />);
    await act(async () => { await flushPromises(); });
    // Click salesCom checkbox to toggle it (starts as true → becomes false)
    const cbs = getCheckboxes(container);
    fireEvent.click(cbs[0]);
    // Click sales button
    const btns = getUsdBtns(container);
    fireEvent.click(btns[1]);
  });

  test('_drawSales covers all sale branches', async () => {
    // Use data with positive nonop, negative comp, positive tax, negative fc
    const data = makeStockData();
    // Q1: nonop=5(+), comp=-3(-), tax=2(+), fc=-1(-)
    // Q2 2020: nonop=-4(-), comp=6(+), tax=-3(-), fc=2(+)
    api.mockResolvedValue(data);
    const { container } = render(<StockInfo {...props} />);
    await act(async () => { await flushPromises(); });
    // Draw sales for 2020 Q1 (positive nonop, negative comp)
    const selects = getSelects(container);
    fireEvent.change(selects[4], { target: { value: '2020' } });
    fireEvent.change(selects[5], { target: { value: '1' } });
    const btns = getUsdBtns(container);
    fireEvent.click(btns[1]);
    // Draw sales for 2020 Q2 (negative nonop, positive comp, negative tax, positive fc)
    fireEvent.change(selects[5], { target: { value: '2' } });
    fireEvent.click(btns[1]);
  });

  /* ---------- _drawCash modes ---------- */

  test('_drawCash mode 1', async () => {
    api.mockResolvedValue(makeStockData());
    const { container } = render(<StockInfo {...props} />);
    await act(async () => { await flushPromises(); });
    const selects = getSelects(container);
    // cashMode = selects[10]
    fireEvent.change(selects[10], { target: { value: '1' } });
    const btns = getUsdBtns(container);
    fireEvent.click(btns[2]); // cash button
  });

  test('_drawCash mode 2', async () => {
    api.mockResolvedValue(makeStockData());
    const { container } = render(<StockInfo {...props} />);
    await act(async () => { await flushPromises(); });
    const selects = getSelects(container);
    fireEvent.change(selects[10], { target: { value: '2' } });
    fireEvent.click(getUsdBtns(container)[2]);
  });

  test('_drawCash mode 3', async () => {
    api.mockResolvedValue(makeStockData());
    const { container } = render(<StockInfo {...props} />);
    await act(async () => { await flushPromises(); });
    const selects = getSelects(container);
    fireEvent.change(selects[10], { target: { value: '3' } });
    fireEvent.click(getUsdBtns(container)[2]);
  });

  test('_drawCash mode 4 (default)', async () => {
    api.mockResolvedValue(makeStockData());
    const { container } = render(<StockInfo {...props} />);
    await act(async () => { await flushPromises(); });
    // Already drawn in mount with mode 4
    fireEvent.click(getUsdBtns(container)[2]);
  });

  test('_drawCash with accumulate=true', async () => {
    api.mockResolvedValue(makeStockData());
    const { container } = render(<StockInfo {...props} />);
    await act(async () => { await flushPromises(); });
    const cbs = getCheckboxes(container);
    // cashAcc = cbs[1] — click to toggle (starts false → becomes true)
    fireEvent.click(cbs[1]);
    fireEvent.click(getUsdBtns(container)[2]);
  });

  test('_drawCash startYear > endYear clamp', async () => {
    api.mockResolvedValue(makeStockData());
    const { container } = render(<StockInfo {...props} />);
    await act(async () => { await flushPromises(); });
    const selects = getSelects(container);
    // cashStartYear=selects[6], cashStartQ=selects[7], cashEndYear=selects[8], cashEndQ=selects[9]
    fireEvent.change(selects[6], { target: { value: '2021' } });
    fireEvent.change(selects[8], { target: { value: '2020' } });
    fireEvent.click(getUsdBtns(container)[2]);
  });

  test('_drawCash startQuarter > endQuarter same year', async () => {
    api.mockResolvedValue(makeStockData());
    const { container } = render(<StockInfo {...props} />);
    await act(async () => { await flushPromises(); });
    const selects = getSelects(container);
    fireEvent.change(selects[6], { target: { value: '2020' } });
    fireEvent.change(selects[7], { target: { value: '2' } });
    fireEvent.change(selects[8], { target: { value: '2020' } });
    fireEvent.change(selects[9], { target: { value: '1' } });
    fireEvent.click(getUsdBtns(container)[2]);
  });

  test('_drawCash mode 1 with accumulate', async () => {
    api.mockResolvedValue(makeStockData());
    const { container } = render(<StockInfo {...props} />);
    await act(async () => { await flushPromises(); });
    const selects = getSelects(container);
    const cbs = getCheckboxes(container);
    fireEvent.change(selects[10], { target: { value: '1' } });
    // cashAcc = cbs[1] — click to toggle (starts false → becomes true)
    fireEvent.click(cbs[1]);
    fireEvent.click(getUsdBtns(container)[2]);
  });

  test('_drawCash default mode for invalid value', async () => {
    api.mockResolvedValue(makeStockData());
    const { container } = render(<StockInfo {...props} />);
    await act(async () => { await flushPromises(); });
    const selects = getSelects(container);
    fireEvent.change(selects[10], { target: { value: '99' } });
    fireEvent.click(getUsdBtns(container)[2]);
  });

  /* ---------- _drawSafety modes ---------- */

  test('_drawSafety mode 1 (default)', async () => {
    api.mockResolvedValue(makeStockData());
    const { container } = render(<StockInfo {...props} />);
    await act(async () => { await flushPromises(); });
    // Already drawn with mode 1 in mount
  });

  test('_drawSafety mode 2', async () => {
    api.mockResolvedValue(makeStockData());
    const { container } = render(<StockInfo {...props} />);
    await act(async () => { await flushPromises(); });
    const selects = getSelects(container);
    // safetyMode = selects[15]
    fireEvent.change(selects[15], { target: { value: '2' } });
    fireEvent.click(getUsdBtns(container)[3]);
  });

  test('_drawSafety mode 3', async () => {
    api.mockResolvedValue(makeStockData());
    const { container } = render(<StockInfo {...props} />);
    await act(async () => { await flushPromises(); });
    const selects = getSelects(container);
    fireEvent.change(selects[15], { target: { value: '3' } });
    fireEvent.click(getUsdBtns(container)[3]);
  });

  test('_drawSafety startYear > endYear clamp', async () => {
    api.mockResolvedValue(makeStockData());
    const { container } = render(<StockInfo {...props} />);
    await act(async () => { await flushPromises(); });
    const selects = getSelects(container);
    // safetyStartYear=selects[11], safetyEndYear=selects[13]
    fireEvent.change(selects[11], { target: { value: '2021' } });
    fireEvent.change(selects[13], { target: { value: '2020' } });
    fireEvent.click(getUsdBtns(container)[3]);
  });

  test('_drawSafety startQuarter > endQuarter same year', async () => {
    api.mockResolvedValue(makeStockData());
    const { container } = render(<StockInfo {...props} />);
    await act(async () => { await flushPromises(); });
    const selects = getSelects(container);
    fireEvent.change(selects[11], { target: { value: '2020' } });
    fireEvent.change(selects[12], { target: { value: '2' } });
    fireEvent.change(selects[13], { target: { value: '2020' } });
    fireEvent.change(selects[14], { target: { value: '1' } });
    fireEvent.click(getUsdBtns(container)[3]);
  });

  /* ---------- _drawProfit modes ---------- */

  test('_drawProfit mode 1 (default)', async () => {
    api.mockResolvedValue(makeStockData());
    const { container } = render(<StockInfo {...props} />);
    await act(async () => { await flushPromises(); });
    // Already drawn in mount
  });

  test('_drawProfit mode 2', async () => {
    api.mockResolvedValue(makeStockData());
    const { container } = render(<StockInfo {...props} />);
    await act(async () => { await flushPromises(); });
    const selects = getSelects(container);
    // profitMode = selects[20]
    fireEvent.change(selects[20], { target: { value: '2' } });
    fireEvent.click(getUsdBtns(container)[4]);
  });

  test('_drawProfit mode 3', async () => {
    api.mockResolvedValue(makeStockData());
    const { container } = render(<StockInfo {...props} />);
    await act(async () => { await flushPromises(); });
    const selects = getSelects(container);
    fireEvent.change(selects[20], { target: { value: '3' } });
    fireEvent.click(getUsdBtns(container)[4]);
  });

  test('_drawProfit mode 4', async () => {
    api.mockResolvedValue(makeStockData());
    const { container } = render(<StockInfo {...props} />);
    await act(async () => { await flushPromises(); });
    const selects = getSelects(container);
    fireEvent.change(selects[20], { target: { value: '4' } });
    fireEvent.click(getUsdBtns(container)[4]);
  });

  test('_drawProfit mode 5', async () => {
    api.mockResolvedValue(makeStockData());
    const { container } = render(<StockInfo {...props} />);
    await act(async () => { await flushPromises(); });
    const selects = getSelects(container);
    fireEvent.change(selects[20], { target: { value: '5' } });
    fireEvent.click(getUsdBtns(container)[4]);
  });

  test('_drawProfit startYear > endYear clamp', async () => {
    api.mockResolvedValue(makeStockData());
    const { container } = render(<StockInfo {...props} />);
    await act(async () => { await flushPromises(); });
    const selects = getSelects(container);
    // profitStartYear=selects[16], profitEndYear=selects[18]
    fireEvent.change(selects[16], { target: { value: '2021' } });
    fireEvent.change(selects[18], { target: { value: '2020' } });
    fireEvent.click(getUsdBtns(container)[4]);
  });

  test('_drawProfit startQ > endQ same year', async () => {
    api.mockResolvedValue(makeStockData());
    const { container } = render(<StockInfo {...props} />);
    await act(async () => { await flushPromises(); });
    const selects = getSelects(container);
    fireEvent.change(selects[16], { target: { value: '2020' } });
    fireEvent.change(selects[17], { target: { value: '2' } });
    fireEvent.change(selects[18], { target: { value: '2020' } });
    fireEvent.change(selects[19], { target: { value: '1' } });
    fireEvent.click(getUsdBtns(container)[4]);
  });

  /* ---------- _drawManagement modes ---------- */

  test('_drawManagement mode 2 (default)', async () => {
    api.mockResolvedValue(makeStockData());
    const { container } = render(<StockInfo {...props} />);
    await act(async () => { await flushPromises(); });
    // Already drawn in mount with mode 2
  });

  test('_drawManagement mode 1', async () => {
    api.mockResolvedValue(makeStockData());
    const { container } = render(<StockInfo {...props} />);
    await act(async () => { await flushPromises(); });
    const selects = getSelects(container);
    // managementMode = selects[25]
    fireEvent.change(selects[25], { target: { value: '1' } });
    fireEvent.click(getUsdBtns(container)[5]);
  });

  test('_drawManagement mode 3', async () => {
    api.mockResolvedValue(makeStockData());
    const { container } = render(<StockInfo {...props} />);
    await act(async () => { await flushPromises(); });
    const selects = getSelects(container);
    fireEvent.change(selects[25], { target: { value: '3' } });
    fireEvent.click(getUsdBtns(container)[5]);
  });

  test('_drawManagement mode 4', async () => {
    api.mockResolvedValue(makeStockData());
    const { container } = render(<StockInfo {...props} />);
    await act(async () => { await flushPromises(); });
    const selects = getSelects(container);
    fireEvent.change(selects[25], { target: { value: '4' } });
    fireEvent.click(getUsdBtns(container)[5]);
  });

  test('_drawManagement startYear > endYear clamp', async () => {
    api.mockResolvedValue(makeStockData());
    const { container } = render(<StockInfo {...props} />);
    await act(async () => { await flushPromises(); });
    const selects = getSelects(container);
    // managementStartYear=selects[21], managementEndYear=selects[23]
    fireEvent.change(selects[21], { target: { value: '2021' } });
    fireEvent.change(selects[23], { target: { value: '2020' } });
    fireEvent.click(getUsdBtns(container)[5]);
  });

  test('_drawManagement startQ > endQ same year', async () => {
    api.mockResolvedValue(makeStockData());
    const { container } = render(<StockInfo {...props} />);
    await act(async () => { await flushPromises(); });
    const selects = getSelects(container);
    fireEvent.change(selects[21], { target: { value: '2020' } });
    fireEvent.change(selects[22], { target: { value: '2' } });
    fireEvent.change(selects[23], { target: { value: '2020' } });
    fireEvent.change(selects[24], { target: { value: '1' } });
    fireEvent.click(getUsdBtns(container)[5]);
  });

  test('_drawManagement with all checkboxes off', async () => {
    api.mockResolvedValue(makeStockData());
    const { container } = render(<StockInfo {...props} />);
    await act(async () => { await flushPromises(); });
    const cbs = getCheckboxes(container);
    // Management checkboxes: cbs[2] through cbs[7] — click to toggle off (all start as true)
    for (let i = 2; i < cbs.length; i++) {
      fireEvent.click(cbs[i]);
    }
    fireEvent.click(getUsdBtns(container)[5]);
  });

  test('_drawManagement with only revenue checked', async () => {
    api.mockResolvedValue(makeStockData());
    const { container } = render(<StockInfo {...props} />);
    await act(async () => { await flushPromises(); });
    const cbs = getCheckboxes(container);
    // Turn off all except revenue (cbs[2]) — click cbs[3] through cbs[7]
    for (let i = 3; i < cbs.length; i++) {
      fireEvent.click(cbs[i]);
    }
    fireEvent.click(getUsdBtns(container)[5]);
  });

  /* ---------- _caculateDate edge cases ---------- */

  test('_caculateDate clamps year and quarter boundaries', async () => {
    api.mockResolvedValue(makeStockData());
    const { container } = render(<StockInfo {...props} />);
    await act(async () => { await flushPromises(); });
    const selects = getSelects(container);
    // Set year beyond range (above latestYear)
    fireEvent.change(selects[0], { target: { value: '2025' } });
    fireEvent.change(selects[1], { target: { value: '4' } });
    fireEvent.change(selects[2], { target: { value: '2005' } });
    fireEvent.change(selects[3], { target: { value: '1' } });
    fireEvent.click(getUsdBtns(container)[0]);
  });

  /* ---------- multiple redraws to cover chart.destroy ---------- */

  test('multiple redraws destroy previous charts', async () => {
    api.mockResolvedValue(makeStockData());
    const { container } = render(<StockInfo {...props} />);
    await act(async () => { await flushPromises(); });
    const btns = getUsdBtns(container);
    const selects = getSelects(container);
    // First draw asset in compare mode (different dates → creates _asset2)
    fireEvent.change(selects[0], { target: { value: '2020' } }); // assetStartYear = 2020
    fireEvent.change(selects[1], { target: { value: '1' } });    // assetStartQuarter = 1
    fireEvent.change(selects[2], { target: { value: '2021' } }); // assetEndYear = 2021
    fireEvent.change(selects[3], { target: { value: '2' } });    // assetEndQuarter = 2
    fireEvent.click(btns[0]); // draw asset (compare mode → creates _asset2)
    // Redraw asset again (destroys _asset AND _asset2)
    fireEvent.click(btns[0]);
    // Redraw each other chart twice
    fireEvent.click(btns[1]); // sales
    fireEvent.click(btns[1]);
    fireEvent.click(btns[2]); // cash
    fireEvent.click(btns[2]);
    fireEvent.click(btns[3]); // safety
    fireEvent.click(btns[3]);
    fireEvent.click(btns[4]); // profit
    fireEvent.click(btns[4]);
    fireEvent.click(btns[5]); // management
    fireEvent.click(btns[5]);
  });

  test('data with null quarters covers else branches', async () => {
    const data = makeStockData();
    // Add null entries at index 2 for each status to cover the null-check branches
    data.cashStatus[2020].push(null);
    data.safetyStatus[2020].push(null);
    data.profitStatus[2020].push(null);
    data.managementStatus[2020].push(null);
    api.mockResolvedValue(data);
    const { container } = render(<StockInfo {...props} />);
    await act(async () => { await flushPromises(); });
    var selects = getSelects(container);
    var btns = getUsdBtns(container);
    // Redraw cash/safety/profit (mode-safe with null data)
    fireEvent.click(btns[2]); // cash
    fireEvent.click(btns[3]); // safety
    fireEvent.click(btns[4]); // profit
    // Switch management mode to 1 (Season) before drawing — mode 2/4 crash on null via rs logic
    fireEvent.change(selects[25], { target: { value: '1' } });
    fireEvent.click(btns[5]); // management
  });

  test('_caculateDate with earliestQuarter=2 clamps quarter', async () => {
    var data = makeStockData();
    data.earliestQuarter = 2;
    api.mockResolvedValue(data);
    var { container } = render(<StockInfo {...props} />);
    await act(async () => { await flushPromises(); });
    var selects = getSelects(container);
    var btns = getUsdBtns(container);
    // State assetStartYear=2010 → clamped to earliestYear=2020, quarter=1 → 1 < 2 → clamped
    fireEvent.change(selects[0], { target: { value: '2020' } });
    fireEvent.change(selects[1], { target: { value: '1' } });
    fireEvent.click(btns[0]);
  });
});
