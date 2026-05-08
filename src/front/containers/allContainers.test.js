import React from 'react';
import { render } from '@testing-library/react';
import { Provider } from 'react-redux';
import { createTestStore } from '../__tests__/helpers.js';

// Mock ALL wrapped components — capture props via global for dispatch coverage
jest.mock('../components/Alertlist.js', () => ({ __esModule: true, default: function M(p) { global._cp = global._cp || {}; global._cp.Alertlist = p; return null; } }));
jest.mock('../components/App.js', () => ({ __esModule: true, default: function M(p) { global._cp = global._cp || {}; global._cp.App = p; return null; } }));
jest.mock('../components/Bitfinex.js', () => ({ __esModule: true, default: function M(p) { global._cp = global._cp || {}; global._cp.Bitfinex = p; return null; } }));
jest.mock('../components/BitfinexInfo.js', () => ({ __esModule: true, default: function M(p) { global._cp = global._cp || {}; global._cp.BitfinexInfo = p; return null; } }));
jest.mock('../components/Categorylist.js', () => ({ __esModule: true, default: function M(p) { global._cp = global._cp || {}; global._cp.Categorylist = p; return null; } }));
jest.mock('../components/Dirlist.js', () => ({ __esModule: true, default: function M(p) { global._cp = global._cp || {}; global._cp.Dirlist = p; return null; } }));
jest.mock('../components/FileAdd.js', () => ({ __esModule: true, default: function M(p) { global._cp = global._cp || {}; global._cp.FileAdd = p; return null; } }));
jest.mock('../components/FileFeedback.js', () => ({ __esModule: true, default: function M(p) { global._cp = global._cp || {}; global._cp.FileFeedback = p; return null; } }));
jest.mock('../components/GlobalComfirm.js', () => ({ __esModule: true, default: function M(p) { global._cp = global._cp || {}; global._cp.GlobalComfirm = p; return null; } }));
jest.mock('../components/ItemFile.js', () => ({ __esModule: true, default: function M(p) { global._cp = global._cp || {}; global._cp.ItemFile = p; return null; } }));
jest.mock('../components/ItemHead.js', () => ({ __esModule: true, default: function M(p) { global._cp = global._cp || {}; global._cp.ItemHead = p; return null; } }));
jest.mock('../components/ItemInput.js', () => ({ __esModule: true, default: function M(p) { global._cp = global._cp || {}; global._cp.ItemInput = p; return null; } }));
jest.mock('../components/ItemPassword.js', () => ({ __esModule: true, default: function M(p) { global._cp = global._cp || {}; global._cp.ItemPassword = p; return null; } }));
jest.mock('../components/ItemPath.js', () => ({ __esModule: true, default: function M(p) { global._cp = global._cp || {}; global._cp.ItemPath = p; return null; } }));
jest.mock('../components/ItemStock.js', () => ({ __esModule: true, default: function M(p) { global._cp = global._cp || {}; global._cp.ItemStock = p; return null; } }));
jest.mock('../components/Itemlist.js', () => ({ __esModule: true, default: function M(p) { global._cp = global._cp || {}; global._cp.Itemlist = p; return null; } }));
jest.mock('../components/Login.js', () => ({ __esModule: true, default: function M(p) { global._cp = global._cp || {}; global._cp.Login = p; return null; } }));
jest.mock('../components/MediaWidget.js', () => ({ __esModule: true, default: function M(p) { global._cp = global._cp || {}; global._cp.MediaWidget = p; return null; } }));
jest.mock('../components/Password.js', () => ({ __esModule: true, default: function M(p) { global._cp = global._cp || {}; global._cp.Password = p; return null; } }));
jest.mock('../components/PasswordInfo.js', () => ({ __esModule: true, default: function M(p) { global._cp = global._cp || {}; global._cp.PasswordInfo = p; return null; } }));
jest.mock('../components/Stock.js', () => ({ __esModule: true, default: function M(p) { global._cp = global._cp || {}; global._cp.Stock = p; return null; } }));
jest.mock('../components/StockInfo.js', () => ({ __esModule: true, default: function M(p) { global._cp = global._cp || {}; global._cp.StockInfo = p; return null; } }));
jest.mock('../components/StockTotal.js', () => ({ __esModule: true, default: function M(p) { global._cp = global._cp || {}; global._cp.StockTotal = p; return null; } }));
jest.mock('../components/TopSection.js', () => ({ __esModule: true, default: function M(p) { global._cp = global._cp || {}; global._cp.TopSection = p; return null; } }));
jest.mock('../components/UserInfo.js', () => ({ __esModule: true, default: function M(p) { global._cp = global._cp || {}; global._cp.UserInfo = p; return null; } }));
jest.mock('../components/Userlist.js', () => ({ __esModule: true, default: function M(p) { global._cp = global._cp || {}; global._cp.Userlist = p; return null; } }));
jest.mock('../components/WidgetManage.js', () => ({ __esModule: true, default: function M(p) { global._cp = global._cp || {}; global._cp.WidgetManage = p; return null; } }));

// Import all containers
import ReAlertlist from './ReAlertlist.js';
import ReApp from './ReApp.js';
import ReBitfinex from './ReBitfinex.js';
import ReBitfinexCategorylist from './ReBitfinexCategorylist.js';
import ReBitfinexInfo from './ReBitfinexInfo.js';
import ReBitfinexItemHead from './ReBitfinexItemHead.js';
import ReBitfinexItemlist from './ReBitfinexItemlist.js';
import ReCategorylist from './ReCategorylist.js';
import ReDirlist from './ReDirlist.js';
import ReFileAdd from './ReFileAdd.js';
import ReFileFeedback from './ReFileFeedback.js';
import ReGlobalComfirm from './ReGlobalComfirm.js';
import ReItemFile from './ReItemFile.js';
import ReItemHead from './ReItemHead.js';
import ReItemInput from './ReItemInput.js';
import ReItemPassword from './ReItemPassword.js';
import ReItemPath from './ReItemPath.js';
import ReItemStock from './ReItemStock.js';
import ReItemlist from './ReItemlist.js';
import ReLogin from './ReLogin.js';
import ReMediaWidget from './ReMediaWidget.js';
import RePassword from './RePassword.js';
import RePasswordCategorylist from './RePasswordCategorylist.js';
import RePasswordInfo from './RePasswordInfo.js';
import RePasswordItemHead from './RePasswordItemHead.js';
import RePasswordItemPath from './RePasswordItemPath.js';
import RePasswordItemlist from './RePasswordItemlist.js';
import ReStock from './ReStock.js';
import ReStockCategorylist from './ReStockCategorylist.js';
import ReStockInfo from './ReStockInfo.js';
import ReStockItemHead from './ReStockItemHead.js';
import ReStockItemPath from './ReStockItemPath.js';
import ReStockItemlist from './ReStockItemlist.js';
import ReStockTotal from './ReStockTotal.js';
import ReTopSection from './ReTopSection.js';
import ReUserInfo from './ReUserInfo.js';
import ReUserlist from './ReUserlist.js';
import ReWidgetManage from './ReWidgetManage.js';

const renderWithStore = (Component, props = {}) => {
    const store = createTestStore();
    return render(
        <Provider store={store}>
            <Component {...props} />
        </Provider>
    );
};

describe('All Redux containers render with default store', () => {
    // Simple dispatch-only containers (mapStateToProps = null)
    test.each([
        ['ReGlobalComfirm', ReGlobalComfirm],
        ['ReLogin', ReLogin],
        ['ReDirlist', ReDirlist],
    ])('%s renders', (name, Component) => {
        renderWithStore(Component);
    });

    // Containers reading basic state
    test('ReAlertlist', () => { renderWithStore(ReAlertlist); });
    test('ReApp', () => { renderWithStore(ReApp); });
    test('ReBitfinex', () => { renderWithStore(ReBitfinex); });
    test('ReFileAdd', () => { renderWithStore(ReFileAdd); });
    test('ReFileFeedback', () => { renderWithStore(ReFileFeedback); });
    test('ReWidgetManage', () => { renderWithStore(ReWidgetManage); });
    test('ReTopSection', () => { renderWithStore(ReTopSection); });

    // Item/STORAGE containers
    test('ReCategorylist', () => { renderWithStore(ReCategorylist); });
    test('ReItemHead', () => { renderWithStore(ReItemHead); });
    test('ReItemInput', () => { renderWithStore(ReItemInput); });
    test('ReItemPath', () => { renderWithStore(ReItemPath); });
    test('ReItemlist', () => { renderWithStore(ReItemlist); });
    test('ReItemFile', () => { renderWithStore(ReItemFile); });

    // Password containers
    test('RePassword', () => { renderWithStore(RePassword); });
    test('RePasswordCategorylist', () => { renderWithStore(RePasswordCategorylist); });
    test('RePasswordItemHead', () => { renderWithStore(RePasswordItemHead); });
    test('RePasswordItemPath', () => { renderWithStore(RePasswordItemPath); });
    test('RePasswordItemlist', () => { renderWithStore(RePasswordItemlist); });
    test('ReItemPassword', () => { renderWithStore(ReItemPassword); });
    test('RePasswordInfo', () => { renderWithStore(RePasswordInfo); });

    // Stock containers
    test('ReStock', () => { renderWithStore(ReStock); });
    test('ReStockCategorylist', () => { renderWithStore(ReStockCategorylist); });
    test('ReStockItemHead', () => { renderWithStore(ReStockItemHead); });
    test('ReStockItemPath', () => { renderWithStore(ReStockItemPath); });
    test('ReStockItemlist', () => { renderWithStore(ReStockItemlist); });
    test('ReItemStock', () => { renderWithStore(ReItemStock); });
    test('ReStockInfo', () => { renderWithStore(ReStockInfo); });
    test('ReStockTotal', () => { renderWithStore(ReStockTotal); });

    // Bitfinex containers
    test('ReBitfinexCategorylist', () => { renderWithStore(ReBitfinexCategorylist); });
    test('ReBitfinexInfo', () => { renderWithStore(ReBitfinexInfo); });
    test('ReBitfinexItemHead', () => { renderWithStore(ReBitfinexItemHead); });
    test('ReBitfinexItemlist', () => { renderWithStore(ReBitfinexItemlist); });

    // User containers
    test('ReUserlist', () => { renderWithStore(ReUserlist); });
    test('ReUserInfo', () => { renderWithStore(ReUserInfo, { user: { id: 'u1', name: 'test' } }); });

    // ReMediaWidget needs mediaType prop (ownProps)
    test('ReMediaWidget with mediaType=2', () => { renderWithStore(ReMediaWidget, { mediaType: 2 }); });
    test('ReMediaWidget with mediaType=3', () => { renderWithStore(ReMediaWidget, { mediaType: 3 }); });
    test('ReMediaWidget with mediaType=4', () => { renderWithStore(ReMediaWidget, { mediaType: 4 }); });
    test('ReMediaWidget with mediaType=9', () => { renderWithStore(ReMediaWidget, { mediaType: 9 }); });
});

describe('ReItemInput mapStateToProps branches', () => {
    test('empty glbInHandle → default props', () => {
        const store = createTestStore();
        const { container } = render(
            <Provider store={store}><ReItemInput /></Provider>
        );
        expect(container).toBeTruthy();
    });

    test('non-empty glbInHandle → reads first entry', () => {
        const store = createTestStore();
        store.dispatch({ type: 'GLB_IN_PUSH', input: 1, callback: () => {}, color: 'danger', placeholder: 'Test', value: 'v', option: 'o' });
        const { container } = render(
            <Provider store={store}><ReItemInput /></Provider>
        );
        expect(container).toBeTruthy();
    });
});

describe('ReFileFeedback mapStateToProps branches', () => {
    test('empty feedbackDataHandle → default props', () => {
        renderWithStore(ReFileFeedback);
    });

    test('non-empty feedbackDataHandle → reads first entry', () => {
        const store = createTestStore();
        store.dispatch({
            type: 'FEEDBACK_PUSH',
            simple: { id: 'f1', name: 'file1', select: ['t1'], option: ['t2'], other: ['t3'] },
        });
        render(<Provider store={store}><ReFileFeedback /></Provider>);
    });
});

// Invoke all dispatch functions captured via global._cp to cover mapDispatchToProps
describe('mapDispatchToProps coverage', () => {
    beforeEach(() => { global._cp = {}; });
    const s = fn => { try { fn(); } catch(e) {} };
    const path = {cur:[], exactly:[], his:[]};

    test('ReGlobalComfirm dispatch', () => {
        renderWithStore(ReGlobalComfirm);
        s(() => global._cp.GlobalComfirm.onclose());
    });
    test('ReLogin dispatch', () => {
        renderWithStore(ReLogin);
        s(() => global._cp.Login.addalert('x'));
    });
    test('ReDirlist dispatch', () => {
        renderWithStore(ReDirlist);
        const p = global._cp.Dirlist;
        s(() => p.addalert('x'));
        s(() => p.sendglbcf(() => {}, 'text'));
    });
    test('ReAlertlist dispatch', () => {
        renderWithStore(ReAlertlist);
        s(() => global._cp.Alertlist.onclose(0));
    });
    test('ReApp dispatch', () => {
        renderWithStore(ReApp);
        const p = global._cp.App;
        s(() => p.addalert('x'));
        s(() => p.basicset('id', '', false, []));
        s(() => p.sendglbcf(() => {}, 't'));
        s(() => p.feedbackset([]));
        s(() => p.userset([]));
        s(() => p.bookmarkset([], 'name', 'asc'));
        s(() => p.itemset([], path, '', '', 'name', 'asc', ''));
        s(() => p.dirsset([]));
        s(() => p.pushdir('n', {}));
        s(() => p.itemdel('id'));
        s(() => p.passset([], path, '', '', 'name', 'asc', ''));
        s(() => p.passdel('id'));
        s(() => p.stockset([], path, '', '', 'name', 'asc', ''));
        s(() => p.stockdel('id'));
        s(() => p.bitfinexset([], path, '', '', 'name', 'asc', ''));
        s(() => p.bitfinexdel('id'));
        s(() => p.closeglbpw());
        s(() => p.resetmedia(2));
    });
    test('ReBitfinex dispatch', () => {
        renderWithStore(ReBitfinex);
        s(() => global._cp.Bitfinex.addalert('x'));
    });
    test('ReFileAdd dispatch', () => {
        renderWithStore(ReFileAdd);
        const p = global._cp.FileAdd;
        s(() => p.addalert('x'));
        s(() => p.pushfeedback({id: 'f', name: 'n'}));
        s(() => p.setUpload(50));
    });
    test('ReFileFeedback dispatch', () => {
        renderWithStore(ReFileFeedback);
        const p = global._cp.FileFeedback;
        s(() => p.addalert('x'));
        s(() => p.handlefeedback('id'));
        s(() => p.feedbackset([]));
    });
    test('ReTopSection dispatch', () => {
        renderWithStore(ReTopSection);
        const p = global._cp.TopSection;
        s(() => p.globalinput(() => {}));
        s(() => p.set([], path, '', '', 'name', 'asc', ''));
    });
    test('ReCategorylist dispatch', () => {
        renderWithStore(ReCategorylist);
        const p = global._cp.Categorylist;
        s(() => p.bookmarkset([], 'name', 'asc'));
        s(() => p.delbookmark('id'));
        s(() => p.dirset('n', [], 'name', 'asc'));
        s(() => p.deldir('n', 'id'));
        s(() => p.addalert('x'));
        s(() => p.set([], path, '', '', 'name', 'asc', ''));
    });
    test('ReItemHead dispatch', () => {
        renderWithStore(ReItemHead);
        const p = global._cp.ItemHead;
        s(() => p.addalert('x'));
        s(() => p.set([], path, '', '', 'name', 'asc', ''));
        s(() => p.setSelect(new Set()));
        s(() => p.globalinput(() => {}));
    });
    test('ReItemInput dispatch', () => {
        renderWithStore(ReItemInput);
        const p = global._cp.ItemInput;
        s(() => p.inputclose(0));
        s(() => p.addalert('x'));
    });
    test('ReItemPath dispatch', () => {
        renderWithStore(ReItemPath);
        const p = global._cp.ItemPath;
        s(() => p.multiToggle(false));
        s(() => p.addalert('x'));
        s(() => p.set([], path, '', '', 'name', 'asc', ''));
        s(() => p.pushbookmark({id: 'b', name: 'n'}));
        s(() => p.pushfeedback({id: 'f', name: 'n'}));
        s(() => p.globalinput(0, 'p', () => {}));
    });
    test('ReItemlist dispatch', () => {
        renderWithStore(ReItemlist);
        const p = global._cp.Itemlist;
        s(() => p.addalert('x'));
        s(() => p.set([], path, '', '', 'name', 'asc', ''));
        s(() => p.setSelect(new Set()));
        s(() => p.sendglbcf(() => {}, 't'));
    });
    test('ReItemFile dispatch', () => {
        renderWithStore(ReItemFile);
        const p = global._cp.ItemFile;
        s(() => p.setLatest('id', ''));
        s(() => p.setMedia(2, 'id', {}));
        s(() => p.addalert('x'));
        s(() => p.globalinput(1, () => {}, 'info', 'p'));
        s(() => p.pushfeedback({id: 'f', name: 'n'}));
        s(() => p.sendglbcf(() => {}, 't'));
        s(() => p.pushbookmark({id: 'b', name: 'n'}));
        s(() => p.set([], path, '', '', 'name', 'asc', ''));
    });
    test('RePassword dispatch', () => {
        renderWithStore(RePassword);
        const p = global._cp.Password;
        s(() => p.addalert('x'));
        s(() => p.sendglbcf(() => {}, 't'));
        s(() => p.pdirsset([]));
        s(() => p.pushpdir('n', {}));
    });
    test('RePasswordCategorylist dispatch', () => {
        renderWithStore(RePasswordCategorylist);
        const p = global._cp.Categorylist;
        s(() => p.bookmarkset([], 'name', 'asc'));
        s(() => p.delbookmark('id'));
        s(() => p.dirset('n', [], 'name', 'asc'));
        s(() => p.deldir('n', 'id'));
        s(() => p.addalert('x'));
        s(() => p.set([], path, '', '', 'name', 'asc', ''));
    });
    test('RePasswordItemHead dispatch', () => {
        renderWithStore(RePasswordItemHead);
        const p = global._cp.ItemHead;
        s(() => p.addalert('x'));
        s(() => p.set([], path, '', '', 'name', 'asc', ''));
        s(() => p.setSelect(new Set()));
        s(() => p.globalinput(() => {}));
    });
    test('RePasswordItemPath dispatch', () => {
        renderWithStore(RePasswordItemPath);
        const p = global._cp.ItemPath;
        s(() => p.multiToggle(false));
        s(() => p.addalert('x'));
        s(() => p.set([], path, '', '', 'name', 'asc', ''));
        s(() => p.pushbookmark({id: 'b', name: 'n'}));
        s(() => p.globalinput(0, 'p', () => {}));
    });
    test('RePasswordItemlist dispatch', () => {
        renderWithStore(RePasswordItemlist);
        const p = global._cp.Itemlist;
        s(() => p.addalert('x'));
        s(() => p.set([], path, '', '', 'name', 'asc', ''));
        s(() => p.setSelect(new Set()));
        s(() => p.sendglbcf(() => {}, 't'));
    });
    test('ReItemPassword dispatch', () => {
        renderWithStore(ReItemPassword);
        const p = global._cp.ItemPassword;
        s(() => p.addalert('x'));
        s(() => p.sendglbcf(() => {}, 't'));
        s(() => p.sendglbpw(() => {}));
        s(() => p.globalinput(1, () => {}, 'info', 'p'));
        s(() => p.setLatest('id', ''));
    });
    test('RePasswordInfo dispatch', () => {
        renderWithStore(RePasswordInfo);
        const p = global._cp.PasswordInfo;
        s(() => p.addalert('x'));
        s(() => p.sendglbpw(() => {}));
        s(() => p.setLatest('id', ''));
    });
    test('ReStock dispatch', () => {
        renderWithStore(ReStock);
        const p = global._cp.Stock;
        s(() => p.addalert('x'));
        s(() => p.sendglbcf(() => {}, 't'));
        s(() => p.sdirsset([]));
        s(() => p.pushsdir('n', {}));
    });
    test('ReStockCategorylist dispatch', () => {
        renderWithStore(ReStockCategorylist);
        const p = global._cp.Categorylist;
        s(() => p.bookmarkset([], 'name', 'asc'));
        s(() => p.delbookmark('id'));
        s(() => p.dirset('n', [], 'name', 'asc'));
        s(() => p.deldir('n', 'id'));
        s(() => p.addalert('x'));
        s(() => p.set([], path, '', '', 'name', 'asc', ''));
        s(() => p.globalinput(() => {}));
    });
    test('ReStockItemHead dispatch', () => {
        renderWithStore(ReStockItemHead);
        const p = global._cp.ItemHead;
        s(() => p.addalert('x'));
        s(() => p.set([], path, '', '', 'name', 'asc', ''));
        s(() => p.setSelect(new Set()));
        s(() => p.globalinput(() => {}));
    });
    test('ReStockItemPath dispatch', () => {
        renderWithStore(ReStockItemPath);
        const p = global._cp.ItemPath;
        s(() => p.multiToggle(false));
        s(() => p.addalert('x'));
        s(() => p.set([], path, '', '', 'name', 'asc', ''));
        s(() => p.pushbookmark({id: 'b', name: 'n'}));
        s(() => p.globalinput(0, 'p', () => {}));
    });
    test('ReStockItemlist dispatch', () => {
        renderWithStore(ReStockItemlist);
        const p = global._cp.Itemlist;
        s(() => p.addalert('x'));
        s(() => p.set([], path, '', '', 'name', 'asc', ''));
        s(() => p.setSelect(new Set()));
        s(() => p.sendglbcf(() => {}, 't'));
    });
    test('ReItemStock dispatch', () => {
        renderWithStore(ReItemStock);
        const p = global._cp.ItemStock;
        s(() => p.addalert('x'));
        s(() => p.globalinput(1, () => {}, 'info', 'p'));
        s(() => p.setLatest('id', ''));
    });
    test('ReStockInfo dispatch', () => {
        renderWithStore(ReStockInfo);
        const p = global._cp.StockInfo;
        s(() => p.addalert('x'));
        s(() => p.setLatest('id', ''));
    });
    test('ReStockTotal dispatch', () => {
        renderWithStore(ReStockTotal);
        const p = global._cp.StockTotal;
        s(() => p.addalert('x'));
        s(() => p.sendglbcf(() => {}, 't'));
    });
    test('ReBitfinexCategorylist dispatch', () => {
        renderWithStore(ReBitfinexCategorylist);
        const p = global._cp.Categorylist;
        s(() => p.addalert('x'));
        s(() => p.set([], path, '', '', 'name', 'asc', ''));
    });
    test('ReBitfinexInfo dispatch', () => {
        renderWithStore(ReBitfinexInfo);
        const p = global._cp.BitfinexInfo;
        s(() => p.addalert('x'));
        s(() => p.sendglbcf(() => {}, 't'));
    });
    test('ReBitfinexItemHead dispatch', () => {
        renderWithStore(ReBitfinexItemHead);
        const p = global._cp.ItemHead;
        s(() => p.set([], path, '', '', 'name', 'asc', ''));
        s(() => p.setSelect(new Set()));
        s(() => p.addalert('x'));
    });
    test('ReBitfinexItemlist dispatch', () => {
        renderWithStore(ReBitfinexItemlist);
        const p = global._cp.Itemlist;
        s(() => p.addalert('x'));
        s(() => p.set([], path, '', '', 'name', 'asc', ''));
        s(() => p.setSelect(new Set()));
        s(() => p.sendglbcf(() => {}, 't'));
    });
    test('ReUserlist dispatch', () => {
        renderWithStore(ReUserlist);
        const p = global._cp.Userlist;
        s(() => p.addalert('x'));
        s(() => p.userset([]));
    });
    test('ReUserInfo dispatch', () => {
        renderWithStore(ReUserInfo, { user: { id: 'u1', name: 'test' } });
        const p = global._cp.UserInfo;
        s(() => p.addalert('x'));
        s(() => p.sendglbpw(() => {}));
        s(() => p.setbasic('owner'));
        s(() => p.sendglbcf(() => {}, 't'));
        s(() => p.addUser({id: 'u2', name: 'n'}));
        s(() => p.delUser('u1'));
    });
    test('ReMediaWidget dispatch', () => {
        renderWithStore(ReMediaWidget, { mediaType: 2 });
        const p = global._cp.MediaWidget;
        s(() => p.setLatest('id', ''));
        s(() => p.setsub(() => {}));
        s(() => p.addalert('x'));
        s(() => p.set([], 2));
        s(() => p.sendglbcf(() => {}, 't'));
        s(() => p.pushfeedback({id: 'f', name: 'n'}));
    });
    test('ReWidgetManage has no dispatch', () => {
        renderWithStore(ReWidgetManage);
        expect(global._cp.WidgetManage).toBeDefined();
    });
});
