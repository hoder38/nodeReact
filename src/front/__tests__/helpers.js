import React from 'react';
import { render } from '@testing-library/react';
import { createStore } from 'redux';
import { Provider } from 'react-redux';
import ANoMoPi from '../reducers/index.js';
import { createBrowserHistory } from 'history';

/**
 * Create a mock history for tests (avoids importing the singleton configureStore).
 */
export const createTestHistory = () => createBrowserHistory();

/**
 * Create a Redux store for testing with optional preloaded state.
 */
export function createTestStore(preloadedState) {
  const history = createTestHistory();
  const rootReducer = ANoMoPi(history);
  return createStore(rootReducer, preloadedState);
}

/**
 * Render a component wrapped in Redux Provider.
 * Returns RTL render result + the store instance.
 */
export function renderWithProviders(ui, { preloadedState, store, ...renderOptions } = {}) {
  const testStore = store || createTestStore(preloadedState);

  function Wrapper({ children }) {
    return <Provider store={testStore}>{children}</Provider>;
  }

  return {
    store: testStore,
    ...render(ui, { wrapper: Wrapper, ...renderOptions }),
  };
}
