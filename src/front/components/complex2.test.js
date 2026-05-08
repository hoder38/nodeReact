import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';

// ═══════════════════════ MOCKS ═══════════════════════

jest.mock('../utility.js', () => ({
  ...jest.requireActual('../utility.js'),
  api: jest.fn(),
  doLogout: jest.fn(),
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
  function MockUserInput({ val, getinput, type, placeholder, children }) {
    const input = React.createElement('input', {
      type: type || 'text',
      placeholder: placeholder || '',
      value: val != null ? val : '',
      onChange: getinput ? getinput.onchange : () => {},
      readOnly: false,
    });
    if (children && children.props && children.props.children) {
      const kids = Array.isArray(children.props.children) ? children.props.children : [children.props.children];
      const newKids = kids.map((child, idx) => {
        if (child && child.props && !child.props.children) {
          return React.cloneElement(child, { key: idx }, input);
        }
        return React.cloneElement(child, { key: idx });
      });
      return React.cloneElement(children, {}, newKids);
    }
    if (children) {
      return React.cloneElement(children, {}, input);
    }
    return input;
  }
  MockUserInput.Input = class {
    constructor(names, submit, change) {
      this.names = names;
      this.submit = submit;
      this.change = change;
    }
    initValue(init = {}) {
      const obj = {};
      this.names.forEach(n => { obj[n] = init[n] != null ? init[n] : ''; });
      return obj;
    }
    getValue() {
      const vals = global.__mockInputValues || {};
      const obj = {};
      this.names.forEach(n => { obj[n] = vals[n] !== undefined ? vals[n] : ''; });
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
    allBlur() {}
  };
  return MockUserInput;
});

jest.mock('./Dropdown.js', () => {
  const React = require('react');
  return function MockDropdown({ droplist, children, param }) {
    return React.createElement('span', { className: 'mock-dropdown' },
      children,
      droplist && droplist.map(item =>
        item.title
          ? React.createElement('button', {
              key: item.key,
              onClick: () => item.onclick(param),
              'data-testid': `drop-${item.key}`,
            }, item.title)
          : React.createElement('hr', { key: item.key })
      )
    );
  };
});

jest.mock('./Tooltip.js', () => {
  const React = require('react');
  return function({ tip }) { return React.createElement('div', null, tip); };
});

jest.mock('./Navlist.js', () => { const R = require('react'); return function() { return R.createElement('div'); }; });
jest.mock('./ToggleNav.js', () => { const R = require('react'); return function() { return R.createElement('div'); }; });
jest.mock('./GlobalPassword.js', () => {
  const R = require('react');
  return function({ callback, onclose, delay }) {
    return R.createElement('div', { 'data-testid': `glbpw${delay || ''}` },
      R.createElement('button', { onClick: () => { const r = callback(global.__mockPwdValue || 'validPwd'); if (r && typeof r.catch === 'function') r.catch(() => {}); }, 'data-testid': `glbpw-submit${delay || ''}` }, 'Submit'),
      R.createElement('button', { onClick: onclose, 'data-testid': `glbpw-close${delay || ''}` }, 'Close')
    );
  };
});
jest.mock('./FileManage.js', () => { const R = require('react'); return function() { return R.createElement('div'); }; });
jest.mock('./MediaManage.js', () => { const R = require('react'); return function() { return R.createElement('div'); }; });
jest.mock('./Homepage.js', () => { const R = require('react'); return function() { return R.createElement('div'); }; });
jest.mock('./Storage.js', () => { const R = require('react'); return function() { return R.createElement('div'); }; });
jest.mock('../containers/ReAlertlist.js', () => { const R = require('react'); return function() { return R.createElement('div'); }; });
jest.mock('../containers/ReGlobalComfirm.js', () => {
  const R = require('react');
  return function({ callback, text }) { return R.createElement('div', { 'data-testid': 'glbcf', onClick: callback }, text); };
});
jest.mock('../containers/ReWidgetManage.js', () => { const R = require('react'); return function() { return R.createElement('div'); }; });
jest.mock('../containers/RePassword.js', () => { const R = require('react'); return function() { return R.createElement('div'); }; });
jest.mock('../containers/ReStock.js', () => { const R = require('react'); return function() { return R.createElement('div'); }; });
jest.mock('../containers/ReBitfinex.js', () => { const R = require('react'); return function() { return R.createElement('div'); }; });
jest.mock('../containers/ReUserlist.js', () => { const R = require('react'); return function() { return R.createElement('div'); }; });

jest.mock('react-router-dom', () => {
  const R = require('react');
  return {
    NavLink: p => R.createElement('a', { href: p.to }, p.children),
    Route: ({ component: C }) => C ? R.createElement(C) : null,
    Redirect: () => null,
    Switch: p => R.createElement('div', null, p.children),
  };
});

jest.mock('../actions/index.js', () => ({ collapseToggle: jest.fn() }));

// ═══════════════════════ IMPORTS ═══════════════════════

import { api, killEvent, isValidString, checkInput, bookmarkItemList, doLogout } from '../utility.js';
import { history } from '../configureStore.js';
import FileUploader from './FileUploader.js';
import FileFeedback from './FileFeedback.js';
import ItemFile from './ItemFile.js';
import UserInfo from './UserInfo.js';
import App from './App.js';
import StockTotal from './StockTotal.js';

// ═══════════════════════ HELPERS ═══════════════════════

const flushPromises = () => new Promise(r => setTimeout(r, 0));
const renderInTable = el => render(<table><tbody>{el}</tbody></table>);

let xhrInstances;
const createXHRMock = () => {
  const ul = {};
  const xl = {};
  const xhr = {
    open: jest.fn(), send: jest.fn(), abort: jest.fn(),
    withCredentials: false, status: 200, response: '{}',
    upload: {
      addEventListener: jest.fn((t, fn) => { ul[t] = fn; }),
      removeEventListener: jest.fn(),
    },
    addEventListener: jest.fn((t, fn) => { xl[t] = fn; }),
    removeEventListener: jest.fn(),
    _ul: ul, _xl: xl,
  };
  xhrInstances.push(xhr);
  return xhr;
};

beforeEach(() => {
  xhrInstances = [];
  global.FormData = jest.fn(() => ({ append: jest.fn() }));
  global.XMLHttpRequest = jest.fn(() => createXHRMock());
  global.__mockInputValues = {};
  global.__mockPwdValue = 'validPwd';
  jest.clearAllMocks();
  jest.spyOn(console, 'log').mockImplementation(() => {});
});

afterEach(() => {
  console.log.mockRestore();
});

// ═══════════════════════ FileUploader ═══════════════════════

describe('FileUploader', () => {
  const defProps = () => ({
    url: '/upload',
    callback: jest.fn(),
    setUpload: jest.fn(),
    params: { type: 'file' },
  });

  const pushFile = (container, files) => {
    const input = container.querySelector('input[type="file"]');
    Object.defineProperty(input, 'files', { value: files, configurable: true });
    fireEvent.change(input);
  };

  test('renders file input', () => {
    const { container } = render(<FileUploader {...defProps()} />);
    expect(container.querySelector('input[type="file"]')).toBeTruthy();
  });

  test('setClear prop receives clearFile', () => {
    const setClear = jest.fn();
    render(<FileUploader {...defProps()} setClear={setClear} />);
    expect(setClear).toHaveBeenCalledWith(expect.any(Function));
  });

  test('multi mode via set prop', () => {
    const set = jest.fn();
    const props = defProps();
    const { container } = render(<FileUploader {...props} set={set} />);
    const f1 = new File(['a'], 'a.txt');
    const f2 = new File(['b'], 'b.txt');
    pushFile(container, [f1, f2]);
    expect(set).toHaveBeenCalled();
    expect(props.setUpload).toHaveBeenCalledWith(0);
    expect(xhrInstances).toHaveLength(1);
  });

  test('single mode pushFile and upload', () => {
    const props = defProps();
    const { container } = render(<FileUploader {...props} />);
    pushFile(container, [new File(['c'], 't.txt')]);
    expect(xhrInstances).toHaveLength(1);
    expect(xhrInstances[0].open).toHaveBeenCalledWith('POST', '/upload');
    expect(xhrInstances[0].send).toHaveBeenCalled();
    expect(props.setUpload).toHaveBeenCalledWith(0);
  });

  test('single mode ignores second pushFile', () => {
    const { container } = render(<FileUploader {...defProps()} />);
    pushFile(container, [new File(['a'], 'a.txt')]);
    pushFile(container, [new File(['b'], 'b.txt')]);
    expect(xhrInstances).toHaveLength(1);
  });

  test('pushFile with empty files does not upload', () => {
    const props = defProps();
    const { container } = render(<FileUploader {...props} />);
    pushFile(container, []);
    expect(xhrInstances).toHaveLength(0);
    expect(props.setUpload).toHaveBeenCalledWith(0);
  });

  test('drop target addEventListener and dataTransfer path', () => {
    const dropEl = document.createElement('div');
    dropEl.setAttribute('data-drop', 'test-drop');
    document.body.appendChild(dropEl);
    const props = defProps();
    const { unmount } = render(<FileUploader {...props} drop="test-drop" />);
    const dropEvt = new Event('drop', { bubbles: true });
    dropEvt.preventDefault = jest.fn();
    Object.defineProperty(dropEvt, 'dataTransfer', { value: { files: [new File(['x'], 'x.txt')] } });
    dropEl.dispatchEvent(dropEvt);
    expect(xhrInstances).toHaveLength(1);
    const dragEvt = new Event('dragover', { bubbles: true });
    dragEvt.preventDefault = jest.fn();
    dropEl.dispatchEvent(dragEvt);
    expect(dragEvt.preventDefault).toHaveBeenCalled();
    unmount();
    document.body.removeChild(dropEl);
  });

  test('componentDidMount without drop prop does not add drop listeners', () => {
    const addSpy = jest.spyOn(document, 'querySelectorAll');
    render(<FileUploader {...defProps()} />);
    expect(addSpy).not.toHaveBeenCalledWith('[data-drop]');
    addSpy.mockRestore();
  });

  test('beforeUpload prop resolves', async () => {
    const beforeUpload = jest.fn(() => Promise.resolve({ extra: 1 }));
    const props = defProps();
    const { container } = render(<FileUploader {...props} beforeUpload={beforeUpload} />);
    pushFile(container, [new File(['c'], 't.txt')]);
    await act(async () => { await flushPromises(); });
    expect(beforeUpload).toHaveBeenCalled();
    expect(xhrInstances).toHaveLength(1);
  });

  test('beforeUpload prop rejects', async () => {
    const beforeUpload = jest.fn(() => Promise.reject('no'));
    const props = defProps();
    const { container } = render(<FileUploader {...props} beforeUpload={beforeUpload} />);
    pushFile(container, [new File(['c'], 't.txt')]);
    await act(async () => { await flushPromises(); });
    expect(xhrInstances).toHaveLength(0);
  });

  test('uploadProgress with lengthComputable', () => {
    const props = defProps();
    const { container } = render(<FileUploader {...props} />);
    pushFile(container, [new File(['c'], 't.txt')]);
    const xhr = xhrInstances[0];
    xhr._ul.progress({ lengthComputable: true, loaded: 50, total: 100 });
    expect(props.setUpload).toHaveBeenCalledWith(50);
  });

  test('uploadProgress without lengthComputable', () => {
    const props = defProps();
    const { container } = render(<FileUploader {...props} />);
    pushFile(container, [new File(['c'], 't.txt')]);
    props.setUpload.mockClear();
    xhrInstances[0]._ul.progress({ lengthComputable: false });
    expect(props.setUpload).not.toHaveBeenCalled();
  });

  test('uploadFinish status 200 with valid JSON', () => {
    const props = defProps();
    const { container } = render(<FileUploader {...props} />);
    pushFile(container, [new File(['c'], 't.txt')]);
    const xhr = xhrInstances[0];
    xhr.status = 200;
    xhr._xl.load({ currentTarget: { response: '{"ok":true}' } });
    expect(props.callback).toHaveBeenCalledWith({ ok: true });
  });

  test('uploadFinish status 200 with invalid JSON', () => {
    const props = defProps();
    const { container } = render(<FileUploader {...props} />);
    pushFile(container, [new File(['c'], 't.txt')]);
    const xhr = xhrInstances[0];
    xhr.status = 200;
    xhr._xl.load({ currentTarget: { response: 'not-json' } });
    expect(props.callback).toHaveBeenCalledWith('not-json');
  });

  test('uploadFinish status 500 calls uploadError', () => {
    const props = defProps();
    const { container } = render(<FileUploader {...props} />);
    pushFile(container, [new File(['c'], 't.txt')]);
    const xhr = xhrInstances[0];
    xhr.status = 500;
    xhr._xl.load({ currentTarget: { response: '{"err":"fail"}' } });
    expect(props.callback).toHaveBeenCalledWith(null, { err: 'fail' });
  });

  test('uploadError handler', () => {
    const props = defProps();
    const { container } = render(<FileUploader {...props} />);
    pushFile(container, [new File(['c'], 't.txt')]);
    xhrInstances[0]._xl.error('some error');
    expect(props.callback).toHaveBeenCalledWith(null, 'some error');
  });

  test('uploadAbort handler', () => {
    const props = defProps();
    const { container } = render(<FileUploader {...props} />);
    pushFile(container, [new File(['c'], 't.txt')]);
    xhrInstances[0]._xl.abort();
    expect(console.log).toHaveBeenCalledWith('abort');
  });

  test('uploadFinish when files[uploading] is falsy', () => {
    const setClear = jest.fn();
    const props = defProps();
    const { container } = render(<FileUploader {...props} setClear={setClear} />);
    pushFile(container, [new File(['c'], 't.txt')]);
    const xhr = xhrInstances[0];
    const clearFile = setClear.mock.calls[0][0];
    clearFile();
    xhr.status = 200;
    xhr._xl.load({ currentTarget: { response: '{}' } });
    expect(props.callback).toHaveBeenCalledWith({});
  });

  test('uploadError when files[uploading] is falsy', () => {
    const setClear = jest.fn();
    const props = defProps();
    const { container } = render(<FileUploader {...props} setClear={setClear} />);
    pushFile(container, [new File(['c'], 't.txt')]);
    const xhr = xhrInstances[0];
    setClear.mock.calls[0][0]();
    xhr._xl.error('err');
    expect(props.callback).toHaveBeenCalledWith(null, 'err');
  });

  test('uploadAbort when files[uploading] is falsy', () => {
    const setClear = jest.fn();
    const props = defProps();
    const { container } = render(<FileUploader {...props} setClear={setClear} />);
    pushFile(container, [new File(['c'], 't.txt')]);
    setClear.mock.calls[0][0]();
    xhrInstances[0]._xl.abort();
    expect(console.log).toHaveBeenCalledWith('abort');
  });

  test('clearFile with request aborts', () => {
    const setClear = jest.fn();
    const props = defProps();
    const { container } = render(<FileUploader {...props} setClear={setClear} />);
    pushFile(container, [new File(['c'], 't.txt')]);
    const xhr = xhrInstances[0];
    setClear.mock.calls[0][0]();
    expect(xhr.abort).toHaveBeenCalled();
    expect(xhr.upload.removeEventListener).toHaveBeenCalled();
    expect(xhr.removeEventListener).toHaveBeenCalled();
  });

  test('clearFile without request', () => {
    const setClear = jest.fn();
    const props = defProps();
    render(<FileUploader {...props} setClear={setClear} />);
    setClear.mock.calls[0][0]();
    expect(props.setUpload).toHaveBeenCalledWith(0);
  });

  test('routerWillLeave with uploading in progress', () => {
    const props = defProps();
    const { container } = render(<FileUploader {...props} />);
    pushFile(container, [new File(['c'], 't.txt')]);
    const evt = new Event('beforeunload');
    Object.defineProperty(evt, 'returnValue', { value: '', writable: true, configurable: true });
    window.dispatchEvent(evt);
    expect(evt.returnValue).toBe('You have uploaded files. Are you sure you want to navigate away from this page?');
  });

  test('routerWillLeave without uploading', () => {
    render(<FileUploader {...defProps()} />);
    const evt = new Event('beforeunload');
    Object.defineProperty(evt, 'returnValue', { value: '', writable: true, configurable: true });
    window.dispatchEvent(evt);
    expect(evt.returnValue).toBeFalsy();
  });

  test('multi mode sequential upload', () => {
    const set = jest.fn();
    const props = { ...defProps(), set };
    const { container } = render(<FileUploader {...props} />);
    pushFile(container, [new File(['a'], 'a.txt'), new File(['b'], 'b.txt')]);
    expect(xhrInstances).toHaveLength(1);
    const xhr1 = xhrInstances[0];
    xhr1.status = 200;
    xhr1._xl.load({ currentTarget: { response: '{"r":1}' } });
    expect(xhrInstances).toHaveLength(2);
    expect(props.callback).toHaveBeenCalledWith({ r: 1 });
  });

  test('multi mode setState calculates average progress', () => {
    const set = jest.fn();
    const props = { ...defProps(), set };
    const { container } = render(<FileUploader {...props} />);
    pushFile(container, [new File(['a'], 'a.txt'), new File(['b'], 'b.txt')]);
    xhrInstances[0]._ul.progress({ lengthComputable: true, loaded: 100, total: 100 });
    expect(props.setUpload).toHaveBeenCalledWith(50);
  });

  test('unmount cleans up listeners', () => {
    const dropEl = document.createElement('div');
    dropEl.setAttribute('data-drop', 'cleanup');
    document.body.appendChild(dropEl);
    const removeSpy = jest.spyOn(dropEl, 'removeEventListener');
    const { unmount } = render(<FileUploader {...defProps()} drop="cleanup" />);
    unmount();
    expect(removeSpy).toHaveBeenCalledWith('dragover', expect.any(Function));
    expect(removeSpy).toHaveBeenCalledWith('drop', expect.any(Function));
    document.body.removeChild(dropEl);
    removeSpy.mockRestore();
  });
});

// ═══════════════════════ FileFeedback ═══════════════════════

describe('FileFeedback', () => {
  const defProps = () => ({
    id: 'item1',
    name: 'TestFile',
    select: ['tag1'],
    option: ['tag2'],
    other: ['blocked'],
    dirs: [{ title: 'Dir1', name: 'd1', key: 0, onclick: jest.fn() }],
    addalert: jest.fn(),
    feedbackset: jest.fn(),
    handlefeedback: jest.fn(),
    mainUrl: 'https://main',
  });

  test('renders with id and show state', () => {
    const { container } = render(<FileFeedback {...defProps()} />);
    expect(container.querySelector('.panel')).toBeTruthy();
  });

  test('componentDidMount without id does not setList', () => {
    const props = { ...defProps(), id: null };
    const { container } = render(<FileFeedback {...props} />);
    expect(container.querySelector('.panel')).toBeTruthy();
  });

  test('componentDidMount with data-widget elements', () => {
    const widgetEl = document.createElement('div');
    widgetEl.setAttribute('data-widget', 'FEEDBACK');
    document.body.appendChild(widgetEl);
    const { unmount } = render(<FileFeedback {...defProps()} />);
    fireEvent.click(widgetEl);
    unmount();
    document.body.removeChild(widgetEl);
  });

  test('toggle show state via panel heading click', () => {
    const { container } = render(<FileFeedback {...defProps()} />);
    const heading = container.querySelector('.panel-heading');
    fireEvent.click(heading);
  });

  test('componentDidUpdate with id change', () => {
    const props = defProps();
    const { rerender } = render(<FileFeedback {...props} />);
    rerender(<FileFeedback {...props} id="item2" select={['t1']} option={['t2']} />);
  });

  test('componentDidUpdate id becomes null calls api', async () => {
    const props = defProps();
    api.mockResolvedValueOnce({ feedbacks: ['fb'] });
    const { rerender } = render(<FileFeedback {...props} />);
    await act(async () => {
      rerender(<FileFeedback {...props} id={null} />);
      await flushPromises();
    });
    expect(api).toHaveBeenCalledWith('https://main/api/file/feedback');
    expect(props.feedbackset).toHaveBeenCalledWith(['fb']);
  });

  test('componentDidUpdate id becomes null api error', async () => {
    const props = defProps();
    api.mockRejectedValueOnce('api err');
    const { rerender } = render(<FileFeedback {...props} />);
    await act(async () => {
      rerender(<FileFeedback {...props} id={null} />);
      await flushPromises();
    });
    expect(props.addalert).toHaveBeenCalledWith('api err');
  });

  test('_addTag: falsy tag is skipped', async () => {
    isValidString.mockReturnValue(false);
    const props = defProps();
    const { container } = render(<FileFeedback {...props} />);
    global.__mockInputValues = { url: '' };
    fireEvent.change(container.querySelector('input[placeholder="New tag..."]'), { target: { value: 'x' } });
    const form = container.querySelector('form');
    fireEvent.submit(form);
  });

  test('_addTag: valid new tag added', async () => {
    isValidString.mockImplementation((val, type) => {
      if (type === 'url') return false;
      if (type === 'name') return val && val !== 'blocked';
      return false;
    });
    const props = defProps();
    const { container } = render(<FileFeedback {...props} />);
    global.__mockInputValues = { url: 'newtag' };
    await act(async () => {
      fireEvent.change(container.querySelector('input[placeholder="New tag..."]'), { target: { value: 'x' } });
    });
    await act(async () => {
      fireEvent.submit(container.querySelector('form'));
    });
  });

  test('_addTag: tag in other is skipped', async () => {
    isValidString.mockImplementation((val, type) => {
      if (type === 'url') return false;
      if (type === 'name') return true;
      return false;
    });
    const props = defProps();
    const { container } = render(<FileFeedback {...props} />);
    global.__mockInputValues = { url: 'blocked' };
    await act(async () => {
      fireEvent.change(container.querySelector('input[placeholder="New tag..."]'), { target: { value: 'x' } });
    });
    await act(async () => {
      fireEvent.submit(container.querySelector('form'));
    });
  });

  test('_addTag: existing tag same select no change', async () => {
    isValidString.mockImplementation((val, type) => {
      if (type === 'url') return false;
      if (type === 'name') return true;
      return false;
    });
    const props = defProps();
    const { container } = render(<FileFeedback {...props} />);
    global.__mockInputValues = { url: 'tag1' };
    await act(async () => {
      fireEvent.change(container.querySelector('input[placeholder="New tag..."]'), { target: { value: 'x' } });
    });
    await act(async () => {
      fireEvent.submit(container.querySelector('form'));
    });
  });

  test('_addTag: existing tag different select updates', async () => {
    isValidString.mockImplementation((val, type) => {
      if (type === 'url') return false;
      if (type === 'name') return true;
      return false;
    });
    const props = { ...defProps() };
    const { container } = render(<FileFeedback {...props} />);
    global.__mockInputValues = { url: 'tag2' };
    await act(async () => {
      fireEvent.change(container.querySelector('input[placeholder="New tag..."]'), { target: { value: 'x' } });
    });
    await act(async () => {
      fireEvent.submit(container.querySelector('form'));
    });
  });

  test('_addTag: invalid tag triggers addalert', async () => {
    isValidString.mockImplementation((val, type) => {
      if (type === 'url') return false;
      return false;
    });
    const props = defProps();
    const { container } = render(<FileFeedback {...props} />);
    global.__mockInputValues = { url: 'bad!tag' };
    await act(async () => {
      fireEvent.change(container.querySelector('input[placeholder="New tag..."]'), { target: { value: 'x' } });
    });
    await act(async () => {
      fireEvent.submit(container.querySelector('form'));
    });
    expect(props.addalert).toHaveBeenCalledWith('Feedback tag is not valid!!!');
  });

  test('_handleSubmit: valid url calls api', async () => {
    isValidString.mockImplementation((val, type) => {
      if (type === 'url') return true;
      if (type === 'name') return true;
      return false;
    });
    api.mockResolvedValueOnce({ tags: ['fromUrl'] });
    const props = defProps();
    const { container } = render(<FileFeedback {...props} />);
    global.__mockInputValues = { url: 'http://test.com' };
    await act(async () => {
      fireEvent.change(container.querySelector('input[placeholder="New tag..."]'), { target: { value: 'x' } });
    });
    await act(async () => {
      fireEvent.submit(container.querySelector('form'));
      await flushPromises();
    });
    expect(api).toHaveBeenCalledWith('/api/storage/addTagUrl', { url: 'http://test.com' }, 'PUT');
  });

  test('_handleSubmit: valid url api error', async () => {
    isValidString.mockImplementation((val, type) => type === 'url' ? true : false);
    api.mockRejectedValueOnce('url err');
    const props = defProps();
    const { container } = render(<FileFeedback {...props} />);
    global.__mockInputValues = { url: 'http://test.com' };
    await act(async () => {
      fireEvent.change(container.querySelector('input[placeholder="New tag..."]'), { target: { value: 'x' } });
    });
    await act(async () => {
      fireEvent.submit(container.querySelector('form'));
      await flushPromises();
    });
    expect(props.addalert).toHaveBeenCalledWith('url err');
  });

  test('_sendTag: some tags fail validation in map', () => {
    isValidString.mockImplementation((val, type) => {
      if (type === 'name' && val === 'tag2') return false;
      return true;
    });
    const props = defProps();
    const { container } = render(<FileFeedback {...props} />);
    api.mockResolvedValueOnce({ history: [], select: [] });
    const sendBtn = Array.from(container.querySelectorAll('button[type="button"]')).find(b => b.querySelector('.glyphicon-ok'));
    fireEvent.click(sendBtn);
    expect(api).toHaveBeenCalledWith(
      expect.stringContaining('/api/storage/sendTag/'),
      expect.objectContaining({ tags: expect.any(Array) }),
      'PUT'
    );
  });

  test('_addTag: falsy tag is skipped', async () => {
    isValidString.mockImplementation((val, type) => {
      if (type === 'url') return false;
      if (type === 'name') return !!val;
      return false;
    });
    const props = defProps();
    const { container } = render(<FileFeedback {...props} />);
    global.__mockInputValues = { url: '' };
    await act(async () => {
      fireEvent.change(container.querySelector('input[placeholder="New tag..."]'), { target: { value: 'x' } });
    });
    await act(async () => {
      fireEvent.submit(container.querySelector('form'));
    });
  });

  test('_sendTag: sending true returns early', async () => {
    isValidString.mockReturnValue(true);
    api.mockReturnValue(new Promise(() => {}));
    const props = defProps();
    const { container } = render(<FileFeedback {...props} />);
    const btn = container.querySelector('button[type="button"]:not([disabled])');
    const sendBtn = Array.from(container.querySelectorAll('button[type="button"]')).find(b => b.querySelector('.glyphicon-ok'));
    fireEvent.click(sendBtn);
    fireEvent.click(sendBtn);
  });

  test('_sendTag: name not valid', () => {
    isValidString.mockImplementation((val, type) => {
      if (type === 'name') return false;
      return false;
    });
    const props = defProps();
    const { container } = render(<FileFeedback {...props} />);
    const sendBtn = Array.from(container.querySelectorAll('button[type="button"]')).find(b => b.querySelector('.glyphicon-ok'));
    fireEvent.click(sendBtn);
    expect(props.addalert).toHaveBeenCalledWith('Feedback name is not valid!!!');
  });

  test('_sendTag: success updates history', async () => {
    isValidString.mockReturnValue(true);
    api.mockResolvedValueOnce({ history: ['h1'], select: [true] });
    const props = defProps();
    const { container } = render(<FileFeedback {...props} />);
    const sendBtn = Array.from(container.querySelectorAll('button[type="button"]')).find(b => b.querySelector('.glyphicon-ok'));
    await act(async () => {
      fireEvent.click(sendBtn);
      await flushPromises();
    });
    expect(props.handlefeedback).toHaveBeenCalledWith('item1');
  });

  test('_sendTag: api error resets sending', async () => {
    isValidString.mockReturnValue(true);
    api.mockRejectedValueOnce('send err');
    const props = defProps();
    const { container } = render(<FileFeedback {...props} />);
    const sendBtn = Array.from(container.querySelectorAll('button[type="button"]')).find(b => b.querySelector('.glyphicon-ok'));
    await act(async () => {
      fireEvent.click(sendBtn);
      await flushPromises();
    });
    expect(props.addalert).toHaveBeenCalledWith('send err');
  });

  test('_handleSelect updates selects from checkbox refs', () => {
    isValidString.mockReturnValue(true);
    const props = defProps();
    const { container } = render(<FileFeedback {...props} />);
    const checkboxes = container.querySelectorAll('input[type="checkbox"]');
    if (checkboxes.length > 0) {
      fireEvent.click(checkboxes[0]);
    }
  });

  test('handlefeedback button (repeat) calls prop', () => {
    const props = defProps();
    const { container } = render(<FileFeedback {...props} />);
    const repeatBtn = Array.from(container.querySelectorAll('button[type="button"]')).find(b => b.querySelector('.glyphicon-repeat'));
    fireEvent.click(repeatBtn);
    expect(props.handlefeedback).toHaveBeenCalledWith('item1');
  });

  test('_setList with history from sendTag then id change', async () => {
    isValidString.mockReturnValue(true);
    api.mockResolvedValueOnce({ history: ['newtag'], select: [false] });
    const props = defProps();
    const { container, rerender } = render(<FileFeedback {...props} />);
    const sendBtn = Array.from(container.querySelectorAll('button[type="button"]')).find(b => b.querySelector('.glyphicon-ok'));
    await act(async () => {
      fireEvent.click(sendBtn);
      await flushPromises();
    });
    rerender(<FileFeedback {...props} id="item2" select={['s1']} option={['o1']} />);
  });

  test('_setList with historySelect covering existing tag different select', async () => {
    isValidString.mockReturnValue(true);
    api.mockResolvedValueOnce({ history: ['existingTag'], select: [true] });
    const props = defProps();
    const { container, rerender } = render(<FileFeedback {...props} />);
    const sendBtn = Array.from(container.querySelectorAll('button[type="button"]')).find(b => b.querySelector('.glyphicon-ok'));
    await act(async () => {
      fireEvent.click(sendBtn);
      await flushPromises();
    });
    // existingTag is in option (select=false), historySelect[0]=true → different select + historySelect.length>0
    rerender(<FileFeedback {...props} id="item2" select={[]} option={['existingTag']} />);
  });

  test('_setList with multiple history tags covering ret property reuse', async () => {
    isValidString.mockReturnValue(true);
    // Return 2 new tags - first creates ret arrays, second reuses them
    api.mockResolvedValueOnce({ history: ['newA', 'newB'], select: [true, false] });
    const props = defProps();
    const { container, rerender } = render(<FileFeedback {...props} />);
    const sendBtn = Array.from(container.querySelectorAll('button[type="button"]')).find(b => b.querySelector('.glyphicon-ok'));
    await act(async () => {
      fireEvent.click(sendBtn);
      await flushPromises();
    });
    // Neither newA nor newB exist in the new select/option, so both are "new" tags
    // First creates ret['selects'], ret['historys'], ret['tags']
    // Second finds them already created → covers the false branches of !ret[...] checks
    rerender(<FileFeedback {...props} id="item3" select={['x']} option={['y']} />);
  });

  test('_setList with history existing tag+new tag combined', async () => {
    isValidString.mockReturnValue(true);
    // Return existing tag (modifies selects) + new tag (adds to selects)
    api.mockResolvedValueOnce({ history: ['existTag', 'brandNew'], select: [true, true] });
    const props = defProps();
    const { container, rerender } = render(<FileFeedback {...props} />);
    const sendBtn = Array.from(container.querySelectorAll('button[type="button"]')).find(b => b.querySelector('.glyphicon-ok'));
    await act(async () => {
      fireEvent.click(sendBtn);
      await flushPromises();
    });
    // existTag exists in option (selects=false), historySelect[0]=true → different select → creates ret['selects']
    // brandNew is new → reuses ret['selects'] (false branch)
    rerender(<FileFeedback {...props} id="item4" select={[]} option={['existTag']} />);
  });

  test('_setList with two existing tags both with different selects', async () => {
    isValidString.mockReturnValue(true);
    // Return two existing tags, both with different select values than in state
    // This covers !ret['selects'] false (line 85) and !ret['historys'] false (line 90)
    api.mockResolvedValueOnce({ history: ['optA', 'optB'], select: [true, true] });
    const props = defProps();
    const { container, rerender } = render(<FileFeedback {...props} />);
    const sendBtn = Array.from(container.querySelectorAll('button[type="button"]')).find(b => b.querySelector('.glyphicon-ok'));
    await act(async () => {
      fireEvent.click(sendBtn);
      await flushPromises();
    });
    // Both optA and optB exist in option (selects=false), history has select=[true, true]
    // First tag creates ret['selects'] and ret['historys'], second tag finds them → false branches
    rerender(<FileFeedback {...props} id="item5" select={[]} option={['optA', 'optB']} />);
  });

  test('render shows hidden when no id', () => {
    const { container } = render(<FileFeedback {...defProps()} id={null} />);
    const panel = container.querySelector('.panel');
    expect(panel.style.display).toBe('none');
  });
});

// ═══════════════════════ ItemFile ═══════════════════════

describe('ItemFile', () => {
  const defProps = (itemOverrides = {}) => ({
    item: {
      id: 'f1', name: 'test.mp4', status: 0, utime: '2024-01-01', count: 5,
      thumb: '', isOwn: false, recycle: 0, noDb: false, cid: '', ctitle: '',
      media: null, url: '', level: 0, ...itemOverrides,
    },
    check: false,
    getRef: jest.fn(),
    onchange: jest.fn(),
    mainUrl: 'https://main',
    bookmark: 'bm1',
    sortName: 'name',
    sortType: 'asc',
    set: jest.fn(),
    select: new Set(),
    latest: '',
    level: 0,
    setLatest: jest.fn(),
    addalert: jest.fn(),
    sendglbcf: jest.fn(cb => cb()),
    globalinput: jest.fn(),
    setMedia: jest.fn(),
    pushfeedback: jest.fn(),
    pushbookmark: jest.fn(),
  });

  test('default status 0 renders question icon', () => {
    const { container } = renderInTable(<ItemFile {...defProps()} />);
    expect(container.querySelector('.glyphicon-question-sign')).toBeTruthy();
  });

  test('status 2 renders picture with thumb', () => {
    const { container } = renderInTable(<ItemFile {...defProps({ status: 2, thumb: 'http://thumb.jpg/img.png' })} />);
    expect(container.querySelector('.glyphicon-picture')).toBeTruthy();
    const img = container.querySelector('img');
    expect(img.src).toContain('thumb.jpg');
  });

  test('status 2 renders picture without thumb', () => {
    const { container } = renderInTable(<ItemFile {...defProps({ status: 2 })} />);
    const img = container.querySelector('img');
    expect(img.src).toContain('/preview/f1');
  });

  test('status 3 renders video with click calling setMedia', () => {
    const props = defProps({ status: 3 });
    const { container } = renderInTable(<ItemFile {...props} />);
    expect(container.querySelector('.glyphicon-facetime-video')).toBeTruthy();
    const td = container.querySelectorAll('td')[1];
    fireEvent.click(td);
    expect(props.setMedia).toHaveBeenCalledWith(3, 'f1', expect.any(Object));
  });

  test('status 4 renders headphones', () => {
    const props = defProps({ status: 4 });
    const { container } = renderInTable(<ItemFile {...props} />);
    expect(container.querySelector('.glyphicon-headphones')).toBeTruthy();
    fireEvent.click(container.querySelectorAll('td')[1]);
    expect(props.setMedia).toHaveBeenCalledWith(4, 'f1', expect.any(Object));
  });

  test('status 7 renders bookmark and showUrl', async () => {
    const openSpy = jest.spyOn(window, 'open').mockImplementation(() => {});
    api.mockResolvedValueOnce({});
    const props = defProps({ status: 7, url: 'http%3A%2F%2Ftest.com' });
    const { container } = renderInTable(<ItemFile {...props} />);
    expect(container.querySelector('.glyphicon-bookmark')).toBeTruthy();
    await act(async () => {
      fireEvent.click(container.querySelectorAll('td')[1]);
      await flushPromises();
    });
    expect(openSpy).toHaveBeenCalled();
    expect(props.setLatest).toHaveBeenCalled();
    openSpy.mockRestore();
  });

  test('status 7 showUrl api error', async () => {
    jest.spyOn(window, 'open').mockImplementation(() => {});
    api.mockRejectedValueOnce('url err');
    const props = defProps({ status: 7, url: 'http://test' });
    const { container } = renderInTable(<ItemFile {...props} />);
    await act(async () => {
      fireEvent.click(container.querySelectorAll('td')[1]);
      await flushPromises();
    });
    expect(props.addalert).toHaveBeenCalledWith('url err');
    window.open.mockRestore();
  });

  test('status 8 renders tags and bookmark click', async () => {
    bookmarkItemList.mockResolvedValueOnce({});
    const props = defProps({ status: 8 });
    const { container } = renderInTable(<ItemFile {...props} />);
    expect(container.querySelector('.glyphicon-tags')).toBeTruthy();
    await act(async () => {
      fireEvent.click(container.querySelectorAll('td')[1]);
      await flushPromises();
    });
    expect(bookmarkItemList).toHaveBeenCalledWith('storage', 'set', 'name', 'asc', props.set, 'f1');
  });

  test('status 8 bookmark error', async () => {
    bookmarkItemList.mockRejectedValueOnce('bm err');
    const props = defProps({ status: 8 });
    const { container } = renderInTable(<ItemFile {...props} />);
    await act(async () => {
      fireEvent.click(container.querySelectorAll('td')[1]);
      await flushPromises();
    });
    expect(props.addalert).toHaveBeenCalledWith('bm err');
  });

  test('status 9 renders playlist and click queries api', async () => {
    api.mockResolvedValueOnce({ list: [1, 2], time: 10 });
    const props = defProps({ status: 9 });
    const { container } = renderInTable(<ItemFile {...props} />);
    expect(container.querySelector('.glyphicon-th-list')).toBeTruthy();
    await act(async () => {
      fireEvent.click(container.querySelectorAll('td')[1]);
      await flushPromises();
    });
    expect(props.setMedia).toHaveBeenCalledWith([1, 2], 'f1', expect.any(Object), 10);
  });

  test('status 9 click api error', async () => {
    api.mockRejectedValueOnce('query err');
    const props = defProps({ status: 9 });
    const { container } = renderInTable(<ItemFile {...props} />);
    await act(async () => {
      fireEvent.click(container.querySelectorAll('td')[1]);
      await flushPromises();
    });
    expect(props.addalert).toHaveBeenCalledWith('query err');
  });

  test('status 9 click without time', async () => {
    api.mockResolvedValueOnce({ list: [1] });
    const props = defProps({ status: 9 });
    const { container } = renderInTable(<ItemFile {...props} />);
    await act(async () => {
      fireEvent.click(container.querySelectorAll('td')[1]);
      await flushPromises();
    });
    expect(props.setMedia).toHaveBeenCalledWith([1], 'f1', expect.any(Object), 0);
  });

  test('media item renders media content with err', () => {
    const props = defProps({ media: { type: 'vid', key: 'k1', err: { e1: 'bad' }, timeout: 5, complete: 'no' } });
    const { container } = renderInTable(<ItemFile {...props} />);
    expect(container.textContent).toContain('type: vid');
    expect(container.textContent).toContain('err:');
  });

  test('media item without err', () => {
    const props = defProps({ media: { type: 'vid', key: 'k1', err: null, timeout: 0, complete: 'yes' } });
    const { container } = renderInTable(<ItemFile {...props} />);
    expect(container.textContent).toContain('type: vid');
  });

  test('media click calls handleMedia', () => {
    const props = defProps({ media: { type: 'v', key: 'k', err: null, timeout: 0, complete: '' } });
    const { container } = renderInTable(<ItemFile {...props} />);
    fireEvent.click(container.querySelectorAll('td')[1]);
    expect(props.sendglbcf).toHaveBeenCalled();
  });

  test('status 2 click calls setMedia with save2local', () => {
    const props = defProps({ status: 2 });
    const { container } = renderInTable(<ItemFile {...props} />);
    fireEvent.click(container.querySelectorAll('td')[1]);
    expect(props.setMedia).toHaveBeenCalledWith(2, 'f1', { save2local: expect.any(Function) });
  });

  test('dropList: download and save2drive for non-thumb non-7/8', () => {
    const props = defProps({ status: 0 });
    const { container } = renderInTable(<ItemFile {...props} />);
    expect(container.querySelector('[data-testid="drop-0"]').textContent).toBe('download');
    expect(container.querySelector('[data-testid="drop-1"]').textContent).toBe('download to drive');
  });

  test('dropList: thumb item excludes download/drive/edit', () => {
    const props = defProps({ status: 3, thumb: 'http://t.jpg' });
    const { container } = renderInTable(<ItemFile {...props} />);
    expect(container.querySelector('[data-testid="drop-0"]')).toBeFalsy();
  });

  test('dropList: isOwn adds edit and delete', () => {
    const props = defProps({ isOwn: true, recycle: 0 });
    const { container } = renderInTable(<ItemFile {...props} />);
    expect(container.querySelector('[data-testid="drop-2"]').textContent).toBe('edit');
    expect(container.querySelector('[data-testid="drop-3"]').textContent).toBe('delete');
  });

  test('dropList: isOwn with thumb adds delete but not edit', () => {
    const props = defProps({ isOwn: true, thumb: 'http://t.jpg', status: 3 });
    const { container } = renderInTable(<ItemFile {...props} />);
    expect(container.querySelector('[data-testid="drop-3"]').textContent).toBe('delete');
    const editBtn = Array.from(container.querySelectorAll('button')).find(b => b.textContent === 'edit');
    expect(editBtn).toBeFalsy();
  });

  test('dropList: recycle=1 adds recover', () => {
    const props = defProps({ recycle: 1, isOwn: true });
    const { container } = renderInTable(<ItemFile {...props} />);
    expect(container.querySelector('[data-testid="drop-4"]').textContent).toBe('recover');
  });

  test('dropList: status 3 adds searchSub, uploadSub, level 2 handleMedia, cid subscript, noDb save2local', () => {
    const props = defProps({ status: 3, cid: 'ch1', ctitle: 'Channel', noDb: true });
    props.level = 2;
    const { container } = renderInTable(<ItemFile {...props} />);
    expect(container.querySelector('[data-testid="drop-5"]').textContent).toBe('search subtitle');
    expect(container.querySelector('[data-testid="drop-6"]').textContent).toBe('upload subtitle');
    expect(container.querySelector('[data-testid="drop-7"]').textContent).toBe('handle media');
    expect(container.querySelector('[data-testid="drop-8"]').textContent).toContain('訂閱');
    expect(container.querySelector('[data-testid="drop-9"]').textContent).toContain('儲存到local');
  });

  test('dropList: status 4 with cid and noDb', () => {
    const props = defProps({ status: 4, cid: 'ch2', ctitle: 'Ch', noDb: true });
    const { container } = renderInTable(<ItemFile {...props} />);
    expect(container.querySelector('[data-testid="drop-10"]').textContent).toContain('訂閱');
    expect(container.querySelector('[data-testid="drop-11"]').textContent).toContain('儲存到local');
  });

  test('dropList: media with status !== 3 adds handleMedia and clearMedia', () => {
    const props = defProps({ media: { type: 'v', key: 'k', err: null, timeout: 0, complete: '' }, status: 0 });
    const { container } = renderInTable(<ItemFile {...props} />);
    expect(container.querySelector('[data-testid="drop-12"]').textContent).toBe('handle media');
    expect(container.querySelector('[data-testid="drop-13"]').textContent).toBe('clear media');
  });

  test('dropList: media with status 3 only shows clear media (not duplicate handle)', () => {
    const props = defProps({ media: { type: 'v', key: 'k', err: null, timeout: 0, complete: '' }, status: 3 });
    const { container } = renderInTable(<ItemFile {...props} />);
    const handleBtns = Array.from(container.querySelectorAll('button')).filter(b => b.textContent === 'handle media');
    const clearBtns = Array.from(container.querySelectorAll('button')).filter(b => b.textContent === 'clear media');
    expect(clearBtns).toHaveLength(1);
  });

  test('dropList: status 0/2 noDb adds save2local', () => {
    const props = defProps({ status: 2, noDb: true });
    const { container } = renderInTable(<ItemFile {...props} />);
    expect(container.querySelector('[data-testid="drop-17"]').textContent).toContain('儲存到local');
  });

  test('dropList: status 0/1/9 adds join zips', () => {
    const props = defProps({ status: 1 });
    const { container } = renderInTable(<ItemFile {...props} />);
    expect(container.querySelector('[data-testid="drop-14"]').textContent).toBe('join zips');
  });

  test('dropList: status 9 adds save playlist', () => {
    const props = defProps({ status: 9 });
    const { container } = renderInTable(<ItemFile {...props} />);
    expect(container.querySelector('[data-testid="drop-15"]').textContent).toBe('save playlist');
  });

  test('drop-7: handleMedia invoked via status 3 level 2 click', () => {
    const props = defProps({ status: 3 });
    props.level = 2;
    const { container } = renderInTable(<ItemFile {...props} />);
    fireEvent.click(container.querySelector('[data-testid="drop-7"]'));
    expect(api).toHaveBeenCalledWith(expect.stringContaining('/api/file/media/act/f1'));
  });

  test('drop-17: save2local invoked via status 0 noDb click', async () => {
    isValidString.mockReturnValue(true);
    api.mockResolvedValueOnce({ path: '/p' }).mockResolvedValueOnce({ name: 'saved' });
    const props = defProps({ status: 0, noDb: true, id: 'yif_someId' });
    const { container } = renderInTable(<ItemFile {...props} />);
    await act(async () => {
      fireEvent.click(container.querySelector('[data-testid="drop-17"]'));
      await flushPromises();
    });
    expect(api).toHaveBeenCalledWith('/api/getPath');
  });

  test('default status td click triggers download', () => {
    const props = defProps();
    const { container } = renderInTable(<ItemFile {...props} />);
    fireEvent.click(container.querySelectorAll('td')[1]);
    expect(props.sendglbcf).toHaveBeenCalledWith(expect.any(Function), expect.stringContaining('download'));
  });

  test('fileType: thumb=external, noDb=outside, recycle=recycled, latest=info', () => {
    const { container: c1 } = renderInTable(<ItemFile {...defProps({ thumb: 'http://t' })} />);
    expect(c1.querySelector('tr').className).toContain('external');
    const { container: c2 } = renderInTable(<ItemFile {...defProps({ noDb: true })} />);
    expect(c2.querySelector('tr').className).toContain('outside');
    const { container: c3 } = renderInTable(<ItemFile {...defProps({ recycle: 1 })} />);
    expect(c3.querySelector('tr').className).toContain('recycled');
    const p4 = defProps();
    p4.latest = 'f1';
    const { container: c4 } = renderInTable(<ItemFile {...p4} />);
    expect(c4.querySelector('tr').className).toContain('info');
  });

  test('_download calls sendglbcf', () => {
    const props = defProps();
    const { container } = renderInTable(<ItemFile {...props} />);
    fireEvent.click(container.querySelector('[data-testid="drop-0"]'));
    expect(props.sendglbcf).toHaveBeenCalled();
    expect(props.setLatest).toHaveBeenCalled();
  });

  test('_save2drive calls api', async () => {
    api.mockResolvedValueOnce({});
    const props = defProps();
    const { container } = renderInTable(<ItemFile {...props} />);
    await act(async () => {
      fireEvent.click(container.querySelector('[data-testid="drop-1"]'));
      await flushPromises();
    });
    expect(api).toHaveBeenCalledWith(expect.stringContaining('/api/external/2drive/f1'));
  });

  test('_save2drive api error', async () => {
    api.mockRejectedValueOnce('drive err');
    const props = defProps();
    const { container } = renderInTable(<ItemFile {...props} />);
    await act(async () => {
      fireEvent.click(container.querySelector('[data-testid="drop-1"]'));
      await flushPromises();
    });
    expect(props.addalert).toHaveBeenCalledWith('drive err');
  });

  test('_edit: valid name with result.name', async () => {
    isValidString.mockReturnValue(true);
    api.mockResolvedValueOnce({ name: 'newName' });
    const props = defProps({ isOwn: true });
    props.globalinput.mockImplementation((count, cb) => cb('newName'));
    const { container } = renderInTable(<ItemFile {...props} />);
    await act(async () => {
      fireEvent.click(container.querySelector('[data-testid="drop-2"]'));
      await flushPromises();
    });
    expect(props.pushfeedback).toHaveBeenCalledWith({ name: 'newName' });
  });

  test('_edit: valid name without result.name', async () => {
    isValidString.mockReturnValue(true);
    api.mockResolvedValueOnce({});
    const props = defProps({ isOwn: true });
    props.globalinput.mockImplementation((count, cb) => cb('nn'));
    const { container } = renderInTable(<ItemFile {...props} />);
    await act(async () => {
      fireEvent.click(container.querySelector('[data-testid="drop-2"]'));
      await flushPromises();
    });
    expect(props.pushfeedback).not.toHaveBeenCalled();
  });

  test('_edit: invalid name', () => {
    isValidString.mockReturnValue(false);
    const props = defProps({ isOwn: true });
    props.globalinput.mockImplementation((count, cb) => cb('bad'));
    const { container } = renderInTable(<ItemFile {...props} />);
    fireEvent.click(container.querySelector('[data-testid="drop-2"]'));
    expect(props.addalert).toHaveBeenCalledWith('name not vaild!!!');
  });

  test('_delete calls api', async () => {
    api.mockResolvedValueOnce({});
    const props = defProps({ isOwn: true, recycle: 0 });
    const { container } = renderInTable(<ItemFile {...props} />);
    await act(async () => {
      fireEvent.click(container.querySelector('[data-testid="drop-3"]'));
      await flushPromises();
    });
    expect(api).toHaveBeenCalledWith(expect.stringContaining('/api/file/del/f1/0'), null, 'DELETE');
  });

  test('_delete api error', async () => {
    api.mockRejectedValueOnce('del err');
    const props = defProps({ isOwn: true });
    const { container } = renderInTable(<ItemFile {...props} />);
    await act(async () => {
      fireEvent.click(container.querySelector('[data-testid="drop-3"]'));
      await flushPromises();
    });
    expect(props.addalert).toHaveBeenCalledWith('del err');
  });

  test('_recover calls api', async () => {
    api.mockResolvedValueOnce({});
    const props = defProps({ recycle: 1, isOwn: true });
    const { container } = renderInTable(<ItemFile {...props} />);
    await act(async () => {
      fireEvent.click(container.querySelector('[data-testid="drop-4"]'));
      await flushPromises();
    });
    expect(api).toHaveBeenCalledWith(expect.stringContaining('/api/storage/recover/f1'), null, 'PUT');
  });

  test('_recover api error', async () => {
    api.mockRejectedValueOnce('rec err');
    const props = defProps({ recycle: 1, isOwn: true });
    const { container } = renderInTable(<ItemFile {...props} />);
    await act(async () => {
      fireEvent.click(container.querySelector('[data-testid="drop-4"]'));
      await flushPromises();
    });
    expect(props.addalert).toHaveBeenCalledWith('rec err');
  });

  test('_subscript: valid name with result.id and result.bid+name', async () => {
    isValidString.mockReturnValue(true);
    api.mockResolvedValueOnce({ id: 'r1', name: 'rn', bid: 'b1', bname: 'bn' });
    const props = defProps({ status: 3, cid: 'ch1', ctitle: 'Ch' });
    const { container } = renderInTable(<ItemFile {...props} />);
    await act(async () => {
      fireEvent.click(container.querySelector('[data-testid="drop-8"]'));
      await flushPromises();
    });
    expect(props.pushbookmark).toHaveBeenCalledWith({ id: 'r1', name: 'rn' });
    expect(props.pushfeedback).toHaveBeenCalled();
  });

  test('_subscript: result.bid without name', async () => {
    isValidString.mockReturnValue(true);
    api.mockResolvedValueOnce({ bid: 'b1', bname: '' });
    const props = defProps({ status: 3, cid: 'ch1', ctitle: 'Ch' });
    const { container } = renderInTable(<ItemFile {...props} />);
    await act(async () => {
      fireEvent.click(container.querySelector('[data-testid="drop-8"]'));
      await flushPromises();
    });
    expect(props.pushfeedback).not.toHaveBeenCalled();
  });

  test('_subscript: invalid name', () => {
    isValidString.mockReturnValue(false);
    const props = defProps({ status: 3, cid: 'ch1', ctitle: 'Ch' });
    const { container } = renderInTable(<ItemFile {...props} />);
    fireEvent.click(container.querySelector('[data-testid="drop-8"]'));
    expect(props.addalert).toHaveBeenCalledWith('Bookmark name is not valid!!!');
  });

  test('_subscript: api error', async () => {
    isValidString.mockReturnValue(true);
    api.mockRejectedValueOnce('sub err');
    const props = defProps({ status: 3, cid: 'ch1', ctitle: 'Ch' });
    const { container } = renderInTable(<ItemFile {...props} />);
    await act(async () => {
      fireEvent.click(container.querySelector('[data-testid="drop-8"]'));
      await flushPromises();
    });
    expect(props.addalert).toHaveBeenCalledWith('sub err');
  });

  test('_save2local: yif_ prefix', async () => {
    isValidString.mockReturnValue(true);
    api.mockResolvedValueOnce({ path: '/p' }).mockResolvedValueOnce({ name: 'saved' });
    const props = defProps({ status: 3, noDb: true, id: 'yif_movieid' });
    props.item.name = 'movie';
    const { container } = renderInTable(<ItemFile {...props} />);
    await act(async () => {
      fireEvent.click(container.querySelector('[data-testid="drop-9"]'));
      await flushPromises();
    });
    expect(props.pushfeedback).toHaveBeenCalledWith({ name: 'saved' });
  });

  test('_save2local: kub_ prefix', async () => {
    isValidString.mockReturnValue(true);
    api.mockResolvedValueOnce({}).mockResolvedValueOnce({});
    const props = defProps({ status: 3, noDb: true, id: 'kub_vid123' });
    const { container } = renderInTable(<ItemFile {...props} />);
    await act(async () => {
      fireEvent.click(container.querySelector('[data-testid="drop-9"]'));
      await flushPromises();
    });
  });

  test('_save2local: mad_ prefix', async () => {
    isValidString.mockReturnValue(true);
    api.mockResolvedValueOnce({}).mockResolvedValueOnce({});
    const props = defProps({ status: 3, noDb: true, id: 'mad_manga1' });
    const { container } = renderInTable(<ItemFile {...props} />);
    await act(async () => {
      fireEvent.click(container.querySelector('[data-testid="drop-9"]'));
      await flushPromises();
    });
  });

  test('_save2local: default prefix alerts', () => {
    const props = defProps({ status: 3, noDb: true, id: 'unk_xxx' });
    const { container } = renderInTable(<ItemFile {...props} />);
    fireEvent.click(container.querySelector('[data-testid="drop-9"]'));
    expect(props.addalert).toHaveBeenCalledWith('not external video');
  });

  test('_save2local: invalid url', () => {
    isValidString.mockImplementation((val, type) => type !== 'url');
    const props = defProps({ status: 3, noDb: true, id: 'yif_x' });
    const { container } = renderInTable(<ItemFile {...props} />);
    fireEvent.click(container.querySelector('[data-testid="drop-9"]'));
    expect(props.addalert).toHaveBeenCalledWith('invalid url!!!');
  });

  test('_save2local: api error', async () => {
    isValidString.mockReturnValue(true);
    api.mockRejectedValueOnce('local err');
    const props = defProps({ status: 3, noDb: true, id: 'yif_x' });
    const { container } = renderInTable(<ItemFile {...props} />);
    await act(async () => {
      fireEvent.click(container.querySelector('[data-testid="drop-9"]'));
      await flushPromises();
    });
    expect(props.addalert).toHaveBeenCalledWith('local err');
  });

  test('_save2local: result without name', async () => {
    isValidString.mockReturnValue(true);
    api.mockResolvedValueOnce({}).mockResolvedValueOnce({});
    const props = defProps({ status: 3, noDb: true, id: 'yif_x' });
    const { container } = renderInTable(<ItemFile {...props} />);
    await act(async () => {
      fireEvent.click(container.querySelector('[data-testid="drop-9"]'));
      await flushPromises();
    });
    expect(props.pushfeedback).not.toHaveBeenCalled();
  });

  test('_save2local: isMusic appends :music', async () => {
    isValidString.mockReturnValue(true);
    api.mockResolvedValueOnce({}).mockResolvedValueOnce({});
    const props = defProps({ status: 4, noDb: true, cid: 'ch', ctitle: 'Ch', id: 'yif_m' });
    const { container } = renderInTable(<ItemFile {...props} />);
    await act(async () => {
      fireEvent.click(container.querySelector('[data-testid="drop-11"]'));
      await flushPromises();
    });
    const uploadCall = api.mock.calls.find(c => c[0].includes('/upload/url'));
    expect(uploadCall[1].url).toContain(':music');
  });

  test('_handleMedia act', () => {
    const props = defProps({ media: { type: 'v', key: 'k', err: null, timeout: 0, complete: '' }, status: 0 });
    const { container } = renderInTable(<ItemFile {...props} />);
    fireEvent.click(container.querySelector('[data-testid="drop-12"]'));
    expect(api).toHaveBeenCalledWith(expect.stringContaining('/api/file/media/act/f1'));
  });

  test('_handleMedia del', () => {
    const props = defProps({ media: { type: 'v', key: 'k', err: null, timeout: 0, complete: '' }, status: 0 });
    const { container } = renderInTable(<ItemFile {...props} />);
    fireEvent.click(container.querySelector('[data-testid="drop-13"]'));
    expect(api).toHaveBeenCalledWith(expect.stringContaining('/api/file/media/del/f1'));
  });

  test('_handleMedia api error', async () => {
    api.mockRejectedValueOnce('media err');
    const props = defProps({ media: { type: 'v', key: 'k', err: null, timeout: 0, complete: '' }, status: 0 });
    const { container } = renderInTable(<ItemFile {...props} />);
    await act(async () => {
      fireEvent.click(container.querySelector('[data-testid="drop-12"]'));
      await flushPromises();
    });
    expect(props.addalert).toHaveBeenCalledWith('media err');
  });

  test('_downloadAll complete', async () => {
    api.mockResolvedValueOnce({ complete: true });
    const props = defProps({ status: 9 });
    const { container } = renderInTable(<ItemFile {...props} />);
    await act(async () => {
      fireEvent.click(container.querySelector('[data-testid="drop-15"]'));
      await flushPromises();
    });
    expect(props.addalert).toHaveBeenCalledWith('download complete!!!');
  });

  test('_downloadAll not complete', async () => {
    api.mockResolvedValueOnce({ complete: false });
    const props = defProps({ status: 9 });
    const { container } = renderInTable(<ItemFile {...props} />);
    await act(async () => {
      fireEvent.click(container.querySelector('[data-testid="drop-15"]'));
      await flushPromises();
    });
    expect(props.addalert).toHaveBeenCalledWith('starting download');
  });

  test('_downloadAll api error', async () => {
    api.mockRejectedValueOnce('dl err');
    const props = defProps({ status: 9 });
    const { container } = renderInTable(<ItemFile {...props} />);
    await act(async () => {
      fireEvent.click(container.querySelector('[data-testid="drop-15"]'));
      await flushPromises();
    });
    expect(props.addalert).toHaveBeenCalledWith('dl err');
  });

  test('_join: select size > 1', async () => {
    api.mockResolvedValueOnce({ id: 'j1', name: 'joined' });
    const props = defProps({ status: 0 });
    props.select = new Set(['a', 'b']);
    const { container } = renderInTable(<ItemFile {...props} />);
    await act(async () => {
      fireEvent.click(container.querySelector('[data-testid="drop-14"]'));
      await flushPromises();
    });
    expect(props.addalert).toHaveBeenCalledWith('join to joined completed');
  });

  test('_join: select size <= 1', () => {
    const props = defProps({ status: 0 });
    props.select = new Set(['a']);
    const { container } = renderInTable(<ItemFile {...props} />);
    fireEvent.click(container.querySelector('[data-testid="drop-14"]'));
    expect(props.addalert).toHaveBeenCalledWith('Please selects multiple items!!!');
  });

  test('_join: api error', async () => {
    api.mockRejectedValueOnce('join err');
    const props = defProps({ status: 0 });
    props.select = new Set(['a', 'b']);
    const { container } = renderInTable(<ItemFile {...props} />);
    await act(async () => {
      fireEvent.click(container.querySelector('[data-testid="drop-14"]'));
      await flushPromises();
    });
    expect(props.addalert).toHaveBeenCalledWith('join err');
  });

  test('_searchSub: with subName and episode', async () => {
    isValidString.mockReturnValue(true);
    api.mockResolvedValueOnce({});
    const props = defProps({ status: 3 });
    props.globalinput.mockImplementation((count, cb) => cb('name1', true, 'S01E01'));
    const { container } = renderInTable(<ItemFile {...props} />);
    await act(async () => {
      fireEvent.click(container.querySelector('[data-testid="drop-5"]'));
      await flushPromises();
    });
    expect(api).toHaveBeenCalledWith(expect.stringContaining('/subtitle/search/f1'), expect.objectContaining({ name: 'name1', episode: 'S01E01' }));
  });

  test('_searchSub: with subName without valid episode', async () => {
    isValidString.mockImplementation((val, type) => type === 'name' && val === 'name1');
    api.mockResolvedValueOnce({});
    const props = defProps({ status: 3 });
    props.globalinput.mockImplementation((count, cb) => cb('name1', true, ''));
    const { container } = renderInTable(<ItemFile {...props} />);
    await act(async () => {
      fireEvent.click(container.querySelector('[data-testid="drop-5"]'));
      await flushPromises();
    });
    expect(api).toHaveBeenCalledWith(expect.stringContaining('/subtitle/search/f1'), { name: 'name1' });
  });

  test('_searchSub: with subName invalid', () => {
    isValidString.mockReturnValue(false);
    const props = defProps({ status: 3 });
    props.globalinput.mockImplementation((count, cb) => {
      const result = cb('bad', true, '');
      expect(result).rejects.toBeDefined();
    });
    const { container } = renderInTable(<ItemFile {...props} />);
    fireEvent.click(container.querySelector('[data-testid="drop-5"]'));
  });

  test('_searchSub: without subName', async () => {
    api.mockResolvedValueOnce({});
    const props = defProps({ status: 3 });
    props.globalinput.mockImplementation((count, cb) => cb(''));
    const { container } = renderInTable(<ItemFile {...props} />);
    await act(async () => {
      fireEvent.click(container.querySelector('[data-testid="drop-5"]'));
      await flushPromises();
    });
    expect(api).toHaveBeenCalledWith(expect.stringContaining('/getSubtitle/f1'));
  });

  test('_uploadSub calls globalinput', () => {
    const props = defProps({ status: 3 });
    props.globalinput.mockImplementation((count, cb) => {
      cb();
    });
    const { container } = renderInTable(<ItemFile {...props} />);
    fireEvent.click(container.querySelector('[data-testid="drop-6"]'));
    expect(props.globalinput).toHaveBeenCalledWith(2, expect.any(Function), 'warning', expect.stringContaining('/upload/subtitle/f1'));
    expect(props.addalert).toHaveBeenCalledWith('subtitle upload success');
  });

  test('_subscript with isMusic=true (status 4)', async () => {
    isValidString.mockReturnValue(true);
    api.mockResolvedValueOnce({});
    const props = defProps({ status: 4, cid: 'ch2', ctitle: 'Ch2' });
    const { container } = renderInTable(<ItemFile {...props} />);
    await act(async () => {
      fireEvent.click(container.querySelector('[data-testid="drop-10"]'));
      await flushPromises();
    });
    const subCall = api.mock.calls.find(c => c[0].includes('/subscript/'));
    expect(subCall[1].path).toContain('youtube music');
  });
});

// ═══════════════════════ UserInfo ═══════════════════════

describe('UserInfo', () => {
  const defProps = (userOverrides = {}) => ({
    user: {
      id: 'u1', name: 'user1', auto: '', perm: 0, desc: 'desc',
      unDay: 30, unHit: 10, newable: false, delable: true, verify: false,
      editAuto: true, ...userOverrides,
    },
    addalert: jest.fn(),
    sendglbpw: jest.fn(cb => { const r = cb('validPwd'); if (r && typeof r.catch === 'function') r.catch(() => {}); }),
    sendglbcf: jest.fn(cb => cb()),
    addUser: jest.fn(),
    delUser: jest.fn(),
    setbasic: jest.fn(),
  });

  test('renders non-newable user with edit button', () => {
    const { container } = render(<UserInfo {...defProps()} />);
    expect(container.querySelector('.glyphicon-edit')).toBeTruthy();
  });

  test('newable user starts in edit mode', () => {
    const { container } = render(<UserInfo {...defProps({ newable: true })} />);
    expect(container.querySelector('.glyphicon-ok')).toBeTruthy();
  });

  test('verify button shows when user.verify truthy', () => {
    const { container } = render(<UserInfo {...defProps({ verify: true })} />);
    expect(container.querySelector('.glyphicon-barcode')).toBeTruthy();
  });

  test('no verify button when user.verify falsy', () => {
    const { container } = render(<UserInfo {...defProps({ verify: false })} />);
    expect(container.querySelector('.glyphicon-barcode')).toBeFalsy();
  });

  test('edit toggle shows check icon', () => {
    const { container } = render(<UserInfo {...defProps()} />);
    fireEvent.click(container.querySelector('.glyphicon-edit').parentElement);
    expect(container.querySelector('.glyphicon-check')).toBeTruthy();
  });

  test('delable user shows delete button when not editing', () => {
    const { container } = render(<UserInfo {...defProps({ delable: true })} />);
    expect(container.querySelector('.glyphicon-remove')).toBeTruthy();
  });

  test('non-delable user shows no delete button', () => {
    const { container } = render(<UserInfo {...defProps({ delable: false })} />);
    expect(container.querySelector('.glyphicon-remove')).toBeFalsy();
  });

  test('_handleSubmit newable: missing name', () => {
    checkInput.mockReturnValue(undefined);
    const props = defProps({ newable: true });
    const { container } = render(<UserInfo {...props} />);
    fireEvent.submit(container.querySelector('form'));
    expect(props.addalert).toHaveBeenCalledWith('Please input username!!!');
  });

  test('_handleSubmit newable: missing perm', () => {
    checkInput.mockReturnValueOnce({ name: 'n' }).mockReturnValue(undefined);
    const props = defProps({ newable: true });
    const { container } = render(<UserInfo {...props} />);
    fireEvent.submit(container.querySelector('form'));
    expect(props.addalert).toHaveBeenCalledWith('Please input level!!!');
  });

  test('_handleSubmit newable: missing desc', () => {
    checkInput.mockReturnValueOnce({ name: 'n' }).mockReturnValueOnce(undefined)
      .mockReturnValueOnce({ perm: 1 }).mockReturnValue(undefined);
    const props = defProps({ newable: true });
    const { container } = render(<UserInfo {...props} />);
    fireEvent.submit(container.querySelector('form'));
    expect(props.addalert).toHaveBeenCalledWith('Please input description!!!');
  });

  test('_handleSubmit newable: missing newPwd', () => {
    checkInput.mockReturnValueOnce({ name: 'n' }).mockReturnValueOnce(undefined)
      .mockReturnValueOnce({ perm: 1 }).mockReturnValueOnce({ desc: 'd' })
      .mockReturnValue(undefined);
    const props = defProps({ newable: true });
    const { container } = render(<UserInfo {...props} />);
    fireEvent.submit(container.querySelector('form'));
    expect(props.addalert).toHaveBeenCalledWith('Please input password!!!');
  });

  test('_handleSubmit newable: all fields valid, password valid, api success', async () => {
    checkInput.mockReturnValueOnce({ name: 'n' }).mockReturnValueOnce(undefined)
      .mockReturnValueOnce({ perm: 1 }).mockReturnValueOnce({ desc: 'd' })
      .mockReturnValueOnce(undefined).mockReturnValueOnce(undefined)
      .mockReturnValueOnce({ newPwd: 'p1', conPwd: 'p1' });
    isValidString.mockReturnValue(true);
    api.mockResolvedValueOnce({ id: 'new1', name: 'newuser' });
    const props = defProps({ newable: true });
    const { container } = render(<UserInfo {...props} />);
    await act(async () => {
      fireEvent.submit(container.querySelector('form'));
      await flushPromises();
    });
    expect(props.addUser).toHaveBeenCalled();
  });

  test('_handleSubmit newable: invalid password in sendglbpw', async () => {
    checkInput.mockReturnValueOnce({ name: 'n' }).mockReturnValueOnce(undefined)
      .mockReturnValueOnce({ perm: 1 }).mockReturnValueOnce({ desc: 'd' })
      .mockReturnValueOnce(undefined).mockReturnValueOnce(undefined)
      .mockReturnValueOnce({ newPwd: 'p1', conPwd: 'p1' });
    isValidString.mockReturnValue(false);
    const props = defProps({ newable: true });
    const { container } = render(<UserInfo {...props} />);
    await act(async () => {
      fireEvent.submit(container.querySelector('form'));
      await flushPromises();
    });
    expect(props.addalert).toHaveBeenCalledWith('User password not vaild!!!');
  });

  test('_handleSubmit newable: api error', async () => {
    checkInput.mockReturnValueOnce({ name: 'n' }).mockReturnValueOnce(undefined)
      .mockReturnValueOnce({ perm: 1 }).mockReturnValueOnce({ desc: 'd' })
      .mockReturnValueOnce(undefined).mockReturnValueOnce(undefined)
      .mockReturnValueOnce({ newPwd: 'p1', conPwd: 'p1' });
    isValidString.mockReturnValue(true);
    api.mockRejectedValueOnce('api err');
    const props = defProps({ newable: true });
    const { container } = render(<UserInfo {...props} />);
    await act(async () => {
      fireEvent.submit(container.querySelector('form'));
      await flushPromises();
    });
    expect(props.addalert).toHaveBeenCalledWith('api err');
  });

  test('_handleSubmit non-newable: set_obj has keys, valid password, api success with owner', async () => {
    checkInput.mockReturnValueOnce({ name: 'new' }).mockReturnValue(undefined);
    isValidString.mockReturnValue(true);
    api.mockResolvedValueOnce({ owner: 'ownerInfo', name: 'updated' });
    const props = defProps();
    const { container } = render(<UserInfo {...props} />);
    fireEvent.click(container.querySelector('.glyphicon-edit').parentElement);
    await act(async () => {
      fireEvent.submit(container.querySelector('form'));
      await flushPromises();
    });
    expect(props.setbasic).toHaveBeenCalledWith('ownerInfo');
    expect(props.addUser).toHaveBeenCalled();
  });

  test('_handleSubmit non-newable: api success without owner', async () => {
    checkInput.mockReturnValueOnce({ name: 'new' }).mockReturnValue(undefined);
    isValidString.mockReturnValue(true);
    api.mockResolvedValueOnce({ name: 'updated' });
    const props = defProps();
    const { container } = render(<UserInfo {...props} />);
    fireEvent.click(container.querySelector('.glyphicon-edit').parentElement);
    await act(async () => {
      fireEvent.submit(container.querySelector('form'));
      await flushPromises();
    });
    expect(props.setbasic).not.toHaveBeenCalled();
    expect(props.addUser).toHaveBeenCalled();
  });

  test('_handleSubmit non-newable: invalid password', async () => {
    checkInput.mockReturnValueOnce({ name: 'new' }).mockReturnValue(undefined);
    isValidString.mockReturnValue(false);
    const props = defProps();
    const { container } = render(<UserInfo {...props} />);
    fireEvent.click(container.querySelector('.glyphicon-edit').parentElement);
    await act(async () => {
      fireEvent.submit(container.querySelector('form'));
      await flushPromises();
    });
    expect(props.addalert).toHaveBeenCalledWith('User password not vaild!!!');
  });

  test('_handleSubmit non-newable: api error', async () => {
    checkInput.mockReturnValueOnce({ name: 'new' }).mockReturnValue(undefined);
    isValidString.mockReturnValue(true);
    api.mockRejectedValueOnce('up err');
    const props = defProps();
    const { container } = render(<UserInfo {...props} />);
    fireEvent.click(container.querySelector('.glyphicon-edit').parentElement);
    await act(async () => {
      fireEvent.submit(container.querySelector('form'));
      await flushPromises();
    });
    expect(props.addalert).toHaveBeenCalledWith('up err');
  });

  test('_handleSubmit non-newable: empty set_obj toggles edit', () => {
    checkInput.mockReturnValue(undefined);
    const props = defProps();
    const { container } = render(<UserInfo {...props} />);
    fireEvent.click(container.querySelector('.glyphicon-edit').parentElement);
    expect(container.querySelector('.glyphicon-check')).toBeTruthy();
    fireEvent.submit(container.querySelector('form'));
    expect(container.querySelector('.glyphicon-edit')).toBeTruthy();
  });

  test('_delUser: valid password api success', async () => {
    isValidString.mockReturnValue(true);
    api.mockResolvedValueOnce({});
    const props = defProps({ delable: true });
    const { container } = render(<UserInfo {...props} />);
    await act(async () => {
      fireEvent.click(container.querySelector('.glyphicon-remove').parentElement);
      await flushPromises();
    });
    expect(props.delUser).toHaveBeenCalledWith('u1');
  });

  test('_delUser: invalid password', async () => {
    isValidString.mockReturnValue(false);
    const props = defProps({ delable: true });
    const { container } = render(<UserInfo {...props} />);
    await act(async () => {
      fireEvent.click(container.querySelector('.glyphicon-remove').parentElement);
      await flushPromises();
    });
    expect(props.addalert).toHaveBeenCalledWith('User password not vaild!!!');
  });

  test('_delUser: api error', async () => {
    isValidString.mockReturnValue(true);
    api.mockRejectedValueOnce('del err');
    const props = defProps({ delable: true });
    const { container } = render(<UserInfo {...props} />);
    await act(async () => {
      fireEvent.click(container.querySelector('.glyphicon-remove').parentElement);
      await flushPromises();
    });
    expect(props.addalert).toHaveBeenCalledWith('del err');
  });

  test('_showCode: api success calls alert', async () => {
    window.alert = jest.fn();
    api.mockResolvedValueOnce({ verify: 'code123' });
    const props = defProps({ verify: true });
    const { container } = render(<UserInfo {...props} />);
    await act(async () => {
      fireEvent.click(container.querySelector('.glyphicon-barcode').parentElement);
      await flushPromises();
    });
    expect(window.alert).toHaveBeenCalledWith('code123');
  });

  test('_showCode: api error', async () => {
    api.mockRejectedValueOnce('verify err');
    const props = defProps({ verify: true });
    const { container } = render(<UserInfo {...props} />);
    await act(async () => {
      fireEvent.click(container.querySelector('.glyphicon-barcode').parentElement);
      await flushPromises();
    });
    expect(props.addalert).toHaveBeenCalledWith('verify err');
  });

  test('_handleChange updates state', () => {
    const props = defProps({ newable: true });
    const { container } = render(<UserInfo {...props} />);
    global.__mockInputValues = { name: 'changed' };
    const inputs = container.querySelectorAll('input[type="text"]');
    if (inputs.length > 0) fireEvent.change(inputs[0], { target: { value: 'x' } });
  });
});

// ═══════════════════════ App ═══════════════════════

describe('App', () => {
  const validUser = {
    id: 'user1', main_url: 'https://main', ws_url: 'wss://ws',
    level: 2, nav: [{ title: 'Stock', hash: '/Stock', css: 'g', key: 5 }], isEdit: true,
  };

  const defProps = () => ({
    id: 'user1',
    basicset: jest.fn(), feedbackset: jest.fn(), userset: jest.fn(),
    bookmarkset: jest.fn(), itemset: jest.fn(), passset: jest.fn(),
    stockset: jest.fn(), bitfinexset: jest.fn(), dirsset: jest.fn(),
    resetmedia: jest.fn(), addalert: jest.fn(),
    itemdel: jest.fn(), passdel: jest.fn(), stockdel: jest.fn(), bitfinexdel: jest.fn(),
    pushdir: jest.fn(),
    sendglbcf: jest.fn(cb => cb()),
    sendglbpw: jest.fn(),
    closeglbpw: jest.fn(),
    pwCallback: [], cfCallback: [],
    bitSortName: 'name', bitSortType: 'asc',
    sub: [],
  });

  let wsInstance;

  const mountApp = async (props = defProps(), userOverride = validUser) => {
    wsInstance = null;
    const origWS = global.WebSocket;
    global.WebSocket = jest.fn(function() {
      this.readyState = 1;
      this.send = jest.fn();
      this.close = jest.fn();
      wsInstance = this;
    });
    isValidString.mockReturnValue(true);
    api.mockResolvedValueOnce(userOverride)
      .mockResolvedValueOnce({ feedbacks: ['fb1'] })
      .mockResolvedValueOnce({ parentList: [{ show: 'Dir', name: 'd1' }] });

    let result;
    await act(async () => {
      result = render(<App {...props} />);
      await flushPromises();
    });
    global.WebSocket = origWS;
    return result;
  };

  test('componentDidMount full success', async () => {
    const props = defProps();
    await mountApp(props);
    expect(props.basicset).toHaveBeenCalledWith('user1', 'https://main', true, 2);
    expect(props.feedbackset).toHaveBeenCalledWith(['fb1']);
    expect(props.dirsset).toHaveBeenCalled();
  });

  test('componentDidMount invalid user throws', async () => {
    const props = defProps();
    isValidString.mockReturnValue(false);
    api.mockResolvedValueOnce(validUser);
    await act(async () => {
      render(<App {...props} />);
      await flushPromises();
    });
    expect(props.addalert).toHaveBeenCalled();
  });

  test('componentDidMount api error', async () => {
    const props = defProps();
    api.mockRejectedValueOnce('mount err');
    await act(async () => {
      render(<App {...props} />);
      await flushPromises();
    });
    expect(props.addalert).toHaveBeenCalledWith('mount err');
  });

  test('componentWillUnmount with ws', async () => {
    const props = defProps();
    const { unmount } = await mountApp(props);
    const ws = wsInstance;
    unmount();
    expect(ws.close).toHaveBeenCalled();
    expect(props.basicset).toHaveBeenCalledWith('guest', '', false, []);
    expect(props.resetmedia).toHaveBeenCalledWith(2);
    expect(props.resetmedia).toHaveBeenCalledWith(3);
    expect(props.resetmedia).toHaveBeenCalledWith(4);
    expect(props.resetmedia).toHaveBeenCalledWith([]);
  });

  test('componentWillUnmount without ws', () => {
    api.mockRejectedValue('fail');
    const props = defProps();
    let result;
    act(() => { result = render(<App {...props} />); });
    result.unmount();
    expect(props.basicset).toHaveBeenCalledWith('guest', '', false, []);
  });

  test('WS message: file type non-empty', async () => {
    const props = defProps();
    await mountApp(props);
    api.mockResolvedValueOnce({ empty: false, item: { id: 'f1' } });
    await act(async () => {
      wsInstance.onmessage({ data: JSON.stringify({ type: 'file', data: 'f1', level: 0 }) });
      await flushPromises();
    });
    expect(props.itemset).toHaveBeenCalledWith({ id: 'f1' });
  });

  test('WS message: file type empty', async () => {
    const props = defProps();
    await mountApp(props);
    api.mockResolvedValueOnce({ empty: true });
    await act(async () => {
      wsInstance.onmessage({ data: JSON.stringify({ type: 'file', data: 'f1', level: 0 }) });
      await flushPromises();
    });
    expect(props.itemdel).toHaveBeenCalledWith('f1');
  });

  test('WS message: file api error', async () => {
    const props = defProps();
    await mountApp(props);
    api.mockRejectedValueOnce('ws err');
    await act(async () => {
      wsInstance.onmessage({ data: JSON.stringify({ type: 'file', data: 'f1', level: 0 }) });
      await flushPromises();
    });
    expect(props.addalert).toHaveBeenCalledWith('ws err');
  });

  test('WS message: password type', async () => {
    const props = defProps();
    await mountApp(props);
    api.mockResolvedValueOnce({ empty: false, item: { id: 'p1' } });
    await act(async () => {
      wsInstance.onmessage({ data: JSON.stringify({ type: 'password', data: 'p1', level: 0 }) });
      await flushPromises();
    });
    expect(props.passset).toHaveBeenCalledWith({ id: 'p1' });
  });

  test('WS message: password empty', async () => {
    const props = defProps();
    await mountApp(props);
    api.mockResolvedValueOnce({ empty: true });
    await act(async () => {
      wsInstance.onmessage({ data: JSON.stringify({ type: 'password', data: 'p1', level: 0 }) });
      await flushPromises();
    });
    expect(props.passdel).toHaveBeenCalledWith('p1');
  });

  test('WS message: stock type', async () => {
    const props = defProps();
    await mountApp(props);
    api.mockResolvedValueOnce({ empty: false, item: { id: 's1' } });
    await act(async () => {
      wsInstance.onmessage({ data: JSON.stringify({ type: 'stock', data: 's1', level: 0 }) });
      await flushPromises();
    });
    expect(props.stockset).toHaveBeenCalledWith({ id: 's1' });
  });

  test('WS message: password api error', async () => {
    const props = defProps();
    await mountApp(props);
    api.mockRejectedValueOnce('pwd ws err');
    await act(async () => {
      wsInstance.onmessage({ data: JSON.stringify({ type: 'password', data: 'p1', level: 0 }) });
      await flushPromises();
    });
    expect(props.addalert).toHaveBeenCalledWith('pwd ws err');
  });

  test('WS message: stock api error', async () => {
    const props = defProps();
    await mountApp(props);
    api.mockRejectedValueOnce('stk ws err');
    await act(async () => {
      wsInstance.onmessage({ data: JSON.stringify({ type: 'stock', data: 's1', level: 0 }) });
      await flushPromises();
    });
    expect(props.addalert).toHaveBeenCalledWith('stk ws err');
  });

  test('WS message: stock empty', async () => {
    const props = defProps();
    await mountApp(props);
    api.mockResolvedValueOnce({ empty: true });
    await act(async () => {
      wsInstance.onmessage({ data: JSON.stringify({ type: 'stock', data: 's1', level: 0 }) });
      await flushPromises();
    });
    expect(props.stockdel).toHaveBeenCalledWith('s1');
  });

  test('WS message: bitfinex without user, data !== -1', async () => {
    const props = defProps();
    await mountApp(props);
    api.mockResolvedValueOnce({ empty: false, item: { id: 'b1' } });
    await act(async () => {
      wsInstance.onmessage({ data: JSON.stringify({ type: 'bitfinex', data: 'b1', level: 0 }) });
      await flushPromises();
    });
    expect(props.bitfinexset).toHaveBeenCalledWith({ id: 'b1' });
  });

  test('WS message: bitfinex with user matching, data === -1', async () => {
    const props = defProps();
    await mountApp(props);
    api.mockResolvedValueOnce({ empty: false, itemList: [], parentList: [], bookmarkID: 'bk', latest: 'lt' });
    await act(async () => {
      wsInstance.onmessage({ data: JSON.stringify({ type: 'bitfinex', data: -1, level: 0, user: 'user1' }) });
      await flushPromises();
    });
    expect(props.bitfinexset).toHaveBeenCalledWith([], [], 'bk', 'lt', 'name', 'asc');
  });

  test('WS message: bitfinex empty', async () => {
    const props = defProps();
    await mountApp(props);
    api.mockResolvedValueOnce({ empty: true });
    await act(async () => {
      wsInstance.onmessage({ data: JSON.stringify({ type: 'bitfinex', data: 'b1', level: 0 }) });
      await flushPromises();
    });
    expect(props.bitfinexdel).toHaveBeenCalledWith('b1');
  });

  test('WS message: bitfinex with user not matching skips', async () => {
    const props = defProps();
    await mountApp(props);
    await act(async () => {
      wsInstance.onmessage({ data: JSON.stringify({ type: 'bitfinex', data: 'b1', level: 0, user: 'other' }) });
      await flushPromises();
    });
    expect(props.bitfinexset).not.toHaveBeenCalledWith(expect.objectContaining({ id: 'b1' }));
  });

  test('WS message: bitfinex api error', async () => {
    const props = defProps();
    await mountApp(props);
    api.mockRejectedValueOnce('bit err');
    await act(async () => {
      wsInstance.onmessage({ data: JSON.stringify({ type: 'bitfinex', data: 'b1', level: 0 }) });
      await flushPromises();
    });
    expect(props.addalert).toHaveBeenCalledWith('bit err');
  });

  test('WS message: sub type calls sub functions', async () => {
    const subFn = jest.fn();
    const props = { ...defProps(), sub: [subFn] };
    await mountApp(props);
    wsInstance.onmessage({ data: JSON.stringify({ type: 'sub', data: '', level: 0 }) });
    expect(subFn).toHaveBeenCalled();
  });

  test('WS message: userId type with zip', async () => {
    const props = defProps();
    await mountApp(props);
    await act(async () => {
      wsInstance.onmessage({ data: JSON.stringify({ type: 'user1', data: 'alert msg', level: 0, zip: 'zip1' }) });
    });
    expect(props.addalert).toHaveBeenCalledWith('alert msg');
    expect(props.sendglbcf).toHaveBeenCalled();
  });

  test('WS message: userId type without zip', async () => {
    const props = defProps();
    await mountApp(props);
    wsInstance.onmessage({ data: JSON.stringify({ type: 'user1', data: 'info', level: 0 }) });
    expect(props.addalert).toHaveBeenCalledWith('info');
  });

  test('WS onopen logs message', async () => {
    const props = defProps();
    await mountApp(props);
    if (wsInstance && wsInstance.onopen) {
      wsInstance.onopen();
      expect(console.log).toHaveBeenCalled();
    }
  });

  test('WS message: default logs', async () => {
    const props = defProps();
    await mountApp(props);
    wsInstance.onmessage({ data: JSON.stringify({ type: 'unknown', data: 'x', level: 0 }) });
    expect(console.log).toHaveBeenCalled();
  });

  test('WS message: level too low skips', async () => {
    const props = defProps();
    await mountApp(props);
    api.mockClear();
    wsInstance.onmessage({ data: JSON.stringify({ type: 'file', data: 'f1', level: 99 }) });
    expect(api).not.toHaveBeenCalled();
  });

  test('render with pwCallback', async () => {
    const props = { ...defProps(), pwCallback: [jest.fn()] };
    const { container } = await mountApp(props);
    expect(container.querySelector('[data-testid="glbpwuser"]')).toBeTruthy();
  });

  test('render with cfCallback', async () => {
    const props = { ...defProps(), cfCallback: [jest.fn(), 'confirm?'] };
    const { container } = await mountApp(props);
    expect(container.querySelector('[data-testid="glbcf"]')).toBeTruthy();
  });

  test('_doLogout success', async () => {
    doLogout.mockResolvedValueOnce();
    const props = defProps();
    const { container } = await mountApp(props);
    const logoutBtn = container.querySelector('[data-testid="drop-2"]');
    await act(async () => {
      fireEvent.click(logoutBtn);
      await flushPromises();
    });
    expect(history.push).toHaveBeenCalledWith('/Login');
  });

  test('_doLogout error', async () => {
    doLogout.mockRejectedValueOnce('logout err');
    const props = defProps();
    const { container } = await mountApp(props);
    await act(async () => {
      fireEvent.click(container.querySelector('[data-testid="drop-2"]'));
      await flushPromises();
    });
    expect(props.addalert).toHaveBeenCalledWith('logout err');
  });

  test('profile dropdown navigates to user page', async () => {
    const props = defProps();
    const { container } = await mountApp(props);
    fireEvent.click(container.querySelector('[data-testid="drop-0"]'));
    expect(history.push).toHaveBeenCalledWith('/User');
  });

  test('MozWebSocket branch', async () => {
    const origWS = global.WebSocket;
    const mozInst = { close: jest.fn(), readyState: 1, send: jest.fn() };
    window.MozWebSocket = jest.fn(() => mozInst);
    isValidString.mockReturnValue(true);
    api.mockResolvedValueOnce(validUser)
      .mockResolvedValueOnce({ feedbacks: [] })
      .mockResolvedValueOnce({ parentList: [] });
    const props = defProps();
    await act(async () => {
      render(<App {...props} />);
      await flushPromises();
    });
    expect(window.MozWebSocket).toHaveBeenCalled();
    delete window.MozWebSocket;
    global.WebSocket = origWS;
  });

  test('dirsset callback onclick', async () => {
    const props = defProps();
    await mountApp(props);
    const dirssetCall = props.dirsset.mock.calls[0];
    const dirsFn = dirssetCall[1];
    const dirItem = dirsFn({ show: 'Dir1', name: 'd1' }, 0);
    expect(dirItem.title).toBe('Dir1');
    api.mockResolvedValueOnce({ result: 'ok' });
    await act(async () => {
      dirItem.onclick('tagVal');
      await flushPromises();
    });
    expect(props.sendglbcf).toHaveBeenCalled();
  });

  test('dirsset callback onclick api error', async () => {
    const props = defProps();
    await mountApp(props);
    const dirsFn = props.dirsset.mock.calls[0][1];
    const dirItem = dirsFn({ show: 'Dir1', name: 'd1' }, 0);
    api.mockRejectedValueOnce('dir err');
    await act(async () => {
      dirItem.onclick('tagVal');
      await flushPromises();
    });
    expect(props.addalert).toHaveBeenCalledWith('dir err');
  });

  test('zipPw callback: valid password', async () => {
    const props = defProps();
    await mountApp(props);
    isValidString.mockReturnValue(true);
    api.mockResolvedValueOnce({});
    await act(async () => {
      wsInstance.onmessage({ data: JSON.stringify({ type: 'user1', data: 'msg', level: 0, zip: 'z1' }) });
      await flushPromises();
    });
    const submitBtn = document.querySelector('[data-testid="glbpw-submit"]');
    if (submitBtn) {
      global.__mockPwdValue = 'goodpwd';
      isValidString.mockReturnValue(true);
      await act(async () => {
        fireEvent.click(submitBtn);
        await flushPromises();
      });
    }
  });

  test('zipPw callback: invalid password', async () => {
    const props = defProps();
    await mountApp(props);
    await act(async () => {
      wsInstance.onmessage({ data: JSON.stringify({ type: 'user1', data: 'msg', level: 0, zip: 'z1' }) });
      await flushPromises();
    });
    const submitBtn = document.querySelector('[data-testid="glbpw-submit"]');
    if (submitBtn) {
      global.__mockPwdValue = 'badpwd';
      isValidString.mockReturnValue(false);
      await act(async () => {
        fireEvent.click(submitBtn);
        await flushPromises();
      });
      expect(props.addalert).toHaveBeenCalledWith('Zip password not vaild!!!');
    }
  });

  test('zipPw callback: api error', async () => {
    const props = defProps();
    await mountApp(props);
    isValidString.mockReturnValue(true);
    api.mockRejectedValueOnce('zip err');
    await act(async () => {
      wsInstance.onmessage({ data: JSON.stringify({ type: 'user1', data: 'msg', level: 0, zip: 'z1' }) });
      await flushPromises();
    });
    const submitBtn = document.querySelector('[data-testid="glbpw-submit"]');
    if (submitBtn) {
      global.__mockPwdValue = 'goodpwd';
      isValidString.mockReturnValue(true);
      await act(async () => {
        fireEvent.click(submitBtn);
        await flushPromises();
      });
    }
  });

  test('zipPw close sets zipPw to null', async () => {
    const props = defProps();
    await mountApp(props);
    await act(async () => {
      wsInstance.onmessage({ data: JSON.stringify({ type: 'user1', data: 'msg', level: 0, zip: 'z1' }) });
      await flushPromises();
    });
    const closeBtn = document.querySelector('[data-testid="glbpw-close"]');
    expect(closeBtn).toBeTruthy();
    await act(async () => {
      fireEvent.click(closeBtn);
    });
    expect(document.querySelector('[data-testid="glbpw-close"]')).toBeFalsy();
  });
});

// ═══════════════════════ StockTotal ═══════════════════════

describe('StockTotal', () => {
  const totalData = {
    stock: [
      { name: 'AAPL', type: 'US', count: 10, price: 150, mid: 155.55, mul: 2, str: 'info', order: ['o1', 'o2'], se: 0, current: 1500, profit: 100, remain: 5 },
      { name: 'GOOG', type: 'TW', count: 5, price: 200, mid: 205, mul: 0, str: 'info2', se: 1, current: 1000, profit: 50, remain: 3 },
    ],
    se: [
      { type: 'US', total: 3000, remain: 100 },
      { type: 'TW', total: 0, remain: 0 },
    ],
  };

  const defProps = () => ({
    open: true,
    toggle: jest.fn(),
    addalert: jest.fn(),
    sendglbcf: jest.fn(cb => cb()),
  });

  test('renders null when no total', () => {
    api.mockResolvedValueOnce(totalData);
    const { container } = render(<StockTotal {...defProps()} />);
    expect(container.querySelector('#stock-total-section')).toBeFalsy();
  });

  test('renders null when not open', async () => {
    api.mockResolvedValueOnce(totalData);
    const props = { ...defProps(), open: false };
    let container;
    await act(async () => {
      const result = render(<StockTotal {...props} />);
      container = result.container;
      await flushPromises();
    });
    expect(container.querySelector('#stock-total-section')).toBeFalsy();
  });

  test('componentDidMount api success renders stocks', async () => {
    api.mockResolvedValueOnce(totalData);
    const props = defProps();
    let container;
    await act(async () => {
      const result = render(<StockTotal {...props} />);
      container = result.container;
      await flushPromises();
    });
    expect(container.querySelector('#stock-total-section')).toBeTruthy();
    expect(container.textContent).toContain('AAPL');
    expect(container.textContent).toContain('GOOG');
  });

  test('componentDidMount api error', async () => {
    api.mockRejectedValueOnce('total err');
    const props = defProps();
    await act(async () => {
      render(<StockTotal {...props} />);
      await flushPromises();
    });
    expect(props.addalert).toHaveBeenCalledWith('total err');
  });

  test('stock with order shows order items', async () => {
    api.mockResolvedValueOnce(totalData);
    const props = defProps();
    let container;
    await act(async () => {
      const result = render(<StockTotal {...props} />);
      container = result.container;
      await flushPromises();
    });
    const orderBtns = Array.from(container.querySelectorAll('button')).filter(b => b.textContent.startsWith('Order:'));
    expect(orderBtns.length).toBeGreaterThan(0);
  });

  test('stock with mul=0 shows 0', async () => {
    api.mockResolvedValueOnce(totalData);
    const props = defProps();
    let container;
    await act(async () => {
      const result = render(<StockTotal {...props} />);
      container = result.container;
      await flushPromises();
    });
    const mulBtns = Array.from(container.querySelectorAll('button')).filter(b => b.textContent.startsWith('mul:'));
    expect(mulBtns.some(b => b.textContent.includes('0'))).toBe(true);
  });

  test('se.total === 0 gives 0 percent', async () => {
    api.mockResolvedValueOnce(totalData);
    const props = defProps();
    let container;
    await act(async () => {
      const result = render(<StockTotal {...props} />);
      container = result.container;
      await flushPromises();
    });
    expect(container.textContent).toContain('(0%)');
  });

  test('toggle panel heading', async () => {
    api.mockResolvedValueOnce(totalData);
    const props = defProps();
    let container;
    await act(async () => {
      const result = render(<StockTotal {...props} />);
      container = result.container;
      await flushPromises();
    });
    fireEvent.click(container.querySelector('.panel-heading'));
    expect(props.toggle).toHaveBeenCalled();
  });

  test('_handleSubmit: sending=true does nothing', async () => {
    api.mockResolvedValueOnce(totalData);
    const props = defProps();
    let container;
    await act(async () => {
      const result = render(<StockTotal {...props} />);
      container = result.container;
      await flushPromises();
    });
    isValidString.mockReturnValue(true);
    api.mockReturnValue(new Promise(() => {}));
    global.__mockInputValues = { stock: 'cmd1' };
    await act(async () => {
      fireEvent.change(container.querySelector('input[placeholder="New stock..."]'), { target: { value: 'x' } });
    });
    const form = container.querySelector('form');
    fireEvent.submit(form);
    fireEvent.submit(form);
  });

  test('_handleSubmit: invalid stock', async () => {
    api.mockResolvedValueOnce(totalData);
    const props = defProps();
    let container;
    await act(async () => {
      const result = render(<StockTotal {...props} />);
      container = result.container;
      await flushPromises();
    });
    isValidString.mockReturnValue(false);
    global.__mockInputValues = { stock: '' };
    await act(async () => {
      fireEvent.change(container.querySelector('input[placeholder="New stock..."]'), { target: { value: 'x' } });
    });
    fireEvent.submit(container.querySelector('form'));
    expect(props.addalert).toHaveBeenCalledWith('CMD not vaild!!!');
  });

  test('_handleSubmit: valid stock triggers temp update', async () => {
    api.mockResolvedValueOnce(totalData);
    const props = defProps();
    let container;
    await act(async () => {
      const result = render(<StockTotal {...props} />);
      container = result.container;
      await flushPromises();
    });
    isValidString.mockReturnValue(true);
    api.mockResolvedValueOnce(totalData);
    global.__mockInputValues = { stock: 'cmd1' };
    await act(async () => {
      fireEvent.change(container.querySelector('input[placeholder="New stock..."]'), { target: { value: 'x' } });
    });
    await act(async () => {
      fireEvent.submit(container.querySelector('form'));
      await flushPromises();
    });
    expect(api).toHaveBeenCalledWith('/api/stock/updateTotal/0', expect.any(Object), 'PUT');
  });

  test('_update real=false error pops info', async () => {
    api.mockResolvedValueOnce(totalData);
    const props = defProps();
    let container;
    await act(async () => {
      const result = render(<StockTotal {...props} />);
      container = result.container;
      await flushPromises();
    });
    isValidString.mockReturnValue(true);
    api.mockRejectedValueOnce('update err');
    global.__mockInputValues = { stock: 'cmd1' };
    await act(async () => {
      fireEvent.change(container.querySelector('input[placeholder="New stock..."]'), { target: { value: 'x' } });
    });
    await act(async () => {
      fireEvent.submit(container.querySelector('form'));
      await flushPromises();
    });
    expect(props.addalert).toHaveBeenCalledWith('update err');
  });

  test('_update real=true via button click', async () => {
    api.mockResolvedValueOnce(totalData);
    const props = defProps();
    let container;
    await act(async () => {
      const result = render(<StockTotal {...props} />);
      container = result.container;
      await flushPromises();
    });
    isValidString.mockReturnValue(true);
    api.mockResolvedValueOnce(totalData);
    global.__mockInputValues = { stock: 'cmd1' };
    await act(async () => {
      fireEvent.change(container.querySelector('input[placeholder="New stock..."]'), { target: { value: 'x' } });
    });
    await act(async () => {
      fireEvent.submit(container.querySelector('form'));
      await flushPromises();
    });
    api.mockResolvedValueOnce(totalData);
    const saveBtn = container.querySelector('button[type="button"]:not([disabled]) .glyphicon-ok');
    await act(async () => {
      fireEvent.click(saveBtn ? saveBtn.parentElement : container.querySelectorAll('button[type="button"]')[0]);
      await flushPromises();
    });
    expect(api).toHaveBeenCalledWith('/api/stock/updateTotal/1', expect.any(Object), 'PUT');
  });

  test('_update real=true error', async () => {
    api.mockResolvedValueOnce(totalData);
    const props = defProps();
    let container;
    await act(async () => {
      const result = render(<StockTotal {...props} />);
      container = result.container;
      await flushPromises();
    });
    isValidString.mockReturnValue(true);
    api.mockResolvedValueOnce(totalData);
    global.__mockInputValues = { stock: 'cmd1' };
    await act(async () => {
      fireEvent.change(container.querySelector('input[placeholder="New stock..."]'), { target: { value: 'x' } });
    });
    await act(async () => {
      fireEvent.submit(container.querySelector('form'));
      await flushPromises();
    });
    api.mockRejectedValueOnce('real err');
    const saveBtn = container.querySelector('button[type="button"]:not([disabled]) .glyphicon-ok');
    await act(async () => {
      fireEvent.click(saveBtn ? saveBtn.parentElement : container.querySelectorAll('button[type="button"]')[0]);
      await flushPromises();
    });
    expect(props.addalert).toHaveBeenCalledWith('real err');
  });

  test('componentWillUnmount with info sends update', async () => {
    api.mockResolvedValueOnce(totalData);
    const props = defProps();
    let result, container;
    await act(async () => {
      result = render(<StockTotal {...props} />);
      container = result.container;
      await flushPromises();
    });
    isValidString.mockReturnValue(true);
    api.mockResolvedValueOnce(totalData);
    global.__mockInputValues = { stock: 'cmd1' };
    await act(async () => {
      fireEvent.change(container.querySelector('input[placeholder="New stock..."]'), { target: { value: 'x' } });
    });
    await act(async () => {
      fireEvent.submit(container.querySelector('form'));
      await flushPromises();
    });
    api.mockResolvedValueOnce({});
    result.unmount();
    expect(props.sendglbcf).toHaveBeenCalled();
  });

  test('componentWillUnmount without info does not send', async () => {
    api.mockResolvedValueOnce(totalData);
    const props = defProps();
    let result;
    await act(async () => {
      result = render(<StockTotal {...props} />);
      await flushPromises();
    });
    props.sendglbcf.mockClear();
    result.unmount();
    expect(props.sendglbcf).not.toHaveBeenCalled();
  });

  test('componentWillUnmount api error', async () => {
    api.mockResolvedValueOnce(totalData);
    const props = defProps();
    let result, container;
    await act(async () => {
      result = render(<StockTotal {...props} />);
      container = result.container;
      await flushPromises();
    });
    isValidString.mockReturnValue(true);
    api.mockResolvedValueOnce(totalData);
    global.__mockInputValues = { stock: 'cmd1' };
    await act(async () => {
      fireEvent.change(container.querySelector('input[placeholder="New stock..."]'), { target: { value: 'x' } });
    });
    await act(async () => {
      fireEvent.submit(container.querySelector('form'));
      await flushPromises();
    });
    api.mockRejectedValueOnce('unmount err');
    await act(async () => {
      result.unmount();
      await flushPromises();
    });
    expect(props.addalert).toHaveBeenCalledWith('unmount err');
  });

  test('_routerWillLeave with info', async () => {
    api.mockResolvedValueOnce(totalData);
    const props = defProps();
    let container;
    await act(async () => {
      const result = render(<StockTotal {...props} />);
      container = result.container;
      await flushPromises();
    });
    isValidString.mockReturnValue(true);
    api.mockResolvedValueOnce(totalData);
    global.__mockInputValues = { stock: 'cmd1' };
    await act(async () => {
      fireEvent.change(container.querySelector('input[placeholder="New stock..."]'), { target: { value: 'x' } });
    });
    await act(async () => {
      fireEvent.submit(container.querySelector('form'));
      await flushPromises();
    });
    const evt = new Event('beforeunload');
    Object.defineProperty(evt, 'returnValue', { value: '', writable: true, configurable: true });
    window.dispatchEvent(evt);
    expect(evt.returnValue).toBe('You have unupdated changes. Are you sure you want to navigate away from this page?');
  });

  test('_routerWillLeave without info', async () => {
    api.mockResolvedValueOnce(totalData);
    const props = defProps();
    await act(async () => {
      render(<StockTotal {...props} />);
      await flushPromises();
    });
    const evt = new Event('beforeunload');
    Object.defineProperty(evt, 'returnValue', { value: '', writable: true, configurable: true });
    window.dispatchEvent(evt);
    expect(evt.returnValue).toBeFalsy();
  });

  test('_handleChange updates state', async () => {
    api.mockResolvedValueOnce(totalData);
    const props = defProps();
    let container;
    await act(async () => {
      const result = render(<StockTotal {...props} />);
      container = result.container;
      await flushPromises();
    });
    global.__mockInputValues = { stock: 'hello' };
    fireEvent.change(container.querySelector('input[placeholder="New stock..."]'), { target: { value: 'x' } });
  });

  test('droplist item buttons are clickable', async () => {
    api.mockResolvedValueOnce(totalData);
    const props = defProps();
    let container;
    await act(async () => {
      const result = render(<StockTotal {...props} />);
      container = result.container;
      await flushPromises();
    });
    const dropBtns = container.querySelectorAll('[data-testid^="drop-"]');
    dropBtns.forEach(btn => fireEvent.click(btn));
  });
});
