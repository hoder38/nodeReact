import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

// Mock utility.js — keep everything real except api and killEvent
jest.mock('../utility.js', () => ({
  ...jest.requireActual('../utility.js'),
  api: jest.fn(),
  killEvent: jest.fn(),
}));

// Mock all container imports as simple elements
jest.mock('../containers/ReItemInput.js', () => () => <div data-testid="mock-ReItemInput" />);
jest.mock('../containers/ReItemPath.js', () => () => <div data-testid="mock-ReItemPath" />);
jest.mock('../containers/ReItemHead.js', () => () => <div data-testid="mock-ReItemHead" />);
jest.mock('../containers/ReCategorylist.js', () => (props) => <div data-testid="mock-ReCategorylist" data-collapse={props.collapse} />);
jest.mock('../containers/ReItemlist.js', () => () => <div data-testid="mock-ReItemlist" />);
jest.mock('../containers/ReFileAdd.js', () => () => <div data-testid="mock-ReFileAdd" />);
jest.mock('../containers/ReFileFeedback.js', () => () => <div data-testid="mock-ReFileFeedback" />);

// MediaWidget mock exposes buttons so we can trigger toggleFull/toggleShow
jest.mock('../containers/ReMediaWidget.js', () => (props) => (
  <div data-testid={`mock-ReMediaWidget-${props.mediaType}`} data-full={String(props.full)} data-show={String(props.show)}>
    <button data-testid={`toggleFull-${props.mediaType}`} onClick={props.toggleFull}>TF</button>
    <button data-testid={`toggleShow-${props.mediaType}`} onClick={() => props.toggleShow()}>TS</button>
    <button data-testid={`toggleShowOpen-${props.mediaType}`} onClick={() => props.toggleShow(true)}>TSO</button>
    <button data-testid={`toggleShowClose-${props.mediaType}`} onClick={() => props.toggleShow(false)}>TSC</button>
  </div>
));

jest.mock('../containers/RePasswordCategorylist.js', () => (props) => <div data-testid="mock-RePasswordCategorylist" data-collapse={props.collapse} />);
jest.mock('../containers/RePasswordItemPath.js', () => () => <div data-testid="mock-RePasswordItemPath" />);
jest.mock('../containers/RePasswordItemHead.js', () => () => <div data-testid="mock-RePasswordItemHead" />);
jest.mock('../containers/RePasswordItemlist.js', () => () => <div data-testid="mock-RePasswordItemlist" />);

jest.mock('../containers/ReBitfinexCategorylist.js', () => (props) => (
  <div data-testid="mock-ReBitfinexCategorylist" data-bdirs={JSON.stringify(props.bdirs)} />
));
jest.mock('../containers/ReBitfinexItemHead.js', () => () => <div data-testid="mock-ReBitfinexItemHead" />);
jest.mock('../containers/ReBitfinexItemlist.js', () => () => <div data-testid="mock-ReBitfinexItemlist" />);

jest.mock('../containers/ReStockCategorylist.js', () => (props) => (
  <div data-testid="mock-ReStockCategorylist" data-stockopen={String(props.stockopen)} data-stock={JSON.stringify(props.stock)}>
    <button data-testid="catlist-setstock-btn" onClick={props.setstock}>CS</button>
    <button data-testid="catlist-stockopen2-btn" onClick={props.stockopen2}>SO2</button>
  </div>
));
jest.mock('../containers/ReStockItemHead.js', () => () => <div data-testid="mock-ReStockItemHead" />);
jest.mock('../containers/ReStockItemPath.js', () => () => <div data-testid="mock-ReStockItemPath" />);
jest.mock('../containers/ReStockItemlist.js', () => (props) => (
  <div data-testid="mock-ReStockItemlist">
    <button data-testid="setstock-btn" onClick={() => props.setstock({ id: 'test-item' })}>SS</button>
  </div>
));
jest.mock('../containers/ReStockInfo.js', () => (props) => (
  <div data-testid="mock-ReStockInfo" data-item={JSON.stringify(props.item)} />
));
jest.mock('../containers/ReStockTotal.js', () => (props) => (
  <div data-testid="mock-ReStockTotal" data-open={String(props.open)}>
    <button data-testid="stock-toggle-btn" onClick={props.toggle}>T</button>
  </div>
));
jest.mock('../containers/ReUserInfo.js', () => (props) => (
  <div data-testid={`mock-ReUserInfo-${props.user.id}`} />
));

import { api, killEvent } from '../utility.js';
import TopSection from './TopSection.js';
import Storage from './Storage.js';
import FileManage from './FileManage.js';
import WidgetManage from './WidgetManage.js';
import MediaManage from './MediaManage.js';
import Password from './Password.js';
import Bitfinex from './Bitfinex.js';
import Stock from './Stock.js';
import Userlist from './Userlist.js';
import Homepage from './Homepage.js';
import Navlist from './Navlist.js';

beforeEach(() => {
  api.mockReset();
  killEvent.mockReset();
});

// ─── TopSection ──────────────────────────────────────────────────────
describe('TopSection', () => {
  test('renders section#top-section with three container children', () => {
    const { container } = render(<TopSection />);
    const section = container.querySelector('#top-section');
    expect(section).toBeTruthy();
    expect(section.style.zIndex).toBe('10');
    expect(screen.getByTestId('mock-ReItemInput')).toBeTruthy();
    expect(screen.getByTestId('mock-ReItemPath')).toBeTruthy();
    expect(screen.getByTestId('mock-ReItemHead')).toBeTruthy();
  });
});

// ─── Storage ─────────────────────────────────────────────────────────
describe('Storage', () => {
  test('renders Categorylist, top-section, and Itemlist', () => {
    const { container } = render(<Storage />);
    expect(screen.getByTestId('mock-ReCategorylist')).toBeTruthy();
    expect(screen.getByTestId('mock-ReCategorylist').dataset.collapse).toBe('RIGHT');
    expect(container.querySelector('#top-section')).toBeTruthy();
    expect(screen.getByTestId('mock-ReItemInput')).toBeTruthy();
    expect(screen.getByTestId('mock-ReItemPath')).toBeTruthy();
    expect(screen.getByTestId('mock-ReItemHead')).toBeTruthy();
    expect(screen.getByTestId('mock-ReItemlist')).toBeTruthy();
  });
});

// ─── FileManage ──────────────────────────────────────────────────────
describe('FileManage', () => {
  test('renders file-manage-section with FileAdd and FileFeedback', () => {
    const { container } = render(<FileManage />);
    const section = container.querySelector('#file-manage-section');
    expect(section).toBeTruthy();
    expect(section.style.zIndex).toBe('1070');
    expect(screen.getByTestId('mock-ReFileAdd')).toBeTruthy();
    expect(screen.getByTestId('mock-ReFileFeedback')).toBeTruthy();
  });
});

// ─── WidgetManage ────────────────────────────────────────────────────
describe('WidgetManage', () => {
  test('all numbers > 0: all widgets visible', () => {
    const { container } = render(
      <WidgetManage
        uploadProgress={75}
        feedbackNumber={3}
        musicNumber={2} musicMore={true}
        videoNumber={4} videoMore={false}
        imageNumber={1} imageMore={true}
        playlistNumber={5} playlistMore={false}
      />
    );
    const section = container.querySelector('#widget-manage-section');
    expect(section).toBeTruthy();
    expect(section.style.zIndex).toBe('1060');

    // Uploader always visible
    const uploaderBtn = container.querySelector('[data-widget="UPLOAD"]');
    expect(uploaderBtn.style.display).not.toBe('none');
    expect(uploaderBtn.querySelector('.badge').textContent).toBe('75%');

    // All others visible
    ['FEEDBACK', 'VIDEO', 'MUSIC', 'IMAGE', 'PLAYLIST'].forEach(widget => {
      expect(container.querySelector(`[data-widget="${widget}"]`).style.display).not.toBe('none');
    });
  });

  test('all numbers = 0: only Uploader visible', () => {
    const { container } = render(
      <WidgetManage
        uploadProgress={0}
        feedbackNumber={0}
        musicNumber={0} musicMore={false}
        videoNumber={0} videoMore={false}
        imageNumber={0} imageMore={false}
        playlistNumber={0} playlistMore={false}
      />
    );
    const uploaderBtn = container.querySelector('[data-widget="UPLOAD"]');
    expect(uploaderBtn.style.display).not.toBe('none');
    expect(uploaderBtn.querySelector('.badge').textContent).toBe('0%');

    ['FEEDBACK', 'VIDEO', 'MUSIC', 'IMAGE', 'PLAYLIST'].forEach(widget => {
      expect(container.querySelector(`[data-widget="${widget}"]`).style.display).toBe('none');
    });
  });
});

// ─── MediaManage ─────────────────────────────────────────────────────
describe('MediaManage', () => {
  test('initial render: not full, all show=false', () => {
    const { container } = render(<MediaManage />);
    const section = container.querySelector('section');
    expect(section.style.top).toBe('60px');
    expect(section.style.right).toBe('10px');
    expect(section.style.maxWidth).toBe('50%');

    [2, 3, 4, 9].forEach(mt => {
      expect(screen.getByTestId(`mock-ReMediaWidget-${mt}`).dataset.full).toBe('false');
      expect(screen.getByTestId(`mock-ReMediaWidget-${mt}`).dataset.show).toBe('false');
    });
  });

  test('toggleFull changes section CSS to full-screen', () => {
    const { container } = render(<MediaManage />);
    act(() => { fireEvent.click(screen.getByTestId('toggleFull-2')); });

    const section = container.querySelector('section');
    expect(section.style.top).toBe('0px');
    expect(section.style.left).toBe('0px');
    expect(section.style.maxWidth).toBe('98vw');

    [2, 3, 4, 9].forEach(mt => {
      expect(screen.getByTestId(`mock-ReMediaWidget-${mt}`).dataset.full).toBe('true');
    });

    // Toggle back
    act(() => { fireEvent.click(screen.getByTestId('toggleFull-3')); });
    expect(container.querySelector('section').style.top).toBe('60px');
  });

  test('toggleShow with null toggles show for target, resets others', () => {
    render(<MediaManage />);

    // Toggle show for widget index 0 (mediaType=2, IMAGE)
    act(() => { fireEvent.click(screen.getByTestId('toggleShow-2')); });
    expect(screen.getByTestId('mock-ReMediaWidget-2').dataset.show).toBe('true');
    expect(screen.getByTestId('mock-ReMediaWidget-3').dataset.show).toBe('false');
    expect(screen.getByTestId('mock-ReMediaWidget-4').dataset.show).toBe('false');
    expect(screen.getByTestId('mock-ReMediaWidget-9').dataset.show).toBe('false');

    // Toggle again → back to false
    act(() => { fireEvent.click(screen.getByTestId('toggleShow-2')); });
    expect(screen.getByTestId('mock-ReMediaWidget-2').dataset.show).toBe('false');
  });

  test('toggleShow with explicit value sets show directly', () => {
    render(<MediaManage />);

    // Open with true
    act(() => { fireEvent.click(screen.getByTestId('toggleShowOpen-3')); });
    expect(screen.getByTestId('mock-ReMediaWidget-3').dataset.show).toBe('true');

    // Close with false
    act(() => { fireEvent.click(screen.getByTestId('toggleShowClose-3')); });
    expect(screen.getByTestId('mock-ReMediaWidget-3').dataset.show).toBe('false');
  });

  test('opening one widget closes others', () => {
    render(<MediaManage />);

    act(() => { fireEvent.click(screen.getByTestId('toggleShow-2')); });
    expect(screen.getByTestId('mock-ReMediaWidget-2').dataset.show).toBe('true');

    // Open a different widget → first one closes
    act(() => { fireEvent.click(screen.getByTestId('toggleShow-4')); });
    expect(screen.getByTestId('mock-ReMediaWidget-2').dataset.show).toBe('false');
    expect(screen.getByTestId('mock-ReMediaWidget-4').dataset.show).toBe('true');

    // Open PLAYLIST widget (index 3, mediaType 9) to cover its toggleShow arrow
    act(() => { fireEvent.click(screen.getByTestId('toggleShow-9')); });
    expect(screen.getByTestId('mock-ReMediaWidget-4').dataset.show).toBe('false');
    expect(screen.getByTestId('mock-ReMediaWidget-9').dataset.show).toBe('true');
  });

  test('exercises both default and explicit branches of every toggleShow arrow', () => {
    render(<MediaManage />);
    // Each (open=null) default param has 2 branches: used vs provided.
    // Cover non-default for IMAGE (0), MUSIC (2), PLAYLIST (3)
    act(() => { fireEvent.click(screen.getByTestId('toggleShowOpen-2')); });
    act(() => { fireEvent.click(screen.getByTestId('toggleShowOpen-4')); });
    act(() => { fireEvent.click(screen.getByTestId('toggleShowOpen-9')); });
    // Cover default (no-arg) for VIDEO (1)
    act(() => { fireEvent.click(screen.getByTestId('toggleShow-3')); });
    expect(screen.getByTestId('mock-ReMediaWidget-3').dataset.show).toBe('true');
  });
});

// ─── Password ────────────────────────────────────────────────────────
describe('Password', () => {
  const makeProps = (overrides = {}) => ({
    pdirsset: jest.fn(),
    sendglbcf: jest.fn(),
    pushpdir: jest.fn(),
    addalert: jest.fn(),
    ...overrides,
  });

  test('renders all children', async () => {
    api.mockResolvedValueOnce({ parentList: [] });
    const props = makeProps();
    await act(async () => { render(<Password {...props} />); });

    expect(screen.getByTestId('mock-RePasswordCategorylist')).toBeTruthy();
    expect(screen.getByTestId('mock-RePasswordCategorylist').dataset.collapse).toBe('RIGHT');
    expect(screen.getByTestId('mock-ReItemInput')).toBeTruthy();
    expect(screen.getByTestId('mock-RePasswordItemPath')).toBeTruthy();
    expect(screen.getByTestId('mock-RePasswordItemHead')).toBeTruthy();
    expect(screen.getByTestId('mock-RePasswordItemlist')).toBeTruthy();
  });

  test('componentDidMount success: calls pdirsset with parentList and mapper', async () => {
    const parentList = [{ show: 'DirOne', name: 'dir1' }];
    api.mockResolvedValueOnce({ parentList });
    const props = makeProps();
    await act(async () => { render(<Password {...props} />); });

    expect(api).toHaveBeenCalledWith('/api/parent/password/list');
    expect(props.pdirsset).toHaveBeenCalledWith(parentList, expect.any(Function));

    // Verify mapper output
    const mapper = props.pdirsset.mock.calls[0][1];
    const mapped = mapper({ show: 'DirOne', name: 'dir1' }, 0);
    expect(mapped).toEqual({ title: 'DirOne', name: 'dir1', key: 0, onclick: expect.any(Function) });
  });

  test('componentDidMount success: mapper onclick calls sendglbcf then pushpdir', async () => {
    const parentList = [{ show: 'MyDir', name: 'mydir' }];
    api.mockResolvedValueOnce({ parentList });
    const props = makeProps();
    await act(async () => { render(<Password {...props} />); });

    const mapper = props.pdirsset.mock.calls[0][1];
    const mapped = mapper({ show: 'MyDir', name: 'mydir' }, 0);

    // Call onclick
    mapped.onclick('testTag');
    expect(props.sendglbcf).toHaveBeenCalledWith(expect.any(Function), 'Would you sure add testTag to MyDir?');

    // Execute the confirm action — api add succeeds
    api.mockResolvedValueOnce({ id: 'new-entry' });
    const confirmAction = props.sendglbcf.mock.calls[0][0];
    await confirmAction();
    expect(api).toHaveBeenCalledWith('/api/parent/password/add', { name: 'mydir', tag: 'testTag' });
    expect(props.pushpdir).toHaveBeenCalledWith('mydir', { id: 'new-entry' });
  });

  test('componentDidMount success: mapper onclick inner api error calls addalert', async () => {
    api.mockResolvedValueOnce({ parentList: [{ show: 'D', name: 'd' }] });
    const props = makeProps();
    await act(async () => { render(<Password {...props} />); });

    const mapper = props.pdirsset.mock.calls[0][1];
    const mapped = mapper({ show: 'D', name: 'd' }, 0);
    mapped.onclick('tag');

    api.mockRejectedValueOnce('add-error');
    const confirmAction = props.sendglbcf.mock.calls[0][0];
    await confirmAction();
    expect(props.addalert).toHaveBeenCalledWith('add-error');
  });

  test('componentDidMount error: calls addalert', async () => {
    api.mockRejectedValueOnce('list-error');
    const props = makeProps();
    await act(async () => { render(<Password {...props} />); });

    expect(props.addalert).toHaveBeenCalledWith('list-error');
  });
});

// ─── Bitfinex ────────────────────────────────────────────────────────
describe('Bitfinex', () => {
  test('renders all children', async () => {
    const { container } = render(<Bitfinex addalert={jest.fn()} />);
    expect(screen.getByTestId('mock-ReBitfinexCategorylist')).toBeTruthy();
    expect(container.querySelector('#top-section')).toBeTruthy();
    expect(screen.getByTestId('mock-ReBitfinexItemHead')).toBeTruthy();
    expect(screen.getByTestId('mock-ReBitfinexItemlist')).toBeTruthy();
  });

  test('no mainUrl: api not called, parent is empty', () => {
    render(<Bitfinex addalert={jest.fn()} />);
    expect(api).not.toHaveBeenCalled();
    expect(JSON.parse(screen.getByTestId('mock-ReBitfinexCategorylist').dataset.bdirs)).toEqual([]);
  });

  test('with mainUrl: api success sets parent state', async () => {
    api.mockResolvedValueOnce(['BTC', 'ETH']);
    await act(async () => { render(<Bitfinex mainUrl="http://host" addalert={jest.fn()} />); });

    expect(api).toHaveBeenCalledWith('http://host/api/bitfinex/parent');
    expect(JSON.parse(screen.getByTestId('mock-ReBitfinexCategorylist').dataset.bdirs)).toEqual(['BTC', 'ETH']);
  });

  test('with mainUrl: api error calls addalert', async () => {
    const addalert = jest.fn();
    api.mockRejectedValueOnce('mount-err');
    await act(async () => { render(<Bitfinex mainUrl="http://host" addalert={addalert} />); });

    expect(addalert).toHaveBeenCalledWith('mount-err');
  });

  test('componentDidUpdate: mainUrl changes triggers new api call', async () => {
    api.mockResolvedValueOnce(['A']);
    const addalert = jest.fn();
    let rerenderFn;
    await act(async () => {
      const { rerender } = render(<Bitfinex mainUrl="http://a" addalert={addalert} />);
      rerenderFn = rerender;
    });
    expect(JSON.parse(screen.getByTestId('mock-ReBitfinexCategorylist').dataset.bdirs)).toEqual(['A']);

    api.mockResolvedValueOnce(['B', 'C']);
    await act(async () => { rerenderFn(<Bitfinex mainUrl="http://b" addalert={addalert} />); });

    expect(api).toHaveBeenCalledWith('http://b/api/bitfinex/parent');
    expect(JSON.parse(screen.getByTestId('mock-ReBitfinexCategorylist').dataset.bdirs)).toEqual(['B', 'C']);
  });

  test('componentDidUpdate: same mainUrl does not call api again', async () => {
    api.mockResolvedValueOnce(['X']);
    const addalert = jest.fn();
    let rerenderFn;
    await act(async () => {
      const { rerender } = render(<Bitfinex mainUrl="http://same" addalert={addalert} />);
      rerenderFn = rerender;
    });

    api.mockClear();
    await act(async () => { rerenderFn(<Bitfinex mainUrl="http://same" addalert={addalert} />); });
    expect(api).not.toHaveBeenCalled();
  });

  test('componentDidUpdate: api error on update calls addalert', async () => {
    api.mockResolvedValueOnce(['ok']);
    const addalert = jest.fn();
    let rerenderFn;
    await act(async () => {
      const { rerender } = render(<Bitfinex mainUrl="http://a" addalert={addalert} />);
      rerenderFn = rerender;
    });

    api.mockRejectedValueOnce('update-err');
    await act(async () => { rerenderFn(<Bitfinex mainUrl="http://b" addalert={addalert} />); });
    expect(addalert).toHaveBeenCalledWith('update-err');
  });
});

// ─── Stock ───────────────────────────────────────────────────────────
describe('Stock', () => {
  const makeProps = (overrides = {}) => ({
    sdirsset: jest.fn(),
    sendglbcf: jest.fn(),
    pushsdir: jest.fn(),
    addalert: jest.fn(),
    ...overrides,
  });

  test('renders initial state: shows itemlist, path, head', async () => {
    api.mockResolvedValueOnce({ parentList: [] });
    const props = makeProps();
    await act(async () => { render(<Stock {...props} />); });

    expect(screen.getByTestId('mock-ReStockCategorylist')).toBeTruthy();
    expect(screen.getByTestId('mock-ReItemInput')).toBeTruthy();
    expect(screen.getByTestId('mock-ReStockItemPath')).toBeTruthy();
    expect(screen.getByTestId('mock-ReStockItemHead')).toBeTruthy();
    expect(screen.getByTestId('mock-ReStockItemlist')).toBeTruthy();
    expect(screen.queryByTestId('mock-ReStockInfo')).toBeFalsy();
    expect(screen.getByTestId('mock-ReStockTotal')).toBeTruthy();
    expect(screen.getByTestId('mock-ReStockTotal').dataset.open).toBe('false');
  });

  test('componentDidMount: api success calls sdirsset', async () => {
    const parentList = [{ show: 'StockDir', name: 'sdir' }];
    api.mockResolvedValueOnce({ parentList });
    const props = makeProps();
    await act(async () => { render(<Stock {...props} />); });

    expect(api).toHaveBeenCalledWith('/api/parent/stock/list');
    expect(props.sdirsset).toHaveBeenCalledWith(parentList, expect.any(Function));
  });

  test('componentDidMount: api error calls addalert', async () => {
    api.mockRejectedValueOnce('stock-list-err');
    const props = makeProps();
    await act(async () => { render(<Stock {...props} />); });

    expect(props.addalert).toHaveBeenCalledWith('stock-list-err');
  });

  test('componentDidMount: mapper onclick success calls pushsdir', async () => {
    api.mockResolvedValueOnce({ parentList: [{ show: 'SD', name: 'sd' }] });
    const props = makeProps();
    await act(async () => { render(<Stock {...props} />); });

    const mapper = props.sdirsset.mock.calls[0][1];
    const mapped = mapper({ show: 'SD', name: 'sd' }, 0);
    expect(mapped).toEqual({ title: 'SD', name: 'sd', key: 0, onclick: expect.any(Function) });

    mapped.onclick('sTag');
    expect(props.sendglbcf).toHaveBeenCalledWith(expect.any(Function), 'Would you sure add sTag to SD?');

    api.mockResolvedValueOnce({ id: 'added' });
    await props.sendglbcf.mock.calls[0][0]();
    expect(api).toHaveBeenCalledWith('/api/parent/stock/add', { name: 'sd', tag: 'sTag' });
    expect(props.pushsdir).toHaveBeenCalledWith('sd', { id: 'added' });
  });

  test('componentDidMount: mapper onclick inner api error calls addalert', async () => {
    api.mockResolvedValueOnce({ parentList: [{ show: 'SD', name: 'sd' }] });
    const props = makeProps();
    await act(async () => { render(<Stock {...props} />); });

    const mapper = props.sdirsset.mock.calls[0][1];
    const mapped = mapper({ show: 'SD', name: 'sd' }, 0);
    mapped.onclick('t');

    api.mockRejectedValueOnce('add-err');
    await props.sendglbcf.mock.calls[0][0]();
    expect(props.addalert).toHaveBeenCalledWith('add-err');
  });

  test('setstock: shows StockInfo, hides path/head', async () => {
    api.mockResolvedValueOnce({ parentList: [] });
    const props = makeProps();
    await act(async () => { render(<Stock {...props} />); });

    act(() => { fireEvent.click(screen.getByTestId('setstock-btn')); });

    expect(screen.getByTestId('mock-ReStockInfo')).toBeTruthy();
    expect(JSON.parse(screen.getByTestId('mock-ReStockInfo').dataset.item)).toEqual({ id: 'test-item' });
    expect(screen.queryByTestId('mock-ReStockItemlist')).toBeFalsy();
    expect(screen.queryByTestId('mock-ReStockItemPath')).toBeFalsy();
    expect(screen.queryByTestId('mock-ReStockItemHead')).toBeFalsy();
  });

  test('categorylist setstock toggles open (item truthy + open false branch)', async () => {
    api.mockResolvedValueOnce({ parentList: [] });
    const props = makeProps();
    await act(async () => { render(<Stock {...props} />); });

    // First open via itemlist setstock
    act(() => { fireEvent.click(screen.getByTestId('setstock-btn')); });
    expect(screen.getByTestId('mock-ReStockInfo')).toBeTruthy();

    // Toggle open back via categorylist setstock → open=false, item still set
    act(() => { fireEvent.click(screen.getByTestId('catlist-setstock-btn')); });
    expect(screen.queryByTestId('mock-ReStockInfo')).toBeFalsy();
    expect(screen.getByTestId('mock-ReStockItemlist')).toBeTruthy();
    expect(screen.getByTestId('mock-ReStockItemPath')).toBeTruthy();
    expect(screen.getByTestId('mock-ReStockItemHead')).toBeTruthy();
  });

  test('_toggle toggles open2 on StockTotal', async () => {
    api.mockResolvedValueOnce({ parentList: [] });
    const props = makeProps();
    await act(async () => { render(<Stock {...props} />); });

    expect(screen.getByTestId('mock-ReStockTotal').dataset.open).toBe('false');

    act(() => { fireEvent.click(screen.getByTestId('stock-toggle-btn')); });
    expect(screen.getByTestId('mock-ReStockTotal').dataset.open).toBe('true');

    act(() => { fireEvent.click(screen.getByTestId('stock-toggle-btn')); });
    expect(screen.getByTestId('mock-ReStockTotal').dataset.open).toBe('false');
  });
});

// ─── Userlist ────────────────────────────────────────────────────────
describe('Userlist', () => {
  test('empty user_info calls api and renders no user rows', async () => {
    api.mockResolvedValueOnce({ user_info: [{ id: 'u1' }] });
    const userset = jest.fn();
    const addalert = jest.fn();
    const user_info = new Map();

    await act(async () => {
      render(<Userlist user_info={user_info} userset={userset} addalert={addalert} />);
    });

    expect(api).toHaveBeenCalledWith('/api/user/act');
    expect(userset).toHaveBeenCalledWith([{ id: 'u1' }]);
  });

  test('populated user_info skips api and renders user rows', () => {
    const user_info = new Map([
      ['u1', { id: 'u1', name: 'Alice' }],
      ['u2', { id: 'u2', name: 'Bob' }],
    ]);
    render(<Userlist user_info={user_info} userset={jest.fn()} addalert={jest.fn()} />);

    expect(api).not.toHaveBeenCalled();
    expect(screen.getByTestId('mock-ReUserInfo-u1')).toBeTruthy();
    expect(screen.getByTestId('mock-ReUserInfo-u2')).toBeTruthy();
  });

  test('api error calls addalert', async () => {
    api.mockRejectedValueOnce('user-err');
    const addalert = jest.fn();
    await act(async () => {
      render(<Userlist user_info={new Map()} userset={jest.fn()} addalert={addalert} />);
    });

    expect(addalert).toHaveBeenCalledWith('user-err');
  });

  test('renders structural elements', () => {
    const user_info = new Map([['u1', { id: 'u1' }]]);
    const { container } = render(
      <Userlist user_info={user_info} userset={jest.fn()} addalert={jest.fn()} />
    );
    expect(container.querySelector('#inverse-nav')).toBeTruthy();
    expect(container.querySelector('#top-section')).toBeTruthy();
    expect(screen.getByTestId('mock-ReItemInput')).toBeTruthy();
    expect(container.querySelector('.user-infos')).toBeTruthy();
  });
});

// ─── Homepage ────────────────────────────────────────────────────────
describe('Homepage', () => {
  test('renders intro messages from api', async () => {
    api.mockResolvedValueOnce({ msg: ['Welcome', 'to ANoMoPi'] });
    await act(async () => { render(<Homepage />); });

    expect(api).toHaveBeenCalledWith('/api/homepage');
    expect(screen.getByText('Welcome')).toBeTruthy();
    expect(screen.getByText('to ANoMoPi')).toBeTruthy();
  });

  test('api error logs to console', async () => {
    const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
    api.mockRejectedValueOnce('homepage-err');
    await act(async () => { render(<Homepage />); });

    expect(consoleSpy).toHaveBeenCalledWith('homepage-err');
    consoleSpy.mockRestore();
  });

  test('renders structural elements', async () => {
    api.mockResolvedValueOnce({ msg: [] });
    let container;
    await act(async () => { ({ container } = render(<Homepage />)); });

    expect(container.querySelector('#inverse-nav')).toBeTruthy();
    expect(container.querySelector('#top-section')).toBeTruthy();
    expect(screen.getByTestId('mock-ReItemInput')).toBeTruthy();
  });
});

// ─── Navlist ─────────────────────────────────────────────────────────
describe('Navlist', () => {
  let collapseBtn;

  afterEach(() => {
    if (collapseBtn && collapseBtn.parentNode) {
      collapseBtn.parentNode.removeChild(collapseBtn);
      collapseBtn = null;
    }
  });

  test('renders collapsed by default with both NavLink and Link', () => {
    const navlist = [
      { key: '1', hash: '/', css: 'fa fa-home', title: 'Home' },
      { key: '2', hash: '/Storage', css: 'fa fa-star', title: 'Storage' },
    ];
    const { container } = render(
      <MemoryRouter><Navlist collapse="test" navlist={navlist} /></MemoryRouter>
    );
    expect(container.querySelector('.navbar-collapse.collapse')).toBeTruthy();
    expect(container.querySelector('.collapse.in')).toBeFalsy();
    expect(container.querySelector('a[href="/"]')).toBeTruthy();
    expect(container.querySelector('a[href="/Storage"]')).toBeTruthy();
    expect(screen.getByText(/Home/)).toBeTruthy();
    expect(screen.getByText(/Storage/)).toBeTruthy();
  });

  test('clicking data-collapse element toggles class', () => {
    collapseBtn = document.createElement('button');
    collapseBtn.setAttribute('data-collapse', 'myCollapse');
    document.body.appendChild(collapseBtn);

    const { container } = render(
      <MemoryRouter><Navlist collapse="myCollapse" navlist={[]} /></MemoryRouter>
    );
    expect(container.querySelector('.collapse.in')).toBeFalsy();

    // Click toggles collapse state
    act(() => { fireEvent.click(collapseBtn); });
    expect(container.querySelector('.collapse.in')).toBeTruthy();

    // Click again toggles back
    act(() => { fireEvent.click(collapseBtn); });
    expect(container.querySelector('.collapse.in')).toBeFalsy();

    expect(killEvent).toHaveBeenCalledTimes(2);
  });

  test('no matching data-collapse elements: no listeners added or removed', () => {
    const { unmount } = render(
      <MemoryRouter><Navlist collapse="no-match" navlist={[]} /></MemoryRouter>
    );
    // Should not throw on unmount (length===0 branch)
    unmount();
  });

  test('unmount removes event listeners from matching elements', () => {
    collapseBtn = document.createElement('button');
    collapseBtn.setAttribute('data-collapse', 'cleanup');
    document.body.appendChild(collapseBtn);
    const removeSpy = jest.spyOn(collapseBtn, 'removeEventListener');

    const { unmount } = render(
      <MemoryRouter><Navlist collapse="cleanup" navlist={[]} /></MemoryRouter>
    );
    unmount();
    expect(removeSpy).toHaveBeenCalledWith('click', expect.any(Function));
    removeSpy.mockRestore();
  });

  test('empty navlist renders no links', () => {
    const { container } = render(
      <MemoryRouter><Navlist collapse="test" navlist={[]} /></MemoryRouter>
    );
    expect(container.querySelectorAll('li')).toHaveLength(0);
  });
});
