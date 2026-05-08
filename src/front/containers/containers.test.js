import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { Provider } from 'react-redux';
import { createStore } from 'redux';
import { combineReducers } from 'redux';
import alertHandle from '../reducers/alertHandle.js';
import ReAlertlist from '../containers/ReAlertlist.js';
import { ALERT_PUSH } from '../constants.js';

// Mock fetch to prevent "Only absolute URLs are supported" from Homepage's api call
global.fetch = jest.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve({ msg: [] }) }));

function makeStore(alerts = []) {
  const rootReducer = combineReducers({ alertHandle });
  const store = createStore(rootReducer);
  alerts.forEach(msg => store.dispatch({ type: ALERT_PUSH, msg }));
  return store;
}

describe('ReAlertlist (connected)', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  test('renders alerts from Redux store', () => {
    const store = makeStore(['Error A', 'Error B']);
    render(<Provider store={store}><ReAlertlist /></Provider>);
    expect(screen.getByText('Error A')).toBeTruthy();
    expect(screen.getByText('Error B')).toBeTruthy();
  });

  test('dispatches ALERT_POP when alert auto-closes', () => {
    const store = makeStore(['Auto close']);
    render(<Provider store={store}><ReAlertlist /></Provider>);
    expect(store.getState().alertHandle).toHaveLength(1);
    jest.advanceTimersByTime(5000);
    expect(store.getState().alertHandle).toHaveLength(0);
  });

  test('dispatches ALERT_POP on manual close click', () => {
    const store = makeStore(['Click close']);
    const { container } = render(<Provider store={store}><ReAlertlist /></Provider>);
    const closeBtn = container.querySelector('button.close');
    fireEvent.click(closeBtn);
    expect(store.getState().alertHandle).toHaveLength(0);
  });

  test('empty store renders no alerts', () => {
    const store = makeStore([]);
    const { container } = render(<Provider store={store}><ReAlertlist /></Provider>);
    expect(container.querySelectorAll('.alert')).toHaveLength(0);
  });
});

// configureStore test
describe('configureStore', () => {
  test('creates a Redux store with router middleware', () => {
    const configureStore = require('../configureStore.js').default;
    const { history } = require('../configureStore.js');
    const store = configureStore();
    expect(store.getState()).toBeDefined();
    expect(store.dispatch).toBeDefined();
    expect(history).toBeDefined();
  });

  test('accepts preloaded state', () => {
    const configureStore = require('../configureStore.js').default;
    const store = configureStore({});
    expect(store.getState()).toBeDefined();
  });
});

// Root test — now accepts store as prop for testability
describe('Root', () => {
  let logSpy;
  beforeEach(() => { logSpy = jest.spyOn(console, 'log').mockImplementation(); });
  afterEach(() => { logSpy.mockRestore(); });

  test('renders with provided store', () => {
    const configureStore = require('../configureStore.js').default;
    const Root = require('../containers/Root.js').default;
    const store = configureStore();
    const { container } = render(<Root store={store} />);
    expect(container).toBeTruthy();
  });
});
