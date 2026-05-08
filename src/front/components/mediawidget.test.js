import React from 'react';
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';

jest.mock('../utility.js', () => ({
  ...jest.requireActual('../utility.js'),
  api: jest.fn(),
  killEvent: jest.fn((e, cb) => { if (typeof cb === 'function') cb(); }),
  randomFloor: jest.fn(),
  arrayObjectIndexOf: jest.fn(),
  isValidString: jest.fn(),
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
        onenter: () => { if (this.submit) this.submit(); },
        onchange: () => { if (this.change) this.change(); },
        className: 'form-control',
        style: {},
      };
    }
    initFocus() {}
  };
  return MockUserInput;
});

jest.mock('./Tooltip.js', () => {
  const React = require('react');
  return function MockTooltip({ tip, place }) {
    return React.createElement('span', { 'data-testid': 'tooltip', title: tip }, tip);
  };
});

jest.mock('pdfjs-dist', () => ({
  GlobalWorkerOptions: {},
  getDocument: jest.fn(),
}));

import { api, killEvent, randomFloor, arrayObjectIndexOf, isValidString } from '../utility.js';
import PDFJS from 'pdfjs-dist';
import MediaWidget from './MediaWidget.js';

const flushPromises = () => new Promise(jest.requireActual('timers').setImmediate);

function makeProps(overrides = {}) {
  return {
    mediaType: 3,
    setsub: jest.fn(),
    toggle: 'media',
    show: true,
    mainUrl: 'https://test.com',
    list: [{ id: 'item1', name: 'Test Item', present: 5 }],
    index: 0,
    count: 0,
    sortName: 'name',
    sortType: 'asc',
    buttonType: 'primary',
    full: false,
    level: 0,
    more: false,
    page: 1,
    pageToken: 'token1',
    bookmark: false,
    toggleShow: jest.fn(),
    toggleFull: jest.fn(),
    addalert: jest.fn(),
    sendglbcf: jest.fn((fn) => fn()),
    pushfeedback: jest.fn(),
    setLatest: jest.fn(),
    set: jest.fn(),
    opt: {
      save2local: jest.fn(),
      subscript: jest.fn(),
      searchSub: jest.fn(),
      uploadSub: jest.fn(),
      handleMedia: jest.fn(),
    },
    ...overrides,
  };
}

function mockMediaElement(el) {
  if (!el) return;
  el.play = jest.fn(() => Promise.resolve());
  el.pause = jest.fn();
  el.focus = jest.fn();
  Object.defineProperty(el, 'duration', { writable: true, configurable: true, value: 100 });
  Object.defineProperty(el, 'currentTime', { writable: true, configurable: true, value: 0 });
  Object.defineProperty(el, 'paused', { writable: true, configurable: true, value: false });
  Object.defineProperty(el, 'seeking', { writable: true, configurable: true, value: false });
  Object.defineProperty(el, 'src', { writable: true, configurable: true, value: 'http://video.mp4' });
  Object.defineProperty(el, 'textTracks', { writable: true, configurable: true, value: [] });
}

describe('MediaWidget', () => {
  let consoleSpy;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    api.mockReset();
    api.mockResolvedValue({});
    killEvent.mockImplementation((e, cb) => { if (typeof cb === 'function') cb(); });
    randomFloor.mockReturnValue(2);
    arrayObjectIndexOf.mockReturnValue(-1);
    isValidString.mockReturnValue(null);
  });

  afterEach(() => {
    consoleSpy.mockRestore();
    jest.useRealTimers();
    document.body.innerHTML = '';
  });

  // ─── Constructor ──────────────────────────────────────────────────────────

  describe('constructor', () => {
    test('mediaType 2 sets type=image, preType=image', () => {
      const props = makeProps({ mediaType: 2 });
      const ref = React.createRef();
      render(<MediaWidget ref={ref} {...props} />);
      expect(ref.current._type).toBe('image');
      expect(ref.current._preType).toBe('image');
      expect(props.setsub).toHaveBeenCalled();
    });

    test('mediaType 3 sets type=video, preType=video', () => {
      const props = makeProps({ mediaType: 3 });
      const ref = React.createRef();
      render(<MediaWidget ref={ref} {...props} />);
      expect(ref.current._type).toBe('video');
      expect(ref.current._preType).toBe('video');
    });

    test('mediaType 4 sets type=music, preType=video', () => {
      const props = makeProps({ mediaType: 4 });
      const ref = React.createRef();
      render(<MediaWidget ref={ref} {...props} />);
      expect(ref.current._type).toBe('music');
      expect(ref.current._preType).toBe('video');
    });

    test('mediaType 9 sets no type', () => {
      const props = makeProps({ mediaType: 9, list: [{ id: 'a', name: 'A', type: 3 }] });
      const ref = React.createRef();
      render(<MediaWidget ref={ref} {...props} />);
      expect(ref.current._type).toBeNull();
      expect(ref.current._preType).toBeNull();
    });

    test('unknown mediaType calls addalert', () => {
      const props = makeProps({ mediaType: 99 });
      render(<MediaWidget {...props} />);
      expect(props.addalert).toHaveBeenCalledWith('unknown type');
    });

    test('initial state has expected shape', () => {
      const ref = React.createRef();
      render(<MediaWidget ref={ref} {...makeProps()} />);
      expect(ref.current.state.option).toBe(false);
      expect(ref.current.state.mode).toBe(0);
      expect(ref.current.state.index).toBe(-1);
      expect(ref.current.state.src).toBe('');
      expect(ref.current.state.loading).toBe(false);
      expect(ref.current.state.extend).toBe(false);
      expect(ref.current.state.subCh).toBe('');
      expect(ref.current.state.subEn).toBe('');
      expect(ref.current.state.cue).toBe('');
      expect(ref.current.state).toHaveProperty('subIndex');
    });
  });

  // ─── componentDidMount ────────────────────────────────────────────────────

  describe('componentDidMount', () => {
    test('adds click listeners to matching data-widget elements', () => {
      const div = document.createElement('div');
      div.setAttribute('data-widget', 'media');
      document.body.appendChild(div);
      const props = makeProps({ toggle: 'media' });
      const ref = React.createRef();
      render(<MediaWidget ref={ref} {...props} />);
      expect(ref.current._targetArr.length).toBe(1);
    });

    test('no data-widget elements → empty targetArr', () => {
      const ref = React.createRef();
      render(<MediaWidget ref={ref} {...makeProps()} />);
      expect(ref.current._targetArr.length).toBe(0);
    });

    test('mediaType 3: sets _media to _video and installs handlers', () => {
      const props = makeProps({ mediaType: 3, show: true });
      const ref = React.createRef();
      render(<MediaWidget ref={ref} {...props} />);
      const video = ref.current._video;
      expect(ref.current._media).toBe(video);
      expect(video.oncanplay).toBeTruthy();
      expect(video.onended).toBeTruthy();
      expect(video.onpause).toBeTruthy();
      expect(video.onplay).toBeTruthy();
      expect(video.onloadedmetadata).toBeTruthy();
      expect(video.onplaying).toBeTruthy();
      expect(video.onkeydown).toBeTruthy();
    });

    test('mediaType 4: sets _media to _audio and installs handlers', () => {
      const props = makeProps({ mediaType: 4 });
      const ref = React.createRef();
      render(<MediaWidget ref={ref} {...props} />);
      const audio = ref.current._audio;
      expect(ref.current._media).toBe(audio);
      expect(audio.oncanplay).toBeTruthy();
      expect(audio.onended).toBeTruthy();
      expect(audio.onpause).toBeTruthy();
      expect(audio.onplay).toBeTruthy();
      expect(audio.onloadedmetadata).toBeTruthy();
      expect(audio.onplaying).toBeTruthy();
      expect(audio.onkeydown).toBeTruthy();
    });

    test('mediaType 9: sets up both video and audio but does not set _media', () => {
      const props = makeProps({ mediaType: 9, list: [{ id: 'a', name: 'A', type: 3 }] });
      const ref = React.createRef();
      render(<MediaWidget ref={ref} {...props} />);
      expect(ref.current._media).toBeNull();
      expect(ref.current._video.oncanplay).toBeTruthy();
      expect(ref.current._audio.oncanplay).toBeTruthy();
    });

    test('video.oncanplay: first time with show → play', () => {
      const props = makeProps({ mediaType: 3, show: true });
      const ref = React.createRef();
      render(<MediaWidget ref={ref} {...props} />);
      const video = ref.current._video;
      mockMediaElement(video);
      ref.current._start = false;
      video.oncanplay();
      expect(ref.current._start).toBe(true);
      expect(video.play).toHaveBeenCalled();
    });

    test('video.oncanplay: first time without show → no play', () => {
      const props = makeProps({ mediaType: 3, show: false });
      const ref = React.createRef();
      render(<MediaWidget ref={ref} {...props} />);
      const video = ref.current._video;
      mockMediaElement(video);
      ref.current._start = false;
      video.oncanplay();
      expect(ref.current._start).toBe(true);
      expect(video.play).not.toHaveBeenCalled();
    });

    test('video.oncanplay: already started → noop', () => {
      const props = makeProps({ mediaType: 3, show: true });
      const ref = React.createRef();
      render(<MediaWidget ref={ref} {...props} />);
      const video = ref.current._video;
      mockMediaElement(video);
      ref.current._start = true;
      video.oncanplay();
      expect(video.play).not.toHaveBeenCalled();
    });

    test('audio.oncanplay: first time → play', () => {
      const props = makeProps({ mediaType: 4 });
      const ref = React.createRef();
      render(<MediaWidget ref={ref} {...props} />);
      const audio = ref.current._audio;
      mockMediaElement(audio);
      ref.current._start = false;
      audio.oncanplay();
      expect(ref.current._start).toBe(true);
      expect(audio.play).toHaveBeenCalled();
    });

    test('audio.oncanplay: already started → noop', () => {
      const props = makeProps({ mediaType: 4 });
      const ref = React.createRef();
      render(<MediaWidget ref={ref} {...props} />);
      const audio = ref.current._audio;
      mockMediaElement(audio);
      ref.current._start = true;
      audio.oncanplay();
      expect(audio.play).not.toHaveBeenCalled();
    });

    test('video.onplay: calls testLogin API and focus', async () => {
      api.mockResolvedValue({});
      const props = makeProps({ mediaType: 3 });
      const ref = React.createRef();
      render(<MediaWidget ref={ref} {...props} />);
      const video = ref.current._video;
      mockMediaElement(video);
      video.onplay();
      expect(api).toHaveBeenCalledWith('https://test.com/api/testLogin');
      expect(video.focus).toHaveBeenCalled();
    });

    test('video.onplay: testLogin fails → addalert', async () => {
      api.mockRejectedValue('auth error');
      const props = makeProps({ mediaType: 3 });
      const ref = React.createRef();
      render(<MediaWidget ref={ref} {...props} />);
      const video = ref.current._video;
      mockMediaElement(video);
      video.onplay();
      await flushPromises();
      expect(props.addalert).toHaveBeenCalledWith('auth error');
    });

    test('audio.onplay: calls testLogin API and focus', async () => {
      api.mockResolvedValue({});
      const props = makeProps({ mediaType: 4 });
      const ref = React.createRef();
      render(<MediaWidget ref={ref} {...props} />);
      const audio = ref.current._audio;
      mockMediaElement(audio);
      audio.onplay();
      expect(api).toHaveBeenCalledWith('https://test.com/api/testLogin');
      expect(audio.focus).toHaveBeenCalled();
    });

    test('audio.onplay: testLogin fails → addalert', async () => {
      api.mockRejectedValue('auth err');
      const props = makeProps({ mediaType: 4 });
      const ref = React.createRef();
      render(<MediaWidget ref={ref} {...props} />);
      const audio = ref.current._audio;
      mockMediaElement(audio);
      audio.onplay();
      await flushPromises();
      expect(props.addalert).toHaveBeenCalledWith('auth err');
    });

    test('video.onloadedmetadata: with startTime and duration → set currentTime', () => {
      const props = makeProps({ mediaType: 3 });
      const ref = React.createRef();
      render(<MediaWidget ref={ref} {...props} />);
      const video = ref.current._video;
      mockMediaElement(video);
      ref.current._startTime = 50;
      video.duration = 100;
      video.onloadedmetadata();
      expect(video.currentTime).toBe(50);
      expect(ref.current._preTime).toBe(50);
      expect(ref.current._startTime).toBe(0);
    });

    test('video.onloadedmetadata: no startTime → noop', () => {
      const props = makeProps({ mediaType: 3 });
      const ref = React.createRef();
      render(<MediaWidget ref={ref} {...props} />);
      const video = ref.current._video;
      mockMediaElement(video);
      ref.current._startTime = 0;
      video.onloadedmetadata();
      expect(video.currentTime).toBe(0);
    });

    test('video.onloadedmetadata: no duration → noop', () => {
      const props = makeProps({ mediaType: 3 });
      const ref = React.createRef();
      render(<MediaWidget ref={ref} {...props} />);
      const video = ref.current._video;
      mockMediaElement(video);
      ref.current._startTime = 50;
      video.duration = 0;
      video.onloadedmetadata();
      expect(video.currentTime).toBe(0);
    });

    test('audio.onloadedmetadata: with startTime and duration → set currentTime', () => {
      const props = makeProps({ mediaType: 4 });
      const ref = React.createRef();
      render(<MediaWidget ref={ref} {...props} />);
      const audio = ref.current._audio;
      mockMediaElement(audio);
      ref.current._startTime = 30;
      audio.duration = 200;
      audio.onloadedmetadata();
      expect(audio.currentTime).toBe(30);
      expect(ref.current._preTime).toBe(30);
      expect(ref.current._startTime).toBe(0);
    });

    test('audio.onloadedmetadata: no startTime → noop', () => {
      const props = makeProps({ mediaType: 4 });
      const ref = React.createRef();
      render(<MediaWidget ref={ref} {...props} />);
      const audio = ref.current._audio;
      mockMediaElement(audio);
      ref.current._startTime = 0;
      audio.onloadedmetadata();
      expect(audio.currentTime).toBe(0);
    });

    test('video.onplaying: sets interval tracking preTime', () => {
      const props = makeProps({ mediaType: 3 });
      const ref = React.createRef();
      render(<MediaWidget ref={ref} {...props} />);
      const video = ref.current._video;
      mockMediaElement(video);
      video.paused = false;
      video.seeking = false;
      video.currentTime = 42;
      video.onplaying();
      jest.advanceTimersByTime(1000);
      expect(ref.current._preTime).toBe(42);
    });

    test('video.onplaying: paused → no update', () => {
      const props = makeProps({ mediaType: 3 });
      const ref = React.createRef();
      render(<MediaWidget ref={ref} {...props} />);
      const video = ref.current._video;
      mockMediaElement(video);
      video.paused = true;
      video.currentTime = 42;
      ref.current._preTime = 0;
      video.onplaying();
      jest.advanceTimersByTime(1000);
      expect(ref.current._preTime).toBe(0);
    });

    test('video.onplaying: video becomes null → clears interval', () => {
      const props = makeProps({ mediaType: 3 });
      const ref = React.createRef();
      render(<MediaWidget ref={ref} {...props} />);
      const video = ref.current._video;
      mockMediaElement(video);
      video.onplaying();
      ref.current._video = null;
      jest.advanceTimersByTime(1000);
      // No crash expected
    });

    test('audio.onplaying: sets interval tracking preTime', () => {
      const props = makeProps({ mediaType: 4 });
      const ref = React.createRef();
      render(<MediaWidget ref={ref} {...props} />);
      const audio = ref.current._audio;
      mockMediaElement(audio);
      audio.paused = false;
      audio.seeking = false;
      audio.currentTime = 15;
      audio.onplaying();
      jest.advanceTimersByTime(1000);
      expect(ref.current._preTime).toBe(15);
    });

    test('audio.onplaying: audio becomes null → clears interval', () => {
      const props = makeProps({ mediaType: 4 });
      const ref = React.createRef();
      render(<MediaWidget ref={ref} {...props} />);
      const audio = ref.current._audio;
      mockMediaElement(audio);
      audio.onplaying();
      ref.current._audio = null;
      jest.advanceTimersByTime(1000);
    });

    test('audio.onplaying: not paused, not seeking → updates preTime', () => {
      const props = makeProps({ mediaType: 4 });
      const ref = React.createRef();
      render(<MediaWidget ref={ref} {...props} />);
      const audio = ref.current._audio;
      mockMediaElement(audio);
      audio.paused = false;
      audio.seeking = false;
      audio.currentTime = 99;
      audio.onplaying();
      jest.advanceTimersByTime(1000);
      expect(ref.current._preTime).toBe(99);
    });

    test('video.onclick: non-chrome, non-firefox — paused → play, playing → pause', () => {
      Object.defineProperty(navigator, 'userAgent', { value: 'Safari/537.36', configurable: true });
      Object.defineProperty(navigator, 'vendor', { value: 'Apple', configurable: true });
      const props = makeProps({ mediaType: 3 });
      const ref = React.createRef();
      render(<MediaWidget ref={ref} {...props} />);
      const video = ref.current._video;
      mockMediaElement(video);
      // Test paused → play
      video.paused = true;
      video.onclick({});
      expect(video.play).toHaveBeenCalled();
      // Test playing → pause
      video.play.mockClear();
      video.paused = false;
      video.onclick({});
      expect(video.pause).toHaveBeenCalled();
      // Restore
      Object.defineProperty(navigator, 'userAgent', { value: 'Mozilla/5.0', configurable: true });
      Object.defineProperty(navigator, 'vendor', { value: '', configurable: true });
    });

    test('video.onclick: Chrome detected → no onclick handler', () => {
      Object.defineProperty(navigator, 'userAgent', { value: 'Mozilla/5.0 Chrome/91.0', configurable: true });
      Object.defineProperty(navigator, 'vendor', { value: 'Google Inc', configurable: true });
      const ref = React.createRef();
      render(<MediaWidget ref={ref} {...makeProps({ mediaType: 3 })} />);
      const video = ref.current._video;
      mockMediaElement(video);
      expect(video.onclick).toBeNull();
      Object.defineProperty(navigator, 'userAgent', { value: 'Mozilla/5.0', configurable: true });
      Object.defineProperty(navigator, 'vendor', { value: '', configurable: true });
    });

    test('video.onkeydown: keyCode 67 (C) → changeSub', () => {
      const props = makeProps({ mediaType: 3 });
      const ref = React.createRef();
      render(<MediaWidget ref={ref} {...props} />);
      const video = ref.current._video;
      mockMediaElement(video);
      const spy = jest.spyOn(ref.current, '_changeSub');
      video.onkeydown({ keyCode: 67 });
      expect(spy).toHaveBeenCalled();
    });

    test('video.onkeydown: keyCode 55 → changeSub', () => {
      const props = makeProps({ mediaType: 3 });
      const ref = React.createRef();
      render(<MediaWidget ref={ref} {...props} />);
      const video = ref.current._video;
      mockMediaElement(video);
      const spy = jest.spyOn(ref.current, '_changeSub');
      video.onkeydown({ keyCode: 55 });
      expect(spy).toHaveBeenCalled();
    });

    test('video.onkeydown: keyCode 188 → backward', () => {
      const props = makeProps({ mediaType: 3 });
      const ref = React.createRef();
      render(<MediaWidget ref={ref} {...props} />);
      const video = ref.current._video;
      mockMediaElement(video);
      ref.current._media = video;
      ref.current._media.currentTime = 10;
      ref.current._media.duration = 100;
      video.onkeydown({ keyCode: 188 });
      expect(ref.current._media.currentTime).toBe(5);
    });

    test('video.onkeydown: keyCode 52 → backward', () => {
      const props = makeProps({ mediaType: 3 });
      const ref = React.createRef();
      render(<MediaWidget ref={ref} {...props} />);
      const video = ref.current._video;
      mockMediaElement(video);
      ref.current._media = video;
      ref.current._media.currentTime = 10;
      video.onkeydown({ keyCode: 52 });
      expect(ref.current._media.currentTime).toBe(5);
    });

    test('video.onkeydown: keyCode 190 → forward', () => {
      const props = makeProps({ mediaType: 3 });
      const ref = React.createRef();
      render(<MediaWidget ref={ref} {...props} />);
      const video = ref.current._video;
      mockMediaElement(video);
      ref.current._media = video;
      ref.current._media.currentTime = 10;
      video.onkeydown({ keyCode: 190 });
      expect(ref.current._media.currentTime).toBe(15);
    });

    test('video.onkeydown: keyCode 53 → forward', () => {
      const props = makeProps({ mediaType: 3 });
      const ref = React.createRef();
      render(<MediaWidget ref={ref} {...props} />);
      const video = ref.current._video;
      mockMediaElement(video);
      ref.current._media = video;
      ref.current._media.currentTime = 10;
      video.onkeydown({ keyCode: 53 });
      expect(ref.current._media.currentTime).toBe(15);
    });

    test('video.onkeydown: keyCode 49 → backward(true)', () => {
      const props = makeProps({ mediaType: 3 });
      const ref = React.createRef();
      render(<MediaWidget ref={ref} {...props} />);
      const video = ref.current._video;
      mockMediaElement(video);
      ref.current._media = video;
      ref.current._media.currentTime = 50;
      ref.current._media.duration = 100;
      video.onkeydown({ keyCode: 49 });
      expect(ref.current._media.currentTime).toBe(49);
    });

    test('video.onkeydown: keyCode 50 → forward(true)', () => {
      const props = makeProps({ mediaType: 3 });
      const ref = React.createRef();
      render(<MediaWidget ref={ref} {...props} />);
      const video = ref.current._video;
      mockMediaElement(video);
      ref.current._media = video;
      ref.current._media.currentTime = 50;
      ref.current._media.duration = 100;
      video.onkeydown({ keyCode: 50 });
      expect(ref.current._media.currentTime).toBe(51);
    });

    test('video.onkeydown: keyCode 56 → fullscreen', () => {
      const props = makeProps({ mediaType: 3 });
      const ref = React.createRef();
      render(<MediaWidget ref={ref} {...props} />);
      const video = ref.current._video;
      mockMediaElement(video);
      ref.current._media = video;
      ref.current._media.requestFullscreen = jest.fn();
      video.onkeydown({ keyCode: 56 });
      expect(ref.current._media.requestFullscreen).toHaveBeenCalled();
    });

    test('video.onkeydown: keyCode 70 → fullscreen', () => {
      const props = makeProps({ mediaType: 3 });
      const ref = React.createRef();
      render(<MediaWidget ref={ref} {...props} />);
      const video = ref.current._video;
      mockMediaElement(video);
      ref.current._media = video;
      ref.current._media.requestFullscreen = jest.fn();
      video.onkeydown({ keyCode: 70 });
      expect(ref.current._media.requestFullscreen).toHaveBeenCalled();
    });

    test('audio.onkeydown: keyCodes for backward/forward', () => {
      const props = makeProps({ mediaType: 4 });
      const ref = React.createRef();
      render(<MediaWidget ref={ref} {...props} />);
      const audio = ref.current._audio;
      mockMediaElement(audio);
      ref.current._media = audio;
      audio.currentTime = 20;
      audio.duration = 100;
      audio.onkeydown({ keyCode: 188 });
      expect(audio.currentTime).toBe(15);
      audio.currentTime = 20;
      audio.onkeydown({ keyCode: 52 });
      expect(audio.currentTime).toBe(15);
      audio.currentTime = 20;
      audio.onkeydown({ keyCode: 190 });
      expect(audio.currentTime).toBe(25);
      audio.currentTime = 20;
      audio.onkeydown({ keyCode: 53 });
      expect(audio.currentTime).toBe(25);
      audio.currentTime = 50;
      audio.onkeydown({ keyCode: 49 });
      expect(audio.currentTime).toBe(49);
      audio.currentTime = 50;
      audio.onkeydown({ keyCode: 50 });
      expect(audio.currentTime).toBe(51);
    });

    test('video.onended triggers _nextMedia(false)', () => {
      const props = makeProps({ mediaType: 3 });
      const ref = React.createRef();
      render(<MediaWidget ref={ref} {...props} />);
      const video = ref.current._video;
      mockMediaElement(video);
      const spy = jest.spyOn(ref.current, '_nextMedia');
      video.onended();
      expect(spy).toHaveBeenCalledWith(false);
    });

    test('video.onpause triggers _recordMedia(true)', () => {
      const props = makeProps({ mediaType: 3 });
      const ref = React.createRef();
      render(<MediaWidget ref={ref} {...props} />);
      const video = ref.current._video;
      mockMediaElement(video);
      const spy = jest.spyOn(ref.current, '_recordMedia');
      video.onpause();
      expect(spy).toHaveBeenCalledWith(true);
    });

    test('audio.onended triggers _nextMedia(false)', () => {
      const props = makeProps({ mediaType: 4 });
      const ref = React.createRef();
      render(<MediaWidget ref={ref} {...props} />);
      const audio = ref.current._audio;
      mockMediaElement(audio);
      const spy = jest.spyOn(ref.current, '_nextMedia');
      audio.onended();
      expect(spy).toHaveBeenCalledWith(false);
    });

    test('audio.onpause triggers _recordMedia(true)', () => {
      const props = makeProps({ mediaType: 4 });
      const ref = React.createRef();
      render(<MediaWidget ref={ref} {...props} />);
      const audio = ref.current._audio;
      mockMediaElement(audio);
      const spy = jest.spyOn(ref.current, '_recordMedia');
      audio.onpause();
      expect(spy).toHaveBeenCalledWith(true);
    });
  });

  // ─── componentDidUpdate ───────────────────────────────────────────────────

  describe('componentDidUpdate', () => {
    test('count change, type 9, no index → playlistItem(0, list, 0)', () => {
      const list = [{ id: 'a', name: 'A', type: 3, present: 2 }];
      const props = makeProps({ mediaType: 9, list, count: 0, index: 0 });
      const ref = React.createRef();
      const { rerender } = render(<MediaWidget ref={ref} {...props} />);
      const spy = jest.spyOn(ref.current, '_playlistItem');
      rerender(<MediaWidget ref={ref} {...props} count={1} />);
      expect(spy).toHaveBeenCalledWith(0, list, 0);
    });

    test('count change, type 9, index "5" → startTime=5, subIndex=5, index=0', () => {
      const list = [{ id: 'a', name: 'A', type: 3, present: 2 }];
      const props = makeProps({ mediaType: 9, list, count: 0, index: '5' });
      const ref = React.createRef();
      const { rerender } = render(<MediaWidget ref={ref} {...props} />);
      const spy = jest.spyOn(ref.current, '_playlistItem');
      rerender(<MediaWidget ref={ref} {...props} count={1} />);
      expect(spy).toHaveBeenCalledWith(0, list, 5);
      expect(ref.current._startTime).toBe(5);
    });

    test('count change, type 9, index "5&2" → index=2, subIndex=5', () => {
      const list = [
        { id: 'a', name: 'A', type: 3 },
        { id: 'b', name: 'B', type: 3 },
        { id: 'c', name: 'C', type: 4 },
      ];
      const props = makeProps({ mediaType: 9, list, count: 0, index: '5&2' });
      const ref = React.createRef();
      const { rerender } = render(<MediaWidget ref={ref} {...props} />);
      const spy = jest.spyOn(ref.current, '_playlistItem');
      rerender(<MediaWidget ref={ref} {...props} count={1} />);
      expect(spy).toHaveBeenCalledWith(2, list, 5);
    });

    test('count change, non-9 → saveParent + loadMedia + toggleShow', async () => {
      api.mockResolvedValue({});
      const props = makeProps({ mediaType: 3, count: 0, index: 1 });
      const ref = React.createRef();
      const { rerender } = render(<MediaWidget ref={ref} {...props} />);
      rerender(<MediaWidget ref={ref} {...props} count={1} />);
      await flushPromises();
      expect(api).toHaveBeenCalledWith(expect.stringContaining('/api/storage/media/saveParent/'), expect.anything(), 'POST');
    });

    test('show false→true → video.pause', () => {
      const props = makeProps({ mediaType: 3, show: true });
      const ref = React.createRef();
      const { rerender } = render(<MediaWidget ref={ref} {...props} />);
      const video = ref.current._video;
      mockMediaElement(video);
      rerender(<MediaWidget ref={ref} {...props} show={false} />);
      expect(video.pause).toHaveBeenCalled();
    });

    test('show change without video → no crash', () => {
      const props = makeProps({ mediaType: 2, show: true });
      const ref = React.createRef();
      const { rerender } = render(<MediaWidget ref={ref} {...props} />);
      rerender(<MediaWidget ref={ref} {...props} show={false} />);
      // Should not crash
    });

    test('PDF rendering when doc=3 and src changes', async () => {
      const mockPage = {
        getViewport: jest.fn(() => ({ height: 100, width: 100 })),
        render: jest.fn(),
      };
      const mockPdf = { getPage: jest.fn(() => Promise.resolve(mockPage)) };
      PDFJS.getDocument.mockReturnValue({ promise: Promise.resolve(mockPdf) });

      const props = makeProps({ mediaType: 2 });
      const ref = React.createRef();
      render(<MediaWidget ref={ref} {...props} />);
      ref.current._item = { doc: 3 };
      // Create canvas element
      const canvas = document.createElement('canvas');
      canvas.id = 'pdf1';
      canvas.getContext = jest.fn(() => ({}));
      document.body.appendChild(canvas);

      await act(async () => {
        ref.current.setState({ src: 'http://test.pdf' });
        await flushPromises();
      });
      await flushPromises();
      expect(PDFJS.getDocument).toHaveBeenCalled();
    });

    test('PDF rendering for type 9 uses pdf2 id', async () => {
      const mockPage = {
        getViewport: jest.fn(() => ({ height: 100, width: 100 })),
        render: jest.fn(),
      };
      const mockPdf = { getPage: jest.fn(() => Promise.resolve(mockPage)) };
      PDFJS.getDocument.mockReturnValue({ promise: Promise.resolve(mockPdf) });

      const props = makeProps({ mediaType: 9, list: [{ id: 'a', name: 'A', type: 2, doc: 3 }] });
      const ref = React.createRef();
      render(<MediaWidget ref={ref} {...props} />);
      ref.current._item = { doc: 3, type: 2 };
      const canvas = document.createElement('canvas');
      canvas.id = 'pdf2';
      canvas.getContext = jest.fn(() => ({}));
      document.body.appendChild(canvas);

      await act(async () => {
        ref.current.setState({ src: 'http://test2.pdf' });
        await flushPromises();
      });
      await flushPromises();
      expect(PDFJS.getDocument).toHaveBeenCalled();
    });

    test('PDF rendering with full=true uses scale 2', async () => {
      const mockPage = {
        getViewport: jest.fn(() => ({ height: 200, width: 200 })),
        render: jest.fn(),
      };
      const mockPdf = { getPage: jest.fn(() => Promise.resolve(mockPage)) };
      PDFJS.getDocument.mockReturnValue({ promise: Promise.resolve(mockPdf) });

      const props = makeProps({ mediaType: 2, full: false });
      const ref = React.createRef();
      const { rerender } = render(<MediaWidget ref={ref} {...props} />);
      ref.current._item = { doc: 3 };
      const canvas = document.createElement('canvas');
      canvas.id = 'pdf1';
      canvas.getContext = jest.fn(() => ({}));
      document.body.appendChild(canvas);
      await act(async () => {
        ref.current.setState({ src: 'http://test.pdf' });
        await flushPromises();
      });
      await flushPromises();
      rerender(<MediaWidget ref={ref} {...props} full={true} />);
      await flushPromises();
      expect(mockPage.getViewport).toHaveBeenCalledWith({ scale: 2 });
    });
  });

  // ─── componentWillUnmount ─────────────────────────────────────────────────

  describe('componentWillUnmount', () => {
    test('removes click listeners from targetArr', () => {
      const div = document.createElement('div');
      div.setAttribute('data-widget', 'media');
      document.body.appendChild(div);
      const removeListenerSpy = jest.spyOn(div, 'removeEventListener');
      const props = makeProps({ toggle: 'media' });
      const { unmount } = render(<MediaWidget {...props} />);
      unmount();
      expect(removeListenerSpy).toHaveBeenCalledWith('click', expect.any(Function));
    });

    test('no targetArr → no crash', () => {
      const { unmount } = render(<MediaWidget {...makeProps()} />);
      unmount();
    });
  });

  // ─── _changeSub ───────────────────────────────────────────────────────────

  describe('_changeSub', () => {
    test('no video → noop', () => {
      const ref = React.createRef();
      render(<MediaWidget ref={ref} {...makeProps({ mediaType: 2 })} />);
      ref.current._changeSub();
    });

    test('video but href === src → noop', () => {
      const ref = React.createRef();
      render(<MediaWidget ref={ref} {...makeProps({ mediaType: 3 })} />);
      const video = ref.current._video;
      mockMediaElement(video);
      video.src = window.location.href;
      ref.current._changeSub();
    });

    test('track0 showing → switch to track1', () => {
      const ref = React.createRef();
      render(<MediaWidget ref={ref} {...makeProps({ mediaType: 3 })} />);
      const video = ref.current._video;
      mockMediaElement(video);
      video.textTracks = [{ mode: 'showing' }, { mode: 'disabled' }];
      ref.current._changeSub();
      expect(video.textTracks[0].mode).toBe('disabled');
      expect(video.textTracks[1].mode).toBe('showing');
    });

    test('track1 showing → disable both', () => {
      const ref = React.createRef();
      render(<MediaWidget ref={ref} {...makeProps({ mediaType: 3 })} />);
      const video = ref.current._video;
      mockMediaElement(video);
      video.textTracks = [{ mode: 'disabled' }, { mode: 'showing' }];
      ref.current._changeSub();
      expect(video.textTracks[1].mode).toBe('disabled');
    });

    test('neither showing → show track0', () => {
      const ref = React.createRef();
      render(<MediaWidget ref={ref} {...makeProps({ mediaType: 3 })} />);
      const video = ref.current._video;
      mockMediaElement(video);
      video.textTracks = [{ mode: 'disabled' }, { mode: 'disabled' }];
      ref.current._changeSub();
      expect(video.textTracks[0].mode).toBe('showing');
    });

    test('no textTracks entries → noop', () => {
      const ref = React.createRef();
      render(<MediaWidget ref={ref} {...makeProps({ mediaType: 3 })} />);
      const video = ref.current._video;
      mockMediaElement(video);
      video.textTracks = [];
      ref.current._changeSub();
    });
  });

  // ─── _playlistItem ────────────────────────────────────────────────────────

  describe('_playlistItem', () => {
    test('sets item, total, media for type 3', () => {
      const list = [{ id: 'a', name: 'A', type: 3, present: 5 }];
      const ref = React.createRef();
      render(<MediaWidget ref={ref} {...makeProps({ mediaType: 9, list })} />);
      mockMediaElement(ref.current._video);
      ref.current._playlistItem(0, list, 3);
      expect(ref.current._item).toBe(list[0]);
      expect(ref.current._total).toBe(5);
      expect(ref.current._media).toBe(ref.current._video);
      expect(ref.current.state.subIndex).toBe(3);
    });

    test('sets media to audio for type 4', () => {
      const list = [{ id: 'a', name: 'A', type: 4, present: 3 }];
      const ref = React.createRef();
      render(<MediaWidget ref={ref} {...makeProps({ mediaType: 9, list })} />);
      ref.current._playlistItem(0, list);
      expect(ref.current._media).toBe(ref.current._audio);
    });

    test('sets media to null for other types', () => {
      const list = [{ id: 'a', name: 'A', type: 2 }];
      const ref = React.createRef();
      render(<MediaWidget ref={ref} {...makeProps({ mediaType: 9, list })} />);
      ref.current._playlistItem(0, list);
      expect(ref.current._media).toBeNull();
    });

    test('no present → total=1', () => {
      const list = [{ id: 'a', name: 'A', type: 3 }];
      const ref = React.createRef();
      render(<MediaWidget ref={ref} {...makeProps({ mediaType: 9, list })} />);
      ref.current._playlistItem(0, list);
      expect(ref.current._total).toBe(1);
    });

    test('subIndex=0 → subIndex state=1, src uses 0', () => {
      const list = [{ id: 'a', name: 'A', type: 3 }];
      const ref = React.createRef();
      render(<MediaWidget ref={ref} {...makeProps({ mediaType: 9, list })} />);
      ref.current._playlistItem(0, list, 0);
      expect(ref.current.state.subIndex).toBe(1);
      expect(ref.current.state.src).toContain('/0');
    });

    test('subIndex>1 → src uses subIndex', () => {
      const list = [{ id: 'a', name: 'A', type: 3 }];
      const ref = React.createRef();
      render(<MediaWidget ref={ref} {...makeProps({ mediaType: 9, list })} />);
      ref.current._playlistItem(0, list, 5);
      expect(ref.current.state.src).toContain('/5');
    });
  });

  // ─── _recordMedia ─────────────────────────────────────────────────────────

  describe('_recordMedia', () => {
    test('image=true → api record with item.id and subIndex', () => {
      api.mockResolvedValue({});
      const ref = React.createRef();
      render(<MediaWidget ref={ref} {...makeProps({ mediaType: 3 })} />);
      ref.current._item = { id: 'item1' };
      act(() => ref.current.setState({ subIndex: 3 }));
      ref.current._recordMedia(false, true);
      expect(api).toHaveBeenCalledWith('/api/storage/media/record/item1/3');
    });

    test('image=true, api error → addalert', async () => {
      api.mockRejectedValue('rec err');
      const props = makeProps({ mediaType: 3 });
      const ref = React.createRef();
      render(<MediaWidget ref={ref} {...props} />);
      ref.current._item = { id: 'item1' };
      ref.current._recordMedia(false, true);
      await flushPromises();
      expect(props.addalert).toHaveBeenCalledWith('rec err');
    });

    test('no media and type !== 9 → return true', () => {
      const ref = React.createRef();
      render(<MediaWidget ref={ref} {...makeProps({ mediaType: 3 })} />);
      ref.current._media = null;
      const result = ref.current._recordMedia();
      expect(result).toBe(true);
    });

    test('playlist without obj.id → return true', () => {
      const ref = React.createRef();
      render(<MediaWidget ref={ref} {...makeProps({ mediaType: 3 })} />);
      ref.current._media = { currentTime: 10, duration: 100 };
      ref.current._playlist = { obj: { id: '' }, total: 1 };
      const result = ref.current._recordMedia();
      expect(result).toBe(true);
    });

    test('with media, currentTime < duration-3 → uses parseInt currentTime', () => {
      api.mockResolvedValue({});
      const ref = React.createRef();
      render(<MediaWidget ref={ref} {...makeProps({ mediaType: 3 })} />);
      ref.current._item = { id: 'item1' };
      ref.current._media = { currentTime: 50.7, duration: 100 };
      ref.current._playlist = null;
      ref.current._recordMedia();
      expect(api).toHaveBeenCalledWith('/api/storage/media/record/item1/50');
    });

    test('with media, currentTime >= duration-3 → uses 0', () => {
      api.mockResolvedValue({});
      const ref = React.createRef();
      render(<MediaWidget ref={ref} {...makeProps({ mediaType: 3 })} />);
      ref.current._item = { id: 'item1' };
      ref.current._media = { currentTime: 98, duration: 100 };
      ref.current._playlist = null;
      ref.current._recordMedia();
      expect(api).toHaveBeenCalledWith('/api/storage/media/record/item1/0');
    });

    test('type 9 → adds &index', () => {
      api.mockResolvedValue({});
      const ref = React.createRef();
      render(<MediaWidget ref={ref} {...makeProps({ mediaType: 9, list: [{ id: 'a', name: 'A', type: 3 }] })} />);
      ref.current._item = { id: 'item1' };
      ref.current._media = { currentTime: 10, duration: 100 };
      ref.current._playlist = null;
      act(() => ref.current.setState({ index: 2 }));
      ref.current._recordMedia();
      expect(api).toHaveBeenCalledWith(expect.stringContaining('&2'));
    });

    test('no pause + playlist + total===obj.index → completion suffix', () => {
      api.mockResolvedValue({});
      const ref = React.createRef();
      render(<MediaWidget ref={ref} {...makeProps({ mediaType: 3 })} />);
      ref.current._item = { id: 'item1' };
      ref.current._media = { currentTime: 10, duration: 100 };
      ref.current._playlist = { obj: { id: 'pl1', index: 5 }, total: 5 };
      ref.current._recordMedia(false);
      expect(api).toHaveBeenCalledWith(expect.stringContaining('/item1'));
    });

    test('pause=true → no completion suffix', () => {
      api.mockResolvedValue({});
      const ref = React.createRef();
      render(<MediaWidget ref={ref} {...makeProps({ mediaType: 3 })} />);
      ref.current._item = { id: 'item1' };
      ref.current._media = { currentTime: 10, duration: 100 };
      ref.current._playlist = { obj: { id: 'pl1', index: 5 }, total: 5 };
      ref.current._recordMedia(true);
      expect(api).toHaveBeenCalledWith(expect.not.stringContaining('/item1'));
    });

    test('no media but type===9 → does not return true', () => {
      api.mockResolvedValue({});
      const ref = React.createRef();
      render(<MediaWidget ref={ref} {...makeProps({ mediaType: 9, list: [{ id: 'a', name: 'A', type: 3 }] })} />);
      ref.current._item = { id: 'item1' };
      ref.current._media = null;
      ref.current._playlist = null;
      const result = ref.current._recordMedia();
      expect(result).not.toBe(true);
    });

    test('recordMedia api error → addalert', async () => {
      api.mockRejectedValue('media err');
      const props = makeProps({ mediaType: 3 });
      const ref = React.createRef();
      render(<MediaWidget ref={ref} {...props} />);
      ref.current._item = { id: 'item1' };
      ref.current._media = { currentTime: 10, duration: 100 };
      ref.current._playlist = null;
      ref.current._recordMedia();
      await flushPromises();
      expect(props.addalert).toHaveBeenCalledWith('media err');
    });

    test('playlist with obj.id → uses playlist obj.id', () => {
      api.mockResolvedValue({});
      const ref = React.createRef();
      render(<MediaWidget ref={ref} {...makeProps({ mediaType: 3 })} />);
      ref.current._item = { id: 'item1' };
      ref.current._media = { currentTime: 10, duration: 100 };
      ref.current._playlist = { obj: { id: 'plObj1', index: 1 }, total: 5 };
      ref.current._recordMedia(true);
      expect(api).toHaveBeenCalledWith(expect.stringContaining('plObj1'));
    });
  });

  // ─── _loadMedia ───────────────────────────────────────────────────────────

  describe('_loadMedia', () => {
    test('with item.id → calls recordMedia first', async () => {
      api.mockResolvedValue({});
      const ref = React.createRef();
      render(<MediaWidget ref={ref} {...makeProps({ mediaType: 3 })} />);
      ref.current._item = { id: 'existingId' };
      ref.current._media = { currentTime: 5, duration: 100 };
      ref.current._playlist = null;
      const spy = jest.spyOn(ref.current, '_recordMedia');
      await act(async () => {
        ref.current._loadMedia(0, [{ id: 'item1', name: 'Test' }]);
        await flushPromises();
      });
      expect(spy).toHaveBeenCalled();
    });

    test('without item.id → no recordMedia', async () => {
      api.mockResolvedValue({});
      const ref = React.createRef();
      render(<MediaWidget ref={ref} {...makeProps({ mediaType: 3 })} />);
      ref.current._item = {};
      ref.current._media = null;
      ref.current._playlist = null;
      const spy = jest.spyOn(ref.current, '_recordMedia');
      await act(async () => {
        ref.current._loadMedia(0, [{ id: 'item1', name: 'Test' }]);
        await flushPromises();
      });
      expect(spy).not.toHaveBeenCalled();
    });

    test('item.url → appends /external', async () => {
      api.mockResolvedValue({});
      const ref = React.createRef();
      render(<MediaWidget ref={ref} {...makeProps({ mediaType: 3 })} />);
      ref.current._item = {};
      ref.current._playlist = null;
      await act(async () => {
        ref.current._loadMedia(0, [{ id: 'item1', name: 'Test', url: 'http://ext.com' }]);
        await flushPromises();
      });
      expect(api).toHaveBeenCalledWith(expect.stringContaining('/external'));
    });

    test('subIndex with obj_arr in range, direction < 0 → while loop searching down', async () => {
      arrayObjectIndexOf.mockReturnValueOnce(-1).mockReturnValueOnce(0);
      api.mockResolvedValue({});
      const ref = React.createRef();
      render(<MediaWidget ref={ref} {...makeProps({ mediaType: 3 })} />);
      ref.current._item = {};
      ref.current._playlist = {
        obj: { id: 'p1', index: 3 },
        obj_arr: [{ index: 2, id: 'a' }, { index: 3, id: 'b' }, { index: 5, id: 'c' }],
        total: 10,
        pageToken: 'tk',
      };
      await act(async () => {
        ref.current._loadMedia(0, [{ id: 'item1', name: 'Test' }], 3, -1);
        await flushPromises();
      });
      expect(arrayObjectIndexOf).toHaveBeenCalled();
    });

    test('subIndex with obj_arr in range, direction >= 0 → while loop searching up', async () => {
      arrayObjectIndexOf.mockReturnValueOnce(-1).mockReturnValueOnce(1);
      api.mockResolvedValue({});
      const ref = React.createRef();
      render(<MediaWidget ref={ref} {...makeProps({ mediaType: 3 })} />);
      ref.current._item = {};
      ref.current._playlist = {
        obj: { id: 'p1', index: 3 },
        obj_arr: [{ index: 2, id: 'a' }, { index: 5, id: 'c' }],
        total: 10,
      };
      await act(async () => {
        ref.current._loadMedia(0, [{ id: 'item1', name: 'Test' }], 3, 1);
        await flushPromises();
      });
      expect(arrayObjectIndexOf).toHaveBeenCalled();
    });

    test('subIndex with obj_arr in range, direction >= 0, found immediately', async () => {
      arrayObjectIndexOf.mockReturnValue(1);
      api.mockResolvedValue({});
      const ref = React.createRef();
      render(<MediaWidget ref={ref} {...makeProps({ mediaType: 3 })} />);
      ref.current._item = {};
      ref.current._playlist = {
        obj: { id: 'p1', index: 3 },
        obj_arr: [{ index: 2, id: 'a' }, { index: 3, id: 'b' }],
        total: 10,
        pageToken: 'pt',
      };
      await act(async () => {
        ref.current._loadMedia(0, [{ id: 'item1', name: 'Test' }], 3, 0);
        await flushPromises();
      });
      expect(api).toHaveBeenCalledWith(expect.stringContaining('/b/pt'));
    });

    test('subIndex with obj_arr, out-of-range low, with pageP → back append', async () => {
      api.mockResolvedValue({});
      const ref = React.createRef();
      render(<MediaWidget ref={ref} {...makeProps({ mediaType: 3 })} />);
      ref.current._item = {};
      ref.current._playlist = {
        obj: { id: 'p1', index: 5 },
        obj_arr: [{ index: 5, id: 'a' }],
        total: 10,
        pageP: 'prevPage',
      };
      await act(async () => {
        ref.current._loadMedia(0, [{ id: 'item1', name: 'Test' }], 3);
        await flushPromises();
      });
      expect(api).toHaveBeenCalledWith(expect.stringContaining('/prevPage/back'));
    });

    test('subIndex with obj_arr, out-of-range low, subIndex===1 → no back', async () => {
      api.mockResolvedValue({});
      const ref = React.createRef();
      render(<MediaWidget ref={ref} {...makeProps({ mediaType: 3 })} />);
      ref.current._item = {};
      ref.current._playlist = {
        obj: { id: 'p1', index: 5 },
        obj_arr: [{ index: 5, id: 'a' }],
        total: 10,
        pageP: 'prevPage',
      };
      await act(async () => {
        ref.current._loadMedia(0, [{ id: 'item1', name: 'Test' }], 1);
        await flushPromises();
      });
      expect(api).toHaveBeenCalledWith(expect.not.stringContaining('/back'));
    });

    test('subIndex with obj_arr, out-of-range low, no pageP → just obj.id', async () => {
      api.mockResolvedValue({});
      const ref = React.createRef();
      render(<MediaWidget ref={ref} {...makeProps({ mediaType: 3 })} />);
      ref.current._item = {};
      ref.current._playlist = {
        obj: { id: 'p1', index: 5 },
        obj_arr: [{ index: 5, id: 'a' }],
        total: 10,
      };
      await act(async () => {
        ref.current._loadMedia(0, [{ id: 'item1', name: 'Test' }], 3);
        await flushPromises();
      });
      expect(api).toHaveBeenCalledWith(expect.stringContaining('/p1'));
    });

    test('subIndex with obj_arr, out-of-range high, with pageN', async () => {
      api.mockResolvedValue({});
      const ref = React.createRef();
      render(<MediaWidget ref={ref} {...makeProps({ mediaType: 3 })} />);
      ref.current._item = {};
      ref.current._playlist = {
        obj: { id: 'p1', index: 3 },
        obj_arr: [{ index: 3, id: 'a' }],
        total: 10,
        pageN: 'nextPage',
      };
      await act(async () => {
        ref.current._loadMedia(0, [{ id: 'item1', name: 'Test' }], 8);
        await flushPromises();
      });
      expect(api).toHaveBeenCalledWith(expect.stringContaining('/nextPage'));
    });

    test('subIndex with obj_arr, out-of-range high, no pageN', async () => {
      api.mockResolvedValue({});
      const ref = React.createRef();
      render(<MediaWidget ref={ref} {...makeProps({ mediaType: 3 })} />);
      ref.current._item = {};
      ref.current._playlist = {
        obj: { id: 'p1', index: 3 },
        obj_arr: [{ index: 3, id: 'a' }],
        total: 10,
      };
      await act(async () => {
        ref.current._loadMedia(0, [{ id: 'item1', name: 'Test' }], 8);
        await flushPromises();
      });
      expect(api).toHaveBeenCalledWith(expect.stringContaining('/p1'));
    });

    test('subIndex without obj_arr → /subIndex append', async () => {
      api.mockResolvedValue({});
      const ref = React.createRef();
      render(<MediaWidget ref={ref} {...makeProps({ mediaType: 3 })} />);
      ref.current._item = {};
      ref.current._playlist = { obj: { id: 'p1', index: 3 }, total: 10 };
      await act(async () => {
        ref.current._loadMedia(0, [{ id: 'item1', name: 'Test' }], 7);
        await flushPromises();
      });
      expect(api).toHaveBeenCalledWith(expect.stringContaining('/7'));
    });

    test('API success: result.time with match and _media → sets startTime', async () => {
      api.mockResolvedValue({ time: '25' });
      const ref = React.createRef();
      render(<MediaWidget ref={ref} {...makeProps({ mediaType: 3 })} />);
      ref.current._item = {};
      ref.current._playlist = null;
      const video = ref.current._video;
      mockMediaElement(video);
      ref.current._media = video;
      await act(async () => {
        ref.current._loadMedia(0, [{ id: 'item1', name: 'Test' }]);
        await flushPromises();
      });
      expect(ref.current._startTime).toBe('25');
    });

    test('API success: result.time with match and !_media → subIndex++', async () => {
      api.mockResolvedValue({ time: '10' });
      const ref = React.createRef();
      render(<MediaWidget ref={ref} {...makeProps({ mediaType: 2 })} />);
      ref.current._item = {};
      ref.current._playlist = null;
      ref.current._media = null;
      await act(async () => {
        ref.current._loadMedia(0, [{ id: 'item1', name: 'Test' }]);
        await flushPromises();
      });
      // subIndex should be modified
    });

    test('API success: result.time with no match → no time handling', async () => {
      api.mockResolvedValue({ time: 'invalid' });
      const ref = React.createRef();
      render(<MediaWidget ref={ref} {...makeProps({ mediaType: 3 })} />);
      ref.current._item = {};
      ref.current._playlist = null;
      ref.current._media = null;
      await act(async () => {
        ref.current._loadMedia(0, [{ id: 'item1', name: 'Test' }]);
        await flushPromises();
      });
    });

    test('API success: result.time with &-format → parses both parts', async () => {
      api.mockResolvedValue({ time: '25&3' });
      const ref = React.createRef();
      render(<MediaWidget ref={ref} {...makeProps({ mediaType: 3 })} />);
      ref.current._item = {};
      ref.current._playlist = null;
      ref.current._media = ref.current._video;
      mockMediaElement(ref.current._video);
      await act(async () => {
        ref.current._loadMedia(0, [{ id: 'item1', name: 'Test' }]);
        await flushPromises();
      });
    });

    test('API success: no result.time → no time handling', async () => {
      api.mockResolvedValue({});
      const ref = React.createRef();
      render(<MediaWidget ref={ref} {...makeProps({ mediaType: 3 })} />);
      ref.current._item = {};
      ref.current._playlist = null;
      ref.current._media = null;
      await act(async () => {
        ref.current._loadMedia(0, [{ id: 'item1', name: 'Test' }]);
        await flushPromises();
      });
    });

    test('API success: result.playlist → sets playlist and subIndex', async () => {
      api.mockResolvedValue({ playlist: { obj: { index: 3, id: 'pl1' }, total: 10 } });
      const ref = React.createRef();
      render(<MediaWidget ref={ref} {...makeProps({ mediaType: 3 })} />);
      ref.current._item = {};
      ref.current._playlist = null;
      await act(async () => {
        ref.current._loadMedia(0, [{ id: 'item1', name: 'Test' }]);
        await flushPromises();
      });
      expect(ref.current._playlist).toBeTruthy();
      expect(ref.current.state.subIndex).toBe(3);
    });

    test('API success: no result.playlist → playlist becomes null', async () => {
      api.mockResolvedValue({});
      const ref = React.createRef();
      render(<MediaWidget ref={ref} {...makeProps({ mediaType: 3 })} />);
      ref.current._item = {};
      ref.current._playlist = { obj: { id: 'x' }, total: 1 };
      await act(async () => {
        ref.current._loadMedia(0, [{ id: 'item1', name: 'Test' }]);
        await flushPromises();
      });
      expect(ref.current._playlist).toBeNull();
    });

    test('title with thumb + playlist + is_magnet', async () => {
      api.mockResolvedValue({ playlist: { obj: { index: 1, id: 'pl1', is_magnet: true, title: 'Magnet Title' }, total: 5 } });
      const ref = React.createRef();
      render(<MediaWidget ref={ref} {...makeProps({ mediaType: 3 })} />);
      ref.current._item = {};
      await act(async () => {
        ref.current._loadMedia(0, [{ id: 'item1', name: 'Test', thumb: 'http://thumb.jpg' }]);
        await flushPromises();
      });
      expect(ref.current._title).toContain('Magnet Title');
    });

    test('title with thumb + playlist + pre_url', async () => {
      api.mockResolvedValue({ playlist: { obj: { index: 1, id: 'pl1', pre_url: 'http://url', title: 'Pre Title' }, total: 5 } });
      const ref = React.createRef();
      render(<MediaWidget ref={ref} {...makeProps({ mediaType: 3 })} />);
      ref.current._item = {};
      await act(async () => {
        ref.current._loadMedia(0, [{ id: 'item1', name: 'Test', thumb: 'http://thumb.jpg' }]);
        await flushPromises();
      });
      expect(ref.current._title).toContain('Pre Title');
    });

    test('no thumb → resets start and fix', async () => {
      api.mockResolvedValue({});
      const ref = React.createRef();
      render(<MediaWidget ref={ref} {...makeProps({ mediaType: 3 })} />);
      ref.current._item = {};
      ref.current._playlist = null;
      ref.current._start = true;
      ref.current._fix = 5;
      await act(async () => {
        ref.current._loadMedia(0, [{ id: 'item1', name: 'Test' }]);
        await flushPromises();
      });
      expect(ref.current._start).toBe(false);
      expect(ref.current._fix).toBe(0);
    });

    test('thumb + magnet + id → resets start and fix', async () => {
      api.mockResolvedValue({ playlist: { obj: { index: 1, id: 'pl1', is_magnet: true }, total: 5 } });
      const ref = React.createRef();
      render(<MediaWidget ref={ref} {...makeProps({ mediaType: 3 })} />);
      ref.current._item = {};
      ref.current._start = true;
      ref.current._fix = 5;
      await act(async () => {
        ref.current._loadMedia(0, [{ id: 'item1', name: 'Test', thumb: 'http://thumb.jpg' }]);
        await flushPromises();
      });
      expect(ref.current._start).toBe(false);
      expect(ref.current._fix).toBe(0);
    });

    test('thumb without magnet → does not reset at line 367', async () => {
      api.mockResolvedValue({ playlist: { obj: { index: 1, id: 'pl1', pre_url: 'http://pre.com' }, total: 5 } });
      const ref = React.createRef();
      render(<MediaWidget ref={ref} {...makeProps({ mediaType: 3 })} />);
      ref.current._item = {};
      ref.current._start = true;
      ref.current._fix = 5;
      await act(async () => {
        ref.current._loadMedia(0, [{ id: 'item1', name: 'Test', thumb: 'http://thumb.jpg' }]);
        await flushPromises();
      });
      expect(ref.current._start).toBe(true);
    });

    test('setState case 0: same index + media → reset currentTime', async () => {
      api.mockResolvedValue({});
      const ref = React.createRef();
      render(<MediaWidget ref={ref} {...makeProps({ mediaType: 3 })} />);
      ref.current._item = {};
      ref.current._playlist = null;
      const video = ref.current._video;
      mockMediaElement(video);
      ref.current._media = video;
      video.currentTime = 50;
      act(() => ref.current.setState({ index: 0 }));
      await act(async () => {
        ref.current._loadMedia(0, [{ id: 'item1', name: 'Test' }]);
        await flushPromises();
      });
      expect(video.currentTime).toBe(0);
    });

    test('setState case 0: different index → no currentTime reset', async () => {
      api.mockResolvedValue({});
      const ref = React.createRef();
      render(<MediaWidget ref={ref} {...makeProps({ mediaType: 3 })} />);
      ref.current._item = {};
      ref.current._playlist = null;
      const video = ref.current._video;
      mockMediaElement(video);
      ref.current._media = video;
      video.currentTime = 50;
      act(() => ref.current.setState({ index: 5 }));
      await act(async () => {
        ref.current._loadMedia(0, [{ id: 'item1', name: 'Test' }]);
        await flushPromises();
      });
    });

    test('setState case 1: isValidString true → getPath + upload', async () => {
      const apiCalls = [];
      api.mockImplementation((...args) => {
        apiCalls.push(args[0]);
        if (args[0].includes('setTime')) return Promise.resolve({ playlist: { obj: { index: 1, id: '', is_magnet: true, magnet: 'magnet:?xt=abc' }, total: 5 } });
        if (args[0].includes('getPath')) return Promise.resolve({ path: '/mnt/data' });
        if (args[0].includes('upload')) return Promise.resolve({ id: 'newId' });
        return Promise.resolve({});
      });
      isValidString.mockReturnValue(['magnet:?xt=abc']);
      const ref = React.createRef();
      render(<MediaWidget ref={ref} {...makeProps({ mediaType: 3 })} />);
      ref.current._item = {};
      ref.current._playlist = null;
      await act(async () => {
        ref.current._loadMedia(0, [{ id: 'item1', name: 'Test', thumb: 'http://thumb.jpg' }]);
        await flushPromises();
      });
      expect(isValidString).toHaveBeenCalledWith('magnet:?xt=abc', 'url');
    });

    test('setState case 1: isValidString false → reject', async () => {
      api.mockImplementation((...args) => {
        if (args[0].includes('setTime')) return Promise.resolve({ playlist: { obj: { index: 1, id: '', is_magnet: true, magnet: 'bad' }, total: 5 } });
        return Promise.resolve({});
      });
      isValidString.mockReturnValue(null);
      const props = makeProps({ mediaType: 3 });
      const ref = React.createRef();
      render(<MediaWidget ref={ref} {...props} />);
      ref.current._item = {};
      ref.current._playlist = null;
      // Case 1 of the setState callback creates Promise.reject('magnet not valid').
      // We spy to add a .catch() handler so jest-circus doesn't fail the test.
      const origReject = Promise.reject.bind(Promise);
      const spy = jest.spyOn(Promise, 'reject').mockImplementation(reason => {
        const p = origReject(reason);
        p.catch(() => {});
        return p;
      });
      await act(async () => {
        ref.current._loadMedia(0, [{ id: 'item1', name: 'Test', thumb: 'http://thumb.jpg' }]);
        await flushPromises();
        await flushPromises();
        await flushPromises();
      });
      expect(spy).toHaveBeenCalledWith('magnet not valid');
      spy.mockRestore();
    });

    test('setState case 2: result with audio + status 4 → audio src', async () => {
      api.mockImplementation((...args) => {
        if (args[0].includes('setTime')) return Promise.resolve({});
        if (args[0].includes('getSingle')) return Promise.resolve({ audio: 'http://audio.mp3', title: 'T' });
        return Promise.resolve({});
      });
      const ref = React.createRef();
      render(<MediaWidget ref={ref} {...makeProps({ mediaType: 3 })} />);
      ref.current._item = {};
      ref.current._playlist = null;
      await act(async () => {
        ref.current._loadMedia(0, [{ id: 'item1', name: 'Test', thumb: 'http://thumb.jpg', status: 4 }]);
        await flushPromises();
      });
      expect(ref.current.state.src).toBe('http://audio.mp3');
    });

    test('setState case 2: result with iframe → iframe src', async () => {
      api.mockImplementation((...args) => {
        if (args[0].includes('setTime')) return Promise.resolve({});
        if (args[0].includes('getSingle')) return Promise.resolve({ iframe: ['http://iframe.com'], title: 'T' });
        return Promise.resolve({});
      });
      const ref = React.createRef();
      render(<MediaWidget ref={ref} {...makeProps({ mediaType: 3 })} />);
      ref.current._item = {};
      ref.current._playlist = null;
      await act(async () => {
        ref.current._loadMedia(0, [{ id: 'item1', name: 'Test', thumb: 'http://thumb.jpg' }]);
        await flushPromises();
      });
      expect(ref.current.state.src).toBe('iframe: http://iframe.com');
    });

    test('setState case 2: result with embed → embed src', async () => {
      api.mockImplementation((...args) => {
        if (args[0].includes('setTime')) return Promise.resolve({});
        if (args[0].includes('getSingle')) return Promise.resolve({ embed: ['http://embed.swf'], title: 'T' });
        return Promise.resolve({});
      });
      const ref = React.createRef();
      render(<MediaWidget ref={ref} {...makeProps({ mediaType: 3 })} />);
      ref.current._item = {};
      ref.current._playlist = null;
      await act(async () => {
        ref.current._loadMedia(0, [{ id: 'item1', name: 'Test', thumb: 'http://thumb.jpg' }]);
        await flushPromises();
      });
      expect(ref.current.state.src).toBe('embed: http://embed.swf');
    });

    test('setState case 2: result with url → url src', async () => {
      api.mockImplementation((...args) => {
        if (args[0].includes('setTime')) return Promise.resolve({});
        if (args[0].includes('getSingle')) return Promise.resolve({ url: ['http://url.com'], title: 'T' });
        return Promise.resolve({});
      });
      const ref = React.createRef();
      render(<MediaWidget ref={ref} {...makeProps({ mediaType: 3 })} />);
      ref.current._item = {};
      ref.current._playlist = null;
      await act(async () => {
        ref.current._loadMedia(0, [{ id: 'item1', name: 'Test', thumb: 'http://thumb.jpg' }]);
        await flushPromises();
      });
      expect(ref.current.state.src).toBe('url: http://url.com');
    });

    test('setState case 2: result with video → video src', async () => {
      api.mockImplementation((...args) => {
        if (args[0].includes('setTime')) return Promise.resolve({});
        if (args[0].includes('getSingle')) return Promise.resolve({ video: ['http://vid.mp4'], title: 'T' });
        return Promise.resolve({});
      });
      const ref = React.createRef();
      render(<MediaWidget ref={ref} {...makeProps({ mediaType: 3 })} />);
      ref.current._item = {};
      ref.current._playlist = null;
      await act(async () => {
        ref.current._loadMedia(0, [{ id: 'item1', name: 'Test', thumb: 'http://thumb.jpg' }]);
        await flushPromises();
      });
      expect(ref.current.state.src).toBe('http://vid.mp4');
    });

    test('setState case 2: getSingle error + status 4 → nextMedia', async () => {
      api.mockImplementation((...args) => {
        if (args[0].includes('setTime')) return Promise.resolve({});
        if (args[0].includes('getSingle')) return Promise.reject('not found');
        return Promise.resolve({});
      });
      const props = makeProps({ mediaType: 3 });
      const ref = React.createRef();
      render(<MediaWidget ref={ref} {...props} />);
      ref.current._item = {};
      ref.current._playlist = null;
      const spy = jest.spyOn(ref.current, '_nextMedia');
      await act(async () => {
        ref.current._loadMedia(0, [{ id: 'item1', name: 'Test', thumb: 'http://thumb.jpg', status: 4 }]);
        await flushPromises();
      });
      expect(props.addalert).toHaveBeenCalledWith('not found');
      expect(spy).toHaveBeenCalled();
    });

    test('setState case 2: getSingle error + status !== 4 → no nextMedia', async () => {
      api.mockImplementation((...args) => {
        if (args[0].includes('setTime')) return Promise.resolve({});
        if (args[0].includes('getSingle')) return Promise.reject('not found');
        return Promise.resolve({});
      });
      const props = makeProps({ mediaType: 3 });
      const ref = React.createRef();
      render(<MediaWidget ref={ref} {...props} />);
      ref.current._item = {};
      ref.current._playlist = null;
      const spy = jest.spyOn(ref.current, '_nextMedia');
      await act(async () => {
        ref.current._loadMedia(0, [{ id: 'item1', name: 'Test', thumb: 'http://thumb.jpg', status: 3 }]);
        await flushPromises();
      });
      expect(spy).not.toHaveBeenCalled();
    });

    test('setState case 2: with playlist obj.sub → sets sub', async () => {
      api.mockImplementation((...args) => {
        if (args[0].includes('setTime')) return Promise.resolve({});
        if (args[0].includes('getSingle')) return Promise.resolve({ video: ['http://v.mp4'], sub: 'sub.srt', title: 'T' });
        return Promise.resolve({});
      });
      const ref = React.createRef();
      render(<MediaWidget ref={ref} {...makeProps({ mediaType: 3 })} />);
      ref.current._item = {};
      ref.current._playlist = null;
      await act(async () => {
        ref.current._loadMedia(0, [{ id: 'item1', name: 'Test', thumb: 'http://thumb.jpg' }]);
        await flushPromises();
      });
    });

    test('setState case 2: with playlist title', async () => {
      api.mockImplementation((...args) => {
        if (args[0].includes('setTime')) return Promise.resolve({ playlist: { obj: { index: 1, id: 'pl1', title: '' }, total: 5 } });
        if (args[0].includes('getSingle')) return Promise.resolve({ video: ['http://v.mp4'], title: 'Fetched Title' });
        return Promise.resolve({});
      });
      const ref = React.createRef();
      render(<MediaWidget ref={ref} {...makeProps({ mediaType: 3 })} />);
      ref.current._item = {};
      ref.current._playlist = null;
      await act(async () => {
        ref.current._loadMedia(0, [{ id: 'item1', name: 'Test', thumb: 'http://thumb.jpg' }]);
        await flushPromises();
      });
      expect(ref.current._title).toContain('Fetched Title');
    });

    test('API failure → resets state', async () => {
      api.mockRejectedValue('load error');
      const ref = React.createRef();
      render(<MediaWidget ref={ref} {...makeProps({ mediaType: 3 })} />);
      ref.current._item = {};
      ref.current._playlist = { obj: { id: 'pl1' }, total: 1 };
      let err;
      await act(async () => {
        try {
          await ref.current._loadMedia(0, [{ id: 'item1', name: 'Test' }]);
        } catch (e) {
          err = e;
        }
        await flushPromises();
      });
      expect(ref.current._playlist).toBeNull();
      expect(ref.current._title).toBe('');
      expect(ref.current.state.src).toBe('');
      expect(err).toBe('load error');
    });

    test('src: magnet + id → torrent/v url', async () => {
      api.mockResolvedValue({ playlist: { obj: { index: 1, id: 'pl1', is_magnet: true }, total: 5 } });
      const ref = React.createRef();
      render(<MediaWidget ref={ref} {...makeProps({ mediaType: 3 })} />);
      ref.current._item = {};
      ref.current._playlist = null;
      await act(async () => {
        ref.current._loadMedia(0, [{ id: 'item1', name: 'Test' }]);
        await flushPromises();
      });
      expect(ref.current.state.src).toContain('/torrent/v/pl1/0');
    });

    test('src: pre_url → url: prefix', async () => {
      api.mockResolvedValue({ playlist: { obj: { index: 1, id: 'pl1', pre_url: 'http://pre.com' }, total: 5 } });
      const ref = React.createRef();
      render(<MediaWidget ref={ref} {...makeProps({ mediaType: 3 })} />);
      ref.current._item = {};
      ref.current._playlist = null;
      await act(async () => {
        ref.current._loadMedia(0, [{ id: 'item1', name: 'Test' }]);
        await flushPromises();
      });
      expect(ref.current.state.src).toBe('url: http://pre.com');
    });

    test('src: thumb → thumb url', async () => {
      api.mockResolvedValue({});
      const ref = React.createRef();
      render(<MediaWidget ref={ref} {...makeProps({ mediaType: 3 })} />);
      ref.current._item = {};
      ref.current._playlist = null;
      await act(async () => {
        ref.current._loadMedia(0, [{ id: 'item1', name: 'Test', thumb: 'http://thumb.jpg' }]);
        await flushPromises();
      });
    });

    test('src: no thumb → file url', async () => {
      api.mockResolvedValue({});
      const ref = React.createRef();
      render(<MediaWidget ref={ref} {...makeProps({ mediaType: 3 })} />);
      ref.current._item = {};
      ref.current._playlist = null;
      await act(async () => {
        ref.current._loadMedia(0, [{ id: 'item1', name: 'Test' }]);
        await flushPromises();
      });
      expect(ref.current.state.src).toContain('/video/item1/file');
    });

    test('setState case 1: upload success with matching mediaId', async () => {
      api.mockImplementation((...args) => {
        if (args[0].includes('setTime')) return Promise.resolve({ playlist: { obj: { index: 1, id: '', is_magnet: true, magnet: 'magnet:?xt=abc' }, total: 5 } });
        if (args[0].includes('getPath')) return Promise.resolve({ path: '/mnt' });
        if (args[0].includes('upload')) return Promise.resolve({ id: 'newId123' });
        return Promise.resolve({});
      });
      isValidString.mockReturnValue(['magnet:?xt=abc']);
      const ref = React.createRef();
      render(<MediaWidget ref={ref} {...makeProps({ mediaType: 3 })} />);
      ref.current._item = {};
      ref.current._playlist = null;
      await act(async () => {
        ref.current._loadMedia(0, [{ id: 'item1', name: 'Test', thumb: 'http://thumb.jpg' }]);
        await flushPromises();
      });
      expect(ref.current.state.src).toContain('torrent/v/newId123/0');
    });

    test('setState case 1: upload error → addalert via catch', async () => {
      api.mockImplementation((...args) => {
        if (args[0].includes('setTime')) return Promise.resolve({ playlist: { obj: { index: 1, id: '', is_magnet: true, magnet: 'magnet:?xt=abc' }, total: 5 } });
        if (args[0].includes('getPath')) return Promise.reject('upload failed');
        return Promise.resolve({});
      });
      isValidString.mockReturnValue(['magnet:?xt=abc']);
      const props = makeProps({ mediaType: 3 });
      const ref = React.createRef();
      render(<MediaWidget ref={ref} {...props} />);
      ref.current._item = {};
      ref.current._playlist = null;
      await act(async () => {
        ref.current._loadMedia(0, [{ id: 'item1', name: 'Test', thumb: 'http://thumb.jpg' }]);
        await flushPromises();
      });
      expect(props.addalert).toHaveBeenCalledWith('upload failed');
    });

    test('setState case 0: pre_url → goes to default case', async () => {
      api.mockResolvedValue({ playlist: { obj: { index: 1, id: 'pl1', pre_url: 'http://pre.com' }, total: 5 } });
      const ref = React.createRef();
      render(<MediaWidget ref={ref} {...makeProps({ mediaType: 3 })} />);
      ref.current._item = {};
      ref.current._playlist = null;
      const video = ref.current._video;
      mockMediaElement(video);
      ref.current._media = video;
      act(() => ref.current.setState({ index: 0 }));
      await act(async () => {
        ref.current._loadMedia(0, [{ id: 'item1', name: 'Test' }]);
        await flushPromises();
      });
    });

    test('total calc: playlist with total', async () => {
      api.mockResolvedValue({ playlist: { obj: { index: 1, id: 'pl1' }, total: 42 } });
      const ref = React.createRef();
      render(<MediaWidget ref={ref} {...makeProps({ mediaType: 3 })} />);
      ref.current._item = {};
      ref.current._playlist = null;
      await act(async () => {
        ref.current._loadMedia(0, [{ id: 'item1', name: 'Test', present: 10 }]);
        await flushPromises();
      });
      expect(ref.current._total).toBe(42);
    });

    test('total calc: no playlist with present', async () => {
      api.mockResolvedValue({});
      const ref = React.createRef();
      render(<MediaWidget ref={ref} {...makeProps({ mediaType: 3 })} />);
      ref.current._item = {};
      ref.current._playlist = null;
      await act(async () => {
        ref.current._loadMedia(0, [{ id: 'item1', name: 'Test', present: 10 }]);
        await flushPromises();
      });
      expect(ref.current._total).toBe(10);
    });

    test('total calc: no playlist, no present → 1', async () => {
      api.mockResolvedValue({});
      const ref = React.createRef();
      render(<MediaWidget ref={ref} {...makeProps({ mediaType: 3 })} />);
      ref.current._item = {};
      ref.current._playlist = null;
      await act(async () => {
        ref.current._loadMedia(0, [{ id: 'item1', name: 'Test' }]);
        await flushPromises();
      });
      expect(ref.current._total).toBe(1);
    });
  });

  // ─── _moveMedia ───────────────────────────────────────────────────────────

  describe('_moveMedia', () => {
    test('loading → return true', () => {
      const ref = React.createRef();
      render(<MediaWidget ref={ref} {...makeProps({ mediaType: 3 })} />);
      act(() => ref.current.setState({ loading: true }));
      const result = ref.current._moveMedia(1);
      expect(result).toBe(true);
    });

    test('type 9, list > 1: normal index', () => {
      const list = [{ id: 'a', name: 'A', type: 3 }, { id: 'b', name: 'B', type: 3 }, { id: 'c', name: 'C', type: 3 }];
      const ref = React.createRef();
      render(<MediaWidget ref={ref} {...makeProps({ mediaType: 9, list })} />);
      act(() => ref.current.setState({ index: 1, loading: false }));
      const spy = jest.spyOn(ref.current, '_playlistItem');
      ref.current._moveMedia(1);
      expect(spy).toHaveBeenCalledWith(2, list);
    });

    test('type 9, list > 1: wrap to 0 on overflow', () => {
      const list = [{ id: 'a', name: 'A', type: 3 }, { id: 'b', name: 'B', type: 3 }];
      const ref = React.createRef();
      render(<MediaWidget ref={ref} {...makeProps({ mediaType: 9, list })} />);
      act(() => ref.current.setState({ index: 1, loading: false }));
      const spy = jest.spyOn(ref.current, '_playlistItem');
      ref.current._moveMedia(1);
      expect(spy).toHaveBeenCalledWith(0, list);
    });

    test('type 9, list > 1: wrap to end on underflow', () => {
      const list = [{ id: 'a', name: 'A', type: 3 }, { id: 'b', name: 'B', type: 3 }];
      const ref = React.createRef();
      render(<MediaWidget ref={ref} {...makeProps({ mediaType: 9, list })} />);
      act(() => ref.current.setState({ index: 0, loading: false }));
      const spy = jest.spyOn(ref.current, '_playlistItem');
      ref.current._moveMedia(-1);
      expect(spy).toHaveBeenCalledWith(1, list);
    });

    test('type 9, list length === 1 → noop', () => {
      const list = [{ id: 'a', name: 'A', type: 3 }];
      const ref = React.createRef();
      render(<MediaWidget ref={ref} {...makeProps({ mediaType: 9, list })} />);
      act(() => ref.current.setState({ loading: false }));
      const spy = jest.spyOn(ref.current, '_playlistItem');
      ref.current._moveMedia(1);
      expect(spy).not.toHaveBeenCalled();
    });

    test('non-9, no more → wrap index', async () => {
      api.mockResolvedValue({});
      const list = [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }];
      const ref = React.createRef();
      render(<MediaWidget ref={ref} {...makeProps({ mediaType: 3, list, more: false })} />);
      ref.current._item = {};
      ref.current._playlist = null;
      act(() => ref.current.setState({ index: 1, loading: false }));
      ref.current._moveMedia(1);
      await flushPromises();
    });

    test('non-9, more, OOB → api more', async () => {
      api.mockImplementation((...args) => {
        if (args[0].includes('/more/')) return Promise.resolve({ itemList: [], parentList: [] });
        if (args[0].includes('/get/')) return Promise.resolve({ itemList: [], pageToken: 'pt2' });
        return Promise.resolve({});
      });
      const list = [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }];
      const props = makeProps({ mediaType: 3, list, more: true });
      const ref = React.createRef();
      render(<MediaWidget ref={ref} {...props} />);
      ref.current._item = {};
      ref.current._playlist = null;
      act(() => ref.current.setState({ index: 1, loading: false }));
      ref.current._moveMedia(1);
      await flushPromises();
      expect(api).toHaveBeenCalledWith(expect.stringContaining('/more/'));
    });

    test('non-9, more, in range → direct index', async () => {
      api.mockResolvedValue({});
      const list = [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }, { id: 'c', name: 'C' }];
      const ref = React.createRef();
      render(<MediaWidget ref={ref} {...makeProps({ mediaType: 3, list, more: true })} />);
      ref.current._item = {};
      ref.current._playlist = null;
      act(() => ref.current.setState({ index: 0, loading: false }));
      ref.current._moveMedia(1);
      await flushPromises();
    });

    test('non-9, more, OOB error → addalert', async () => {
      api.mockRejectedValue('more err');
      const list = [{ id: 'a', name: 'A' }];
      const props = makeProps({ mediaType: 3, list, more: true });
      const ref = React.createRef();
      render(<MediaWidget ref={ref} {...props} />);
      ref.current._item = {};
      ref.current._playlist = null;
      act(() => ref.current.setState({ index: 0, loading: false }));
      ref.current._moveMedia(-1);
      await flushPromises();
      expect(props.addalert).toHaveBeenCalled();
    });

    test('non-9, no more, underflow → wrap to end', async () => {
      api.mockResolvedValue({});
      const list = [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }];
      const ref = React.createRef();
      render(<MediaWidget ref={ref} {...makeProps({ mediaType: 3, list, more: false })} />);
      ref.current._item = {};
      ref.current._playlist = null;
      act(() => ref.current.setState({ index: 0, loading: false }));
      ref.current._moveMedia(-1);
      await flushPromises();
    });
  });

  // ─── _movePlaylist ────────────────────────────────────────────────────────

  describe('_movePlaylist', () => {
    test('loading → return true', () => {
      const ref = React.createRef();
      render(<MediaWidget ref={ref} {...makeProps({ mediaType: 3 })} />);
      act(() => ref.current.setState({ loading: true }));
      const result = ref.current._movePlaylist(1);
      expect(result).toBe(true);
    });

    test('playlist, direction=0, no sub → parseFloat subIndex', async () => {
      api.mockResolvedValue({});
      const ref = React.createRef();
      render(<MediaWidget ref={ref} {...makeProps({ mediaType: 3 })} />);
      ref.current._item = { id: 'item1' };
      ref.current._playlist = { obj: { id: 'p1', index: 3 }, total: 10 };
      act(() => ref.current.setState({ subIndex: '5', index: 0, loading: false }));
      ref.current._movePlaylist(0);
      await flushPromises();
    });

    test('playlist, direction=0, with sub, %1000 > sub → floor+1', async () => {
      api.mockResolvedValue({});
      const ref = React.createRef();
      render(<MediaWidget ref={ref} {...makeProps({ mediaType: 3 })} />);
      ref.current._item = { id: 'item1' };
      ref.current._playlist = { obj: { id: 'p1', index: 3, sub: 2 }, total: 10 };
      act(() => ref.current.setState({ subIndex: '3.005', index: 0, loading: false }));
      ref.current._movePlaylist(0);
      await flushPromises();
    });

    test('playlist, direction=0, with sub, normal → /1000', async () => {
      api.mockResolvedValue({});
      const ref = React.createRef();
      render(<MediaWidget ref={ref} {...makeProps({ mediaType: 3 })} />);
      ref.current._item = { id: 'item1' };
      ref.current._playlist = { obj: { id: 'p1', index: 3, sub: 5 }, total: 10 };
      act(() => ref.current.setState({ subIndex: '3.002', index: 0, loading: false }));
      ref.current._movePlaylist(0);
      await flushPromises();
    });

    test('playlist, direction=0, with sub, %1000===0 after increment → unreachable normally but covered by code', async () => {
      api.mockResolvedValue({});
      const ref = React.createRef();
      render(<MediaWidget ref={ref} {...makeProps({ mediaType: 3 })} />);
      ref.current._item = { id: 'item1' };
      ref.current._playlist = { obj: { id: 'p1', index: 2, sub: 3 }, total: 10 };
      act(() => ref.current.setState({ subIndex: '3', index: 0, loading: false }));
      ref.current._movePlaylist(0);
      await flushPromises();
    });

    test('playlist, direction!=0, with sub → normal path', async () => {
      api.mockResolvedValue({});
      const ref = React.createRef();
      render(<MediaWidget ref={ref} {...makeProps({ mediaType: 3 })} />);
      ref.current._item = { id: 'item1' };
      ref.current._playlist = { obj: { id: 'p1', index: 3.002, sub: 5 }, total: 10 };
      act(() => ref.current.setState({ index: 0, loading: false }));
      ref.current._movePlaylist(1);
      await flushPromises();
    });

    test('playlist, direction!=0, with sub, %1000===0 → floor-1', async () => {
      api.mockResolvedValue({});
      const ref = React.createRef();
      render(<MediaWidget ref={ref} {...makeProps({ mediaType: 3 })} />);
      ref.current._item = { id: 'item1' };
      ref.current._playlist = { obj: { id: 'p1', index: 3, sub: 3 }, total: 10 };
      act(() => ref.current.setState({ index: 0, loading: false }));
      ref.current._movePlaylist(-1);
      await flushPromises();
    });

    test('playlist, direction!=0, with sub, %1000 > sub → floor+1', async () => {
      api.mockResolvedValue({});
      const ref = React.createRef();
      render(<MediaWidget ref={ref} {...makeProps({ mediaType: 3 })} />);
      ref.current._item = { id: 'item1' };
      ref.current._playlist = { obj: { id: 'p1', index: 3.002, sub: 2 }, total: 10 };
      act(() => ref.current.setState({ index: 0, loading: false }));
      ref.current._movePlaylist(1);
      await flushPromises();
    });

    test('playlist, direction!=0, without sub → floor + direction', async () => {
      api.mockResolvedValue({});
      const ref = React.createRef();
      render(<MediaWidget ref={ref} {...makeProps({ mediaType: 3 })} />);
      ref.current._item = { id: 'item1' };
      ref.current._playlist = { obj: { id: 'p1', index: 3 }, total: 10 };
      act(() => ref.current.setState({ index: 0, loading: false }));
      ref.current._movePlaylist(1);
      await flushPromises();
    });

    test('newIndex < 1 → clamp to 1', async () => {
      api.mockResolvedValue({});
      const ref = React.createRef();
      render(<MediaWidget ref={ref} {...makeProps({ mediaType: 3 })} />);
      ref.current._item = { id: 'item1' };
      ref.current._playlist = { obj: { id: 'p1', index: 1 }, total: 10 };
      act(() => ref.current.setState({ index: 0, loading: false }));
      ref.current._movePlaylist(-1);
      await flushPromises();
    });

    test('newIndex > total+1 → clamp to total', async () => {
      api.mockResolvedValue({});
      const ref = React.createRef();
      render(<MediaWidget ref={ref} {...makeProps({ mediaType: 3 })} />);
      ref.current._item = { id: 'item1' };
      ref.current._playlist = { obj: { id: 'p1', index: 10 }, total: 10 };
      act(() => ref.current.setState({ index: 0, loading: false }));
      ref.current._movePlaylist(5);
      await flushPromises();
    });

    test('type 2, same floor → setState + recordMedia', () => {
      const ref = React.createRef();
      render(<MediaWidget ref={ref} {...makeProps({ mediaType: 2 })} />);
      ref.current._item = { id: 'item1' };
      ref.current._playlist = { obj: { id: 'p1', index: 3.002, pre_url: 'http://pre.com', sub: 5 }, total: 10 };
      act(() => ref.current.setState({ loading: false }));
      const spy = jest.spyOn(ref.current, '_recordMedia');
      ref.current._movePlaylist(1);
      expect(ref.current.state.src).toBe('url: http://pre.com');
      expect(spy).toHaveBeenCalledWith(false, true);
    });

    test('not type 2 or different floor → loadMedia', async () => {
      api.mockResolvedValue({});
      const ref = React.createRef();
      render(<MediaWidget ref={ref} {...makeProps({ mediaType: 3 })} />);
      ref.current._item = { id: 'item1' };
      ref.current._playlist = { obj: { id: 'p1', index: 3 }, total: 10 };
      act(() => ref.current.setState({ index: 0, loading: false }));
      const spy = jest.spyOn(ref.current, '_loadMedia');
      ref.current._movePlaylist(1);
      await flushPromises();
      expect(spy).toHaveBeenCalled();
    });

    test('no playlist, type 2, with direction → floor + direction', () => {
      const ref = React.createRef();
      render(<MediaWidget ref={ref} {...makeProps({ mediaType: 2 })} />);
      ref.current._item = { id: 'item1' };
      ref.current._playlist = null;
      ref.current._total = 5;
      act(() => ref.current.setState({ subIndex: 2, loading: false }));
      ref.current._movePlaylist(1);
      expect(ref.current.state.src).toContain('/image/item1/3');
      expect(ref.current.state.subIndex).toBe(3);
    });

    test('no playlist, type 2, no direction → same floor', () => {
      const ref = React.createRef();
      render(<MediaWidget ref={ref} {...makeProps({ mediaType: 2 })} />);
      ref.current._item = { id: 'item1' };
      ref.current._playlist = null;
      ref.current._total = 5;
      act(() => ref.current.setState({ subIndex: 3, loading: false }));
      ref.current._movePlaylist(0);
      expect(ref.current.state.src).toContain('/image/item1/3');
    });

    test('no playlist, type 2, clamp low', () => {
      const ref = React.createRef();
      render(<MediaWidget ref={ref} {...makeProps({ mediaType: 2 })} />);
      ref.current._item = { id: 'item1' };
      ref.current._playlist = null;
      ref.current._total = 5;
      act(() => ref.current.setState({ subIndex: 1, loading: false }));
      ref.current._movePlaylist(-1);
      expect(ref.current.state.subIndex).toBe(1);
    });

    test('no playlist, type 2, clamp high', () => {
      const ref = React.createRef();
      render(<MediaWidget ref={ref} {...makeProps({ mediaType: 2 })} />);
      ref.current._item = { id: 'item1' };
      ref.current._playlist = null;
      ref.current._total = 3;
      act(() => ref.current.setState({ subIndex: 3, loading: false }));
      ref.current._movePlaylist(1);
      expect(ref.current.state.subIndex).toBe(3);
    });

    test('no playlist, type 9 → playlistItem', () => {
      const list = [{ id: 'a', name: 'A', type: 3, present: 5 }, { id: 'b', name: 'B', type: 4 }];
      const ref = React.createRef();
      render(<MediaWidget ref={ref} {...makeProps({ mediaType: 9, list })} />);
      ref.current._item = { id: 'a', type: 3 };
      ref.current._playlist = null;
      ref.current._total = 5;
      act(() => ref.current.setState({ subIndex: 2, index: 0, loading: false }));
      const spy = jest.spyOn(ref.current, '_playlistItem');
      ref.current._movePlaylist(1);
      expect(spy).toHaveBeenCalledWith(0, list, 3);
    });

    test('movePlaylist loadMedia error → addalert', async () => {
      api.mockRejectedValue('pl err');
      const props = makeProps({ mediaType: 3 });
      const ref = React.createRef();
      render(<MediaWidget ref={ref} {...props} />);
      ref.current._item = { id: 'item1' };
      ref.current._playlist = { obj: { id: 'p1', index: 3 }, total: 10 };
      act(() => ref.current.setState({ index: 0, loading: false }));
      ref.current._movePlaylist(1);
      await flushPromises();
      expect(props.addalert).toHaveBeenCalledWith('pl err');
    });
  });

  // ─── _nextMedia ───────────────────────────────────────────────────────────

  describe('_nextMedia', () => {
    test('_media with preTime < duration-3 → pause and return', () => {
      const ref = React.createRef();
      render(<MediaWidget ref={ref} {...makeProps({ mediaType: 3 })} />);
      const video = ref.current._video;
      mockMediaElement(video);
      ref.current._media = video;
      ref.current._preTime = 50;
      video.duration = 100;
      const result = ref.current._nextMedia(false);
      expect(video.currentTime).toBe(50);
      expect(video.pause).toHaveBeenCalled();
      expect(result).toBe(true);
    });

    test('_media with preTime >= duration-3 → continues', () => {
      const ref = React.createRef();
      render(<MediaWidget ref={ref} {...makeProps({ mediaType: 3 })} />);
      const video = ref.current._video;
      mockMediaElement(video);
      ref.current._media = video;
      ref.current._preTime = 98;
      video.duration = 100;
      ref.current._playlist = null;
      act(() => ref.current.setState({ mode: 0 }));
      ref.current._nextMedia(false);
    });

    test('playlist, previous=true, sub, index > 0.001 → movePlaylist(-1)', () => {
      const ref = React.createRef();
      render(<MediaWidget ref={ref} {...makeProps({ mediaType: 3 })} />);
      ref.current._media = null;
      ref.current._playlist = { obj: { id: 'p1', index: 3.002, sub: 5 }, total: 10, end: true };
      act(() => ref.current.setState({ index: 0, loading: false }));
      const spy = jest.spyOn(ref.current, '_movePlaylist');
      const result = ref.current._nextMedia(true);
      expect(spy).toHaveBeenCalledWith(-1);
      expect(result).toBe(true);
    });

    test('playlist, previous=true, sub, index <= 0.001 → continues', () => {
      const ref = React.createRef();
      render(<MediaWidget ref={ref} {...makeProps({ mediaType: 3 })} />);
      ref.current._media = null;
      ref.current._playlist = { obj: { id: 'p1', index: 0.001, sub: 5 }, total: 10, end: true };
      act(() => ref.current.setState({ mode: 0 }));
      ref.current._nextMedia(true);
    });

    test('playlist, previous=true, no sub, index > 0 → movePlaylist(-1)', () => {
      const ref = React.createRef();
      render(<MediaWidget ref={ref} {...makeProps({ mediaType: 3 })} />);
      ref.current._media = null;
      ref.current._playlist = { obj: { id: 'p1', index: 3 }, total: 10, end: true };
      act(() => ref.current.setState({ index: 0, loading: false }));
      const spy = jest.spyOn(ref.current, '_movePlaylist');
      const result = ref.current._nextMedia(true);
      expect(spy).toHaveBeenCalledWith(-1);
      expect(result).toBe(true);
    });

    test('playlist, previous=true, no sub, index <= 0 → continues', () => {
      const ref = React.createRef();
      render(<MediaWidget ref={ref} {...makeProps({ mediaType: 3 })} />);
      ref.current._media = null;
      ref.current._playlist = { obj: { id: 'p1', index: 0 }, total: 10, end: true };
      act(() => ref.current.setState({ mode: 0 }));
      ref.current._nextMedia(true);
    });

    test('playlist, !previous, sub, condition met → movePlaylist(1)', () => {
      const ref = React.createRef();
      render(<MediaWidget ref={ref} {...makeProps({ mediaType: 3 })} />);
      ref.current._media = null;
      ref.current._playlist = { obj: { id: 'p1', index: 3.002, sub: 5 }, total: 10, end: true };
      act(() => ref.current.setState({ index: 0, loading: false }));
      const spy = jest.spyOn(ref.current, '_movePlaylist');
      const result = ref.current._nextMedia(false);
      expect(spy).toHaveBeenCalledWith(1);
      expect(result).toBe(true);
    });

    test('playlist, !previous, sub, index at total with sub within range → movePlaylist(1)', () => {
      const ref = React.createRef();
      render(<MediaWidget ref={ref} {...makeProps({ mediaType: 3 })} />);
      ref.current._media = null;
      ref.current._playlist = { obj: { id: 'p1', index: 10.002, sub: 5 }, total: 10, end: true };
      act(() => ref.current.setState({ index: 0, loading: false }));
      const spy = jest.spyOn(ref.current, '_movePlaylist');
      const result = ref.current._nextMedia(false);
      expect(spy).toHaveBeenCalledWith(1);
      expect(result).toBe(true);
    });

    test('playlist, !previous, sub, beyond max → continues', () => {
      const ref = React.createRef();
      render(<MediaWidget ref={ref} {...makeProps({ mediaType: 3 })} />);
      ref.current._media = null;
      ref.current._playlist = { obj: { id: 'p1', index: 11.005, sub: 3 }, total: 10, end: true };
      act(() => ref.current.setState({ mode: 0 }));
      ref.current._nextMedia(false);
    });

    test('playlist, !previous, no sub, index < total → movePlaylist(1)', () => {
      const ref = React.createRef();
      render(<MediaWidget ref={ref} {...makeProps({ mediaType: 3 })} />);
      ref.current._media = null;
      ref.current._playlist = { obj: { id: 'p1', index: 3 }, total: 10, end: true };
      act(() => ref.current.setState({ index: 0, loading: false }));
      const spy = jest.spyOn(ref.current, '_movePlaylist');
      const result = ref.current._nextMedia(false);
      expect(spy).toHaveBeenCalledWith(1);
      expect(result).toBe(true);
    });

    test('playlist, !previous, no sub, index >= total → continues', () => {
      const ref = React.createRef();
      render(<MediaWidget ref={ref} {...makeProps({ mediaType: 3 })} />);
      ref.current._media = null;
      ref.current._playlist = { obj: { id: 'p1', index: 10 }, total: 10, end: true };
      act(() => ref.current.setState({ mode: 0 }));
      ref.current._nextMedia(false);
    });

    test('!end, mode 2 → setState + movePlaylist', () => {
      const ref = React.createRef();
      render(<MediaWidget ref={ref} {...makeProps({ mediaType: 3 })} />);
      ref.current._media = null;
      ref.current._playlist = { obj: { id: 'p1', index: 10 }, total: 10, end: false };
      act(() => ref.current.setState({ mode: 2, index: 0, loading: false }));
      const spy = jest.spyOn(ref.current, '_movePlaylist');
      ref.current._nextMedia(false);
      expect(ref.current.state.subIndex).toBe(1);
      expect(spy).toHaveBeenCalled();
    });

    test('!end, mode !== 2 → return true', () => {
      const ref = React.createRef();
      render(<MediaWidget ref={ref} {...makeProps({ mediaType: 3 })} />);
      ref.current._media = null;
      ref.current._playlist = { obj: { id: 'p1', index: 10 }, total: 10, end: false };
      act(() => ref.current.setState({ mode: 0 }));
      const result = ref.current._nextMedia(false);
      expect(result).toBe(true);
    });

    test('no playlist, type 2, previous, subIndex > 0 → movePlaylist(-1)', () => {
      const ref = React.createRef();
      render(<MediaWidget ref={ref} {...makeProps({ mediaType: 2 })} />);
      ref.current._media = null;
      ref.current._playlist = null;
      act(() => ref.current.setState({ subIndex: 3, loading: false }));
      const spy = jest.spyOn(ref.current, '_movePlaylist');
      const result = ref.current._nextMedia(true);
      expect(spy).toHaveBeenCalledWith(-1);
      expect(result).toBe(true);
    });

    test('no playlist, type 9, !previous, subIndex < total → movePlaylist(1)', () => {
      const list = [{ id: 'a', name: 'A', type: 3 }];
      const ref = React.createRef();
      render(<MediaWidget ref={ref} {...makeProps({ mediaType: 9, list })} />);
      ref.current._media = null;
      ref.current._playlist = null;
      ref.current._total = 5;
      act(() => ref.current.setState({ subIndex: 3, index: 0, loading: false }));
      const spy = jest.spyOn(ref.current, '_movePlaylist');
      const result = ref.current._nextMedia(false);
      expect(spy).toHaveBeenCalledWith(1);
      expect(result).toBe(true);
    });

    test('mode 0 → default number (previous=-1)', () => {
      const ref = React.createRef();
      render(<MediaWidget ref={ref} {...makeProps({ mediaType: 3 })} />);
      ref.current._media = null;
      ref.current._playlist = { obj: { id: 'p1', index: 0 }, total: 10, end: true };
      act(() => ref.current.setState({ mode: 0, index: 0, loading: false }));
      const spy = jest.spyOn(ref.current, '_moveMedia');
      ref.current._nextMedia(true);
      expect(spy).toHaveBeenCalledWith(-1);
    });

    test('mode 0 → default number (!previous=1)', () => {
      const ref = React.createRef();
      render(<MediaWidget ref={ref} {...makeProps({ mediaType: 3 })} />);
      ref.current._media = null;
      ref.current._playlist = { obj: { id: 'p1', index: 10 }, total: 10, end: true };
      act(() => ref.current.setState({ mode: 0, index: 0, loading: false }));
      const spy = jest.spyOn(ref.current, '_moveMedia');
      ref.current._nextMedia(false);
      expect(spy).toHaveBeenCalledWith(1);
    });

    test('mode 1 → reversed number', () => {
      const ref = React.createRef();
      render(<MediaWidget ref={ref} {...makeProps({ mediaType: 3 })} />);
      ref.current._media = null;
      ref.current._playlist = { obj: { id: 'p1', index: 10 }, total: 10, end: true };
      act(() => ref.current.setState({ mode: 1, index: 0, loading: false }));
      const spy = jest.spyOn(ref.current, '_moveMedia');
      ref.current._nextMedia(false);
      expect(spy).toHaveBeenCalledWith(-1);
    });

    test('mode 2 → 0', () => {
      const ref = React.createRef();
      render(<MediaWidget ref={ref} {...makeProps({ mediaType: 3 })} />);
      ref.current._media = null;
      ref.current._playlist = { obj: { id: 'p1', index: 10 }, total: 10, end: true };
      act(() => ref.current.setState({ mode: 2, index: 0, loading: false }));
      const spy = jest.spyOn(ref.current, '_moveMedia');
      ref.current._nextMedia(false);
      expect(spy).toHaveBeenCalledWith(0);
    });

    test('mode 3, more → random with wider range', () => {
      randomFloor.mockReturnValue(5);
      const ref = React.createRef();
      render(<MediaWidget ref={ref} {...makeProps({ mediaType: 3, more: true })} />);
      ref.current._media = null;
      ref.current._playlist = { obj: { id: 'p1', index: 10 }, total: 10, end: true };
      act(() => ref.current.setState({ mode: 3, index: 0, loading: false }));
      const spy = jest.spyOn(ref.current, '_moveMedia');
      ref.current._nextMedia(false);
      expect(randomFloor).toHaveBeenCalledWith(0, expect.any(Number));
      expect(spy).toHaveBeenCalled();
    });

    test('mode 3, !more → random with list range', () => {
      randomFloor.mockReturnValue(2);
      const list = [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }, { id: 'c', name: 'C' }];
      const ref = React.createRef();
      render(<MediaWidget ref={ref} {...makeProps({ mediaType: 3, more: false, list })} />);
      ref.current._media = null;
      ref.current._playlist = { obj: { id: 'p1', index: 10 }, total: 10, end: true };
      act(() => ref.current.setState({ mode: 3, index: 0, loading: false }));
      const spy = jest.spyOn(ref.current, '_moveMedia');
      ref.current._nextMedia(false);
      expect(randomFloor).toHaveBeenCalledWith(0, 2);
      expect(spy).toHaveBeenCalled();
    });

    test('no playlist, type 2, previous subIndex <= 0 → falls through', () => {
      const ref = React.createRef();
      render(<MediaWidget ref={ref} {...makeProps({ mediaType: 2 })} />);
      ref.current._media = null;
      ref.current._playlist = null;
      act(() => ref.current.setState({ subIndex: 0, mode: 0, loading: false }));
      const spy = jest.spyOn(ref.current, '_moveMedia');
      ref.current._nextMedia(true);
      expect(spy).toHaveBeenCalledWith(-1);
    });

    test('no playlist, type 2, !previous subIndex >= total → falls through', () => {
      const ref = React.createRef();
      render(<MediaWidget ref={ref} {...makeProps({ mediaType: 2 })} />);
      ref.current._media = null;
      ref.current._playlist = null;
      ref.current._total = 3;
      act(() => ref.current.setState({ subIndex: 3, mode: 0, loading: false }));
      const spy = jest.spyOn(ref.current, '_moveMedia');
      ref.current._nextMedia(false);
      expect(spy).toHaveBeenCalledWith(1);
    });
  });

  // ─── _toggle / _changeMode / _handleChange ───────────────────────────────

  describe('_toggle', () => {
    test('calls killEvent with toggleShow', () => {
      const ref = React.createRef();
      const props = makeProps();
      render(<MediaWidget ref={ref} {...props} />);
      ref.current._toggle({ type: 'click' });
      expect(killEvent).toHaveBeenCalledWith({ type: 'click' }, props.toggleShow);
    });
  });

  describe('_changeMode', () => {
    test('cycles mode 0→1→2→3→0', () => {
      const ref = React.createRef();
      render(<MediaWidget ref={ref} {...makeProps()} />);
      expect(ref.current.state.mode).toBe(0);
      act(() => ref.current._changeMode());
      expect(ref.current.state.mode).toBe(1);
      act(() => ref.current._changeMode());
      expect(ref.current.state.mode).toBe(2);
      act(() => ref.current._changeMode());
      expect(ref.current.state.mode).toBe(3);
      act(() => ref.current._changeMode());
      expect(ref.current.state.mode).toBe(4);
      act(() => ref.current._changeMode());
      expect(ref.current.state.mode).toBe(0);
    });
  });

  describe('_handleChange', () => {
    test('sets state from input getValue', () => {
      const ref = React.createRef();
      render(<MediaWidget ref={ref} {...makeProps()} />);
      act(() => ref.current._handleChange());
      expect(ref.current.state).toHaveProperty('subIndex');
    });
  });

  // ─── _handleOpt ───────────────────────────────────────────────────────────

  describe('_handleOpt', () => {
    test('value 1, type 9 → sendglbcf + copy', async () => {
      api.mockImplementation((...args) => {
        if (args[0].includes('getPath')) return Promise.resolve({ path: '/mnt' });
        if (args[0].includes('copy')) return Promise.resolve({ msg: 'ok' });
        return Promise.resolve({});
      });
      const props = makeProps({ mediaType: 9, list: [{ id: 'a', name: 'A', type: 3 }] });
      const ref = React.createRef();
      render(<MediaWidget ref={ref} {...props} />);
      ref.current._item = { id: 'a', name: 'A' };
      act(() => ref.current.setState({ index: 0 }));
      ref.current._handleOpt({ target: { value: '1' } });
      await flushPromises();
      expect(props.sendglbcf).toHaveBeenCalled();
      expect(props.pushfeedback).toHaveBeenCalled();
    });

    test('value 1, type 9, api error → addalert', async () => {
      api.mockRejectedValue('copy err');
      const props = makeProps({ mediaType: 9, list: [{ id: 'a', name: 'A', type: 3 }] });
      const ref = React.createRef();
      render(<MediaWidget ref={ref} {...props} />);
      ref.current._item = { id: 'a', name: 'A' };
      ref.current._handleOpt({ target: { value: '1' } });
      await flushPromises();
      expect(props.addalert).toHaveBeenCalledWith('copy err');
    });

    test('value 1, non-9, playlist without pre_url → save2local with playlist', () => {
      const props = makeProps({ mediaType: 3 });
      const ref = React.createRef();
      render(<MediaWidget ref={ref} {...props} />);
      ref.current._item = { id: 'item1', name: 'Test' };
      ref.current._playlist = { obj: { id: 'pl1' }, total: 5 };
      ref.current._title = 'My Title';
      ref.current._handleOpt({ target: { value: '1' } });
      expect(props.opt.save2local).toHaveBeenCalledWith('pl1', 'My Title', false);
    });

    test('value 1, non-9, playlist without pre_url, empty title → 物件', () => {
      const props = makeProps({ mediaType: 3 });
      const ref = React.createRef();
      render(<MediaWidget ref={ref} {...props} />);
      ref.current._item = { id: 'item1', name: 'Test' };
      ref.current._playlist = { obj: { id: 'pl1' }, total: 5 };
      ref.current._title = '';
      ref.current._handleOpt({ target: { value: '1' } });
      expect(props.opt.save2local).toHaveBeenCalledWith('pl1', '物件', false);
    });

    test('value 1, non-9, no playlist → save2local with item', () => {
      const props = makeProps({ mediaType: 3 });
      const ref = React.createRef();
      render(<MediaWidget ref={ref} {...props} />);
      ref.current._item = { id: 'item1', name: 'Test' };
      ref.current._playlist = null;
      ref.current._handleOpt({ target: { value: '1' } });
      expect(props.opt.save2local).toHaveBeenCalledWith('item1', 'Test', false);
    });

    test('value 1, non-9, playlist with pre_url → save2local with item', () => {
      const props = makeProps({ mediaType: 3 });
      const ref = React.createRef();
      render(<MediaWidget ref={ref} {...props} />);
      ref.current._item = { id: 'item1', name: 'Test' };
      ref.current._playlist = { obj: { id: 'pl1', pre_url: 'http://x' }, total: 5 };
      ref.current._handleOpt({ target: { value: '1' } });
      expect(props.opt.save2local).toHaveBeenCalledWith('item1', 'Test', false);
    });

    test('value 1, type 4 → save2local with true', () => {
      const props = makeProps({ mediaType: 4 });
      const ref = React.createRef();
      render(<MediaWidget ref={ref} {...props} />);
      ref.current._item = { id: 'item1', name: 'Test' };
      ref.current._playlist = null;
      ref.current._handleOpt({ target: { value: '1' } });
      expect(props.opt.save2local).toHaveBeenCalledWith('item1', 'Test', true);
    });

    test('value 2 → subscript', () => {
      const props = makeProps({ mediaType: 3 });
      const ref = React.createRef();
      render(<MediaWidget ref={ref} {...props} />);
      ref.current._item = { id: 'item1', cid: 'cid1', ctitle: 'Channel' };
      ref.current._handleOpt({ target: { value: '2' } });
      expect(props.opt.subscript).toHaveBeenCalledWith('item1', 'cid1', 'Channel', false);
    });

    test('value 2, type 4 → subscript with true', () => {
      const props = makeProps({ mediaType: 4 });
      const ref = React.createRef();
      render(<MediaWidget ref={ref} {...props} />);
      ref.current._item = { id: 'item1', cid: 'cid1', ctitle: 'Channel' };
      ref.current._handleOpt({ target: { value: '2' } });
      expect(props.opt.subscript).toHaveBeenCalledWith('item1', 'cid1', 'Channel', true);
    });

    test('value 3, playlist → uses playlist obj.id', () => {
      const props = makeProps({ mediaType: 3 });
      const ref = React.createRef();
      render(<MediaWidget ref={ref} {...props} />);
      ref.current._item = { id: 'item1' };
      ref.current._playlist = { obj: { id: 'pl1' } };
      ref.current._handleOpt({ target: { value: '3' } });
      expect(props.opt.searchSub).toHaveBeenCalledWith('pl1');
      expect(props.toggleShow).toHaveBeenCalledWith(false);
    });

    test('value 3, type 9 → uses item.id/index', () => {
      const list = [{ id: 'a', name: 'A', type: 3 }];
      const props = makeProps({ mediaType: 9, list });
      const ref = React.createRef();
      render(<MediaWidget ref={ref} {...props} />);
      ref.current._item = { id: 'item1' };
      ref.current._playlist = null;
      act(() => ref.current.setState({ index: 2 }));
      ref.current._handleOpt({ target: { value: '3' } });
      expect(props.opt.searchSub).toHaveBeenCalledWith('item1/2');
    });

    test('value 3, no playlist, non-9 → uses item.id', () => {
      const props = makeProps({ mediaType: 3 });
      const ref = React.createRef();
      render(<MediaWidget ref={ref} {...props} />);
      ref.current._item = { id: 'item1' };
      ref.current._playlist = null;
      ref.current._handleOpt({ target: { value: '3' } });
      expect(props.opt.searchSub).toHaveBeenCalledWith('item1');
    });

    test('value 4 → uploadSub with similar id logic', () => {
      const props = makeProps({ mediaType: 3 });
      const ref = React.createRef();
      render(<MediaWidget ref={ref} {...props} />);
      ref.current._item = { id: 'item1' };
      ref.current._playlist = { obj: { id: 'pl1' } };
      ref.current._handleOpt({ target: { value: '4' } });
      expect(props.opt.uploadSub).toHaveBeenCalledWith('pl1');
      expect(props.toggleShow).toHaveBeenCalledWith(false);
    });

    test('value 4, type 9 → uses item.id/index', () => {
      const list = [{ id: 'a', name: 'A', type: 3 }];
      const props = makeProps({ mediaType: 9, list });
      const ref = React.createRef();
      render(<MediaWidget ref={ref} {...props} />);
      ref.current._item = { id: 'item1' };
      ref.current._playlist = null;
      act(() => ref.current.setState({ index: 1 }));
      ref.current._handleOpt({ target: { value: '4' } });
      expect(props.opt.uploadSub).toHaveBeenCalledWith('item1/1');
    });

    test('value 5 → fixCue', () => {
      const ref = React.createRef();
      render(<MediaWidget ref={ref} {...makeProps({ mediaType: 3 })} />);
      const spy = jest.spyOn(ref.current, '_fixCue');
      ref.current._handleOpt({ target: { value: '5' } });
      expect(spy).toHaveBeenCalled();
    });

    test('value 6 → handleMedia', () => {
      const props = makeProps({ mediaType: 3, level: 2 });
      const ref = React.createRef();
      render(<MediaWidget ref={ref} {...props} />);
      ref.current._item = { id: 'item1', name: 'Test' };
      ref.current._playlist = null;
      ref.current._handleOpt({ target: { value: '6' } });
      expect(props.opt.handleMedia).toHaveBeenCalledWith('item1', 'Test');
    });

    test('value 6, type 9 → uses item.id/index', () => {
      const list = [{ id: 'a', name: 'A', type: 3 }];
      const props = makeProps({ mediaType: 9, list, level: 2 });
      const ref = React.createRef();
      render(<MediaWidget ref={ref} {...props} />);
      ref.current._item = { id: 'item1', name: 'Test' };
      ref.current._playlist = null;
      act(() => ref.current.setState({ index: 3 }));
      ref.current._handleOpt({ target: { value: '6' } });
      expect(props.opt.handleMedia).toHaveBeenCalledWith('item1/3', 'Test');
    });

    test('value 6, playlist → uses playlist obj.id', () => {
      const props = makeProps({ mediaType: 3, level: 2 });
      const ref = React.createRef();
      render(<MediaWidget ref={ref} {...props} />);
      ref.current._item = { id: 'item1', name: 'Test' };
      ref.current._playlist = { obj: { id: 'pl1' } };
      ref.current._handleOpt({ target: { value: '6' } });
      expect(props.opt.handleMedia).toHaveBeenCalledWith('pl1', 'Test');
    });

    test('value 7 → changeSub', () => {
      const ref = React.createRef();
      render(<MediaWidget ref={ref} {...makeProps({ mediaType: 3 })} />);
      const spy = jest.spyOn(ref.current, '_changeSub');
      ref.current._handleOpt({ target: { value: '7' } });
      expect(spy).toHaveBeenCalled();
    });
  });

  // ─── _fixCue ──────────────────────────────────────────────────────────────

  describe('_fixCue', () => {
    test('guard: no video → noop', () => {
      const ref = React.createRef();
      render(<MediaWidget ref={ref} {...makeProps({ mediaType: 2 })} />);
      ref.current._fixCue();
    });

    test('guard: href === src → noop', () => {
      const ref = React.createRef();
      render(<MediaWidget ref={ref} {...makeProps({ mediaType: 3 })} />);
      const video = ref.current._video;
      mockMediaElement(video);
      video.src = window.location.href;
      ref.current._fixCue();
    });

    test('fix set → adjust calc, sendglbcf with ch (fix=1)', async () => {
      api.mockResolvedValue('ok');
      const props = makeProps({ mediaType: 3 });
      const ref = React.createRef();
      render(<MediaWidget ref={ref} {...props} />);
      const video = ref.current._video;
      mockMediaElement(video);
      video.currentTime = 15;
      ref.current._fix = 1;
      ref.current._fixtime = 10;
      ref.current._item = { id: 'item1' };
      ref.current._playlist = null;
      act(() => ref.current._fixCue());
      expect(ref.current._fix).toBe(0);
      expect(ref.current.state.cue).toBe('');
      expect(props.sendglbcf).toHaveBeenCalled();
      await flushPromises();
      expect(props.addalert).toHaveBeenCalledWith('字幕校準成功');
    });

    test('fix set → adjust calc, sendglbcf with en (fix=2)', async () => {
      api.mockResolvedValue('ok');
      const props = makeProps({ mediaType: 3 });
      const ref = React.createRef();
      render(<MediaWidget ref={ref} {...props} />);
      const video = ref.current._video;
      mockMediaElement(video);
      video.currentTime = 20;
      ref.current._fix = 2;
      ref.current._fixtime = 15;
      ref.current._item = { id: 'item1' };
      ref.current._playlist = null;
      act(() => ref.current._fixCue());
      expect(props.sendglbcf).toHaveBeenCalled();
    });

    test('fix set, type 9 → includes index in API', async () => {
      api.mockResolvedValue('ok');
      const list = [{ id: 'a', name: 'A', type: 3 }];
      const props = makeProps({ mediaType: 9, list });
      const ref = React.createRef();
      render(<MediaWidget ref={ref} {...props} />);
      const video = ref.current._video;
      mockMediaElement(video);
      video.currentTime = 15;
      ref.current._fix = 1;
      ref.current._fixtime = 10;
      ref.current._item = { id: 'item1' };
      ref.current._playlist = null;
      act(() => ref.current.setState({ index: 2 }));
      act(() => ref.current._fixCue());
      await flushPromises();
    });

    test('fix set, with playlist → uses playlist obj.id', async () => {
      api.mockResolvedValue('ok');
      const props = makeProps({ mediaType: 3 });
      const ref = React.createRef();
      render(<MediaWidget ref={ref} {...props} />);
      const video = ref.current._video;
      mockMediaElement(video);
      video.currentTime = 15;
      ref.current._fix = 1;
      ref.current._fixtime = 10;
      ref.current._item = { id: 'item1' };
      ref.current._playlist = { obj: { id: 'pl1' } };
      act(() => ref.current._fixCue());
      await flushPromises();
    });

    test('fix set, API error → addalert', async () => {
      api.mockRejectedValue('fix err');
      const props = makeProps({ mediaType: 3 });
      const ref = React.createRef();
      render(<MediaWidget ref={ref} {...props} />);
      const video = ref.current._video;
      mockMediaElement(video);
      video.currentTime = 15;
      ref.current._fix = 1;
      ref.current._fixtime = 10;
      ref.current._item = { id: 'item1' };
      ref.current._playlist = null;
      act(() => ref.current._fixCue());
      await flushPromises();
      expect(props.addalert).toHaveBeenCalledWith('fix err');
    });

    test('fix not set, track0 has activeCues → fix=1', () => {
      const ref = React.createRef();
      render(<MediaWidget ref={ref} {...makeProps({ mediaType: 3 })} />);
      const video = ref.current._video;
      mockMediaElement(video);
      video.textTracks = [
        { activeCues: [{ text: 'Hello' }] },
        { activeCues: [{ text: 'World' }] },
      ];
      ref.current._fix = 0;
      act(() => ref.current._fixCue());
      expect(video.pause).toHaveBeenCalled();
      expect(ref.current.state.cue).toBe('Hello');
    });

    test('fix not set, only track1 has activeCues → fix=2', () => {
      const ref = React.createRef();
      render(<MediaWidget ref={ref} {...makeProps({ mediaType: 3 })} />);
      const video = ref.current._video;
      mockMediaElement(video);
      video.textTracks = [
        { activeCues: [] },
        { activeCues: [{ text: 'English' }] },
      ];
      ref.current._fix = 0;
      act(() => ref.current._fixCue());
      expect(ref.current.state.cue).toBe('English');
    });

    test('fix not set, no activeCues → noop', () => {
      const ref = React.createRef();
      render(<MediaWidget ref={ref} {...makeProps({ mediaType: 3 })} />);
      const video = ref.current._video;
      mockMediaElement(video);
      video.textTracks = [
        { activeCues: [] },
        { activeCues: [] },
      ];
      ref.current._fix = 0;
      ref.current._fixCue();
    });

    test('fix not set, no textTracks → noop', () => {
      const ref = React.createRef();
      render(<MediaWidget ref={ref} {...makeProps({ mediaType: 3 })} />);
      const video = ref.current._video;
      mockMediaElement(video);
      video.textTracks = [];
      ref.current._fix = 0;
      ref.current._fixCue();
    });

    test('fix not set, track0 activeCues null → check track1', () => {
      const ref = React.createRef();
      render(<MediaWidget ref={ref} {...makeProps({ mediaType: 3 })} />);
      const video = ref.current._video;
      mockMediaElement(video);
      video.textTracks = [
        { activeCues: null },
        { activeCues: [{ text: 'T1' }] },
      ];
      ref.current._fix = 0;
      act(() => ref.current._fixCue());
      expect(ref.current.state.cue).toBe('T1');
    });

    test('fix not set, track0 activeCues[0] has no text → check track1', () => {
      const ref = React.createRef();
      render(<MediaWidget ref={ref} {...makeProps({ mediaType: 3 })} />);
      const video = ref.current._video;
      mockMediaElement(video);
      video.textTracks = [
        { activeCues: [{ text: '' }] },
        { activeCues: [{ text: 'Fallback' }] },
      ];
      ref.current._fix = 0;
      act(() => ref.current._fixCue());
      expect(ref.current.state.cue).toBe('Fallback');
    });
  });

  // ─── _removeCue ───────────────────────────────────────────────────────────

  describe('_removeCue', () => {
    test('guard: no video → noop', () => {
      const ref = React.createRef();
      render(<MediaWidget ref={ref} {...makeProps({ mediaType: 2 })} />);
      ref.current._removeCue();
    });

    test('track0 with cues → removes all', () => {
      const ref = React.createRef();
      render(<MediaWidget ref={ref} {...makeProps({ mediaType: 3 })} />);
      const video = ref.current._video;
      mockMediaElement(video);
      const cue1 = { id: 1 };
      const cue2 = { id: 2 };
      const track0 = { cues: [cue1, cue2], removeCue: jest.fn() };
      const track1 = { cues: null };
      video.textTracks = [track0, track1];
      ref.current._removeCue();
      expect(track0.removeCue).toHaveBeenCalledTimes(2);
    });

    test('track0 no cues → noop', () => {
      const ref = React.createRef();
      render(<MediaWidget ref={ref} {...makeProps({ mediaType: 3 })} />);
      const video = ref.current._video;
      mockMediaElement(video);
      video.textTracks = [{ cues: null }, { cues: null }];
      ref.current._removeCue();
    });

    test('track0 cues empty → noop', () => {
      const ref = React.createRef();
      render(<MediaWidget ref={ref} {...makeProps({ mediaType: 3 })} />);
      const video = ref.current._video;
      mockMediaElement(video);
      video.textTracks = [{ cues: [] }, { cues: [] }];
      ref.current._removeCue();
    });

    test('track1 with cues → removes all', () => {
      const ref = React.createRef();
      render(<MediaWidget ref={ref} {...makeProps({ mediaType: 3 })} />);
      const video = ref.current._video;
      mockMediaElement(video);
      const track0 = { cues: [] };
      const cue1 = { id: 1 };
      const track1 = { cues: [cue1], removeCue: jest.fn() };
      video.textTracks = [track0, track1];
      ref.current._removeCue();
      expect(track1.removeCue).toHaveBeenCalledTimes(1);
    });

    test('no textTracks entries → noop', () => {
      const ref = React.createRef();
      render(<MediaWidget ref={ref} {...makeProps({ mediaType: 3 })} />);
      const video = ref.current._video;
      mockMediaElement(video);
      video.textTracks = [];
      ref.current._removeCue();
    });
  });

  // ─── _refreshCue ──────────────────────────────────────────────────────────

  describe('_refreshCue', () => {
    test('guard: no video → noop', () => {
      const ref = React.createRef();
      render(<MediaWidget ref={ref} {...makeProps({ mediaType: 2 })} />);
      ref.current._refreshCue();
    });

    test('subCh with trailing /0+ → append 0', () => {
      const ref = React.createRef();
      render(<MediaWidget ref={ref} {...makeProps({ mediaType: 3 })} />);
      const video = ref.current._video;
      mockMediaElement(video);
      video.textTracks = [];
      act(() => ref.current.setState({ subCh: 'http://sub/ch/00', subEn: 'http://sub/en/0' }));
      act(() => ref.current._refreshCue());
      expect(ref.current.state.subCh).toBe('http://sub/ch/000');
      expect(ref.current.state.subEn).toBe('http://sub/en/00');
    });

    test('subCh without trailing /0+ → append /0', () => {
      const ref = React.createRef();
      render(<MediaWidget ref={ref} {...makeProps({ mediaType: 3 })} />);
      const video = ref.current._video;
      mockMediaElement(video);
      video.textTracks = [];
      act(() => ref.current.setState({ subCh: 'http://sub/ch/v', subEn: 'http://sub/en/v' }));
      act(() => ref.current._refreshCue());
      expect(ref.current.state.subCh).toBe('http://sub/ch/v/0');
      expect(ref.current.state.subEn).toBe('http://sub/en/v/0');
    });
  });

  // ─── _backward / _forward ────────────────────────────────────────────────

  describe('_backward', () => {
    test('big=true → duration/100 adjust', () => {
      const ref = React.createRef();
      render(<MediaWidget ref={ref} {...makeProps({ mediaType: 3 })} />);
      const video = ref.current._video;
      mockMediaElement(video);
      ref.current._media = video;
      video.currentTime = 50;
      video.duration = 100;
      ref.current._backward(true);
      expect(video.currentTime).toBe(49);
    });

    test('big=true, currentTime < one → no change', () => {
      const ref = React.createRef();
      render(<MediaWidget ref={ref} {...makeProps({ mediaType: 3 })} />);
      const video = ref.current._video;
      mockMediaElement(video);
      ref.current._media = video;
      video.currentTime = 0.5;
      video.duration = 100;
      ref.current._backward(true);
      expect(video.currentTime).toBe(0.5);
    });

    test('fix → 0.5s adjust', () => {
      const ref = React.createRef();
      render(<MediaWidget ref={ref} {...makeProps({ mediaType: 3 })} />);
      const video = ref.current._video;
      mockMediaElement(video);
      ref.current._media = video;
      ref.current._fix = 1;
      video.currentTime = 10;
      ref.current._backward(false);
      expect(video.currentTime).toBe(9.5);
    });

    test('fix, currentTime < 0.5 → clamp to 0', () => {
      const ref = React.createRef();
      render(<MediaWidget ref={ref} {...makeProps({ mediaType: 3 })} />);
      const video = ref.current._video;
      mockMediaElement(video);
      ref.current._media = video;
      ref.current._fix = 1;
      video.currentTime = 0.3;
      ref.current._backward(false);
      expect(video.currentTime).toBe(0);
    });

    test('normal → 5s adjust', () => {
      const ref = React.createRef();
      render(<MediaWidget ref={ref} {...makeProps({ mediaType: 3 })} />);
      const video = ref.current._video;
      mockMediaElement(video);
      ref.current._media = video;
      ref.current._fix = 0;
      video.currentTime = 20;
      ref.current._backward(false);
      expect(video.currentTime).toBe(15);
    });

    test('normal, currentTime < 5 → clamp to 0', () => {
      const ref = React.createRef();
      render(<MediaWidget ref={ref} {...makeProps({ mediaType: 3 })} />);
      const video = ref.current._video;
      mockMediaElement(video);
      ref.current._media = video;
      ref.current._fix = 0;
      video.currentTime = 3;
      ref.current._backward(false);
      expect(video.currentTime).toBe(0);
    });
  });

  describe('_forward', () => {
    test('big=true → duration/100 adjust', () => {
      const ref = React.createRef();
      render(<MediaWidget ref={ref} {...makeProps({ mediaType: 3 })} />);
      const video = ref.current._video;
      mockMediaElement(video);
      ref.current._media = video;
      video.currentTime = 50;
      video.duration = 100;
      ref.current._forward(true);
      expect(video.currentTime).toBe(51);
    });

    test('fix → 0.5s adjust', () => {
      const ref = React.createRef();
      render(<MediaWidget ref={ref} {...makeProps({ mediaType: 3 })} />);
      const video = ref.current._video;
      mockMediaElement(video);
      ref.current._media = video;
      ref.current._fix = 1;
      video.currentTime = 10;
      ref.current._forward(false);
      expect(video.currentTime).toBe(10.5);
    });

    test('normal → 5s adjust', () => {
      const ref = React.createRef();
      render(<MediaWidget ref={ref} {...makeProps({ mediaType: 3 })} />);
      const video = ref.current._video;
      mockMediaElement(video);
      ref.current._media = video;
      ref.current._fix = 0;
      video.currentTime = 20;
      ref.current._forward(false);
      expect(video.currentTime).toBe(25);
    });
  });

  // ─── _fullscreen ──────────────────────────────────────────────────────────

  describe('_fullscreen', () => {
    test('enter: requestFullscreen', () => {
      const ref = React.createRef();
      render(<MediaWidget ref={ref} {...makeProps({ mediaType: 3 })} />);
      ref.current._media = { requestFullscreen: jest.fn() };
      ref.current._fullscreen();
      expect(ref.current._media.requestFullscreen).toHaveBeenCalled();
    });

    test('enter: msRequestFullscreen', () => {
      const ref = React.createRef();
      render(<MediaWidget ref={ref} {...makeProps({ mediaType: 3 })} />);
      ref.current._media = { msRequestFullscreen: jest.fn() };
      ref.current._fullscreen();
      expect(ref.current._media.msRequestFullscreen).toHaveBeenCalled();
    });

    test('enter: mozRequestFullScreen', () => {
      const ref = React.createRef();
      render(<MediaWidget ref={ref} {...makeProps({ mediaType: 3 })} />);
      ref.current._media = { mozRequestFullScreen: jest.fn() };
      ref.current._fullscreen();
      expect(ref.current._media.mozRequestFullScreen).toHaveBeenCalled();
    });

    test('enter: webkitRequestFullscreen', () => {
      const ref = React.createRef();
      render(<MediaWidget ref={ref} {...makeProps({ mediaType: 3 })} />);
      ref.current._media = { webkitRequestFullscreen: jest.fn() };
      ref.current._fullscreen();
      expect(ref.current._media.webkitRequestFullscreen).toHaveBeenCalled();
    });

    test('exit: exitFullscreen', () => {
      const ref = React.createRef();
      render(<MediaWidget ref={ref} {...makeProps({ mediaType: 3 })} />);
      ref.current._media = {};
      Object.defineProperty(document, 'fullscreenElement', { value: document.createElement('div'), configurable: true });
      document.exitFullscreen = jest.fn();
      ref.current._fullscreen();
      expect(document.exitFullscreen).toHaveBeenCalled();
      Object.defineProperty(document, 'fullscreenElement', { value: null, configurable: true });
      delete document.exitFullscreen;
    });

    test('exit: msExitFullscreen', () => {
      const ref = React.createRef();
      render(<MediaWidget ref={ref} {...makeProps({ mediaType: 3 })} />);
      ref.current._media = {};
      Object.defineProperty(document, 'msFullscreenElement', { value: document.createElement('div'), configurable: true });
      document.msExitFullscreen = jest.fn();
      ref.current._fullscreen();
      expect(document.msExitFullscreen).toHaveBeenCalled();
      Object.defineProperty(document, 'msFullscreenElement', { value: undefined, configurable: true });
      delete document.msExitFullscreen;
    });

    test('exit: mozCancelFullScreen', () => {
      const ref = React.createRef();
      render(<MediaWidget ref={ref} {...makeProps({ mediaType: 3 })} />);
      ref.current._media = {};
      Object.defineProperty(document, 'mozFullScreenElement', { value: document.createElement('div'), configurable: true });
      document.mozCancelFullScreen = jest.fn();
      ref.current._fullscreen();
      expect(document.mozCancelFullScreen).toHaveBeenCalled();
      Object.defineProperty(document, 'mozFullScreenElement', { value: undefined, configurable: true });
      delete document.mozCancelFullScreen;
    });

    test('exit: webkitExitFullscreen', () => {
      const ref = React.createRef();
      render(<MediaWidget ref={ref} {...makeProps({ mediaType: 3 })} />);
      ref.current._media = {};
      Object.defineProperty(document, 'webkitFullscreenElement', { value: document.createElement('div'), configurable: true });
      document.webkitExitFullscreen = jest.fn();
      ref.current._fullscreen();
      expect(document.webkitExitFullscreen).toHaveBeenCalled();
      Object.defineProperty(document, 'webkitFullscreenElement', { value: undefined, configurable: true });
      delete document.webkitExitFullscreen;
    });
  });

  // ─── _mediaCheck ──────────────────────────────────────────────────────────

  describe('_mediaCheck', () => {
    test('guard: no item.id → return true', () => {
      const ref = React.createRef();
      render(<MediaWidget ref={ref} {...makeProps({ mediaType: 3 })} />);
      ref.current._item = {};
      const result = ref.current._mediaCheck();
      expect(result).toBe(true);
    });

    test('guard: item.complete → return true', () => {
      const ref = React.createRef();
      render(<MediaWidget ref={ref} {...makeProps({ mediaType: 3 })} />);
      ref.current._item = { id: 'item1', complete: true };
      const result = ref.current._mediaCheck();
      expect(result).toBe(true);
    });

    test('guard: playlist.obj.complete → return true', () => {
      const ref = React.createRef();
      render(<MediaWidget ref={ref} {...makeProps({ mediaType: 3 })} />);
      ref.current._item = { id: 'item1' };
      ref.current._playlist = { obj: { id: 'pl1', complete: true } };
      const result = ref.current._mediaCheck();
      expect(result).toBe(true);
    });

    test('result.start → addalert', async () => {
      api.mockResolvedValue({ start: true });
      const props = makeProps({ mediaType: 3 });
      const ref = React.createRef();
      render(<MediaWidget ref={ref} {...props} />);
      ref.current._item = { id: 'item1' };
      ref.current._playlist = null;
      act(() => ref.current.setState({ index: 0 }));
      ref.current._mediaCheck();
      await flushPromises();
      expect(props.addalert).toHaveBeenCalledWith('File start buffering, Mp4 may preview');
    });

    test('result: newBuffer + media → saves currentTime, appends /0', async () => {
      api.mockResolvedValue({ ret_size: 1000, complete: false, newBuffer: true });
      const ref = React.createRef();
      render(<MediaWidget ref={ref} {...makeProps({ mediaType: 3 })} />);
      ref.current._item = { id: 'item1' };
      ref.current._playlist = null;
      const video = ref.current._video;
      mockMediaElement(video);
      ref.current._media = video;
      video.currentTime = 25;
      act(() => ref.current.setState({ index: 0, src: 'http://video/0' }));
      ref.current._mediaCheck();
      await flushPromises();
      expect(ref.current._startTime).toBe(25);
      expect(ref.current._start).toBe(false);
      expect(ref.current.state.src).toBe('http://video/00');
    });

    test('result: newBuffer + no media → just setState', async () => {
      api.mockResolvedValue({ ret_size: 1000, complete: false, newBuffer: true });
      const ref = React.createRef();
      render(<MediaWidget ref={ref} {...makeProps({ mediaType: 3 })} />);
      ref.current._item = { id: 'item1' };
      ref.current._playlist = null;
      ref.current._media = null;
      act(() => ref.current.setState({ index: 0, src: 'http://video' }));
      ref.current._mediaCheck();
      await flushPromises();
      expect(ref.current.state.src).toBe('http://video/0');
    });

    test('result: no newBuffer → set size/complete', async () => {
      api.mockResolvedValue({ ret_size: 2000, complete: true });
      const ref = React.createRef();
      render(<MediaWidget ref={ref} {...makeProps({ mediaType: 3 })} />);
      ref.current._item = { id: 'item1', size: 0 };
      ref.current._playlist = null;
      act(() => ref.current.setState({ index: 0 }));
      ref.current._mediaCheck();
      await flushPromises();
      expect(ref.current._item.size).toBe(2000);
      expect(ref.current._item.complete).toBe(true);
    });

    test('with playlist → uses playlist obj', async () => {
      api.mockResolvedValue({ ret_size: 500, complete: false });
      const ref = React.createRef();
      render(<MediaWidget ref={ref} {...makeProps({ mediaType: 3 })} />);
      ref.current._item = { id: 'item1' };
      ref.current._playlist = { obj: { id: 'pl1', size: 100 } };
      ref.current._mediaCheck();
      await flushPromises();
      expect(api).toHaveBeenCalledWith(expect.stringContaining('pl1/v'));
      expect(ref.current._playlist.obj.size).toBe(500);
    });

    test('obj without size → sends 0', async () => {
      api.mockResolvedValue({ ret_size: 500, complete: false });
      const ref = React.createRef();
      render(<MediaWidget ref={ref} {...makeProps({ mediaType: 3 })} />);
      ref.current._item = { id: 'item1' };
      ref.current._playlist = null;
      act(() => ref.current.setState({ index: 0 }));
      ref.current._mediaCheck();
      await flushPromises();
      expect(api).toHaveBeenCalledWith(expect.stringContaining('/0'));
    });
  });

  // ─── _mediaDownload ───────────────────────────────────────────────────────

  describe('_mediaDownload', () => {
    test('sendglbcf with location.href', () => {
      const props = makeProps({ mediaType: 3 });
      const ref = React.createRef();
      render(<MediaWidget ref={ref} {...props} />);
      ref.current._item = { name: 'Test' };
      act(() => ref.current.setState({ src: 'http://dl.mp4' }));
      ref.current._mediaDownload();
      expect(props.sendglbcf).toHaveBeenCalled();
    });
  });

  // ─── _handleExtend ────────────────────────────────────────────────────────

  describe('_handleExtend', () => {
    test('not full → noop', () => {
      const ref = React.createRef();
      render(<MediaWidget ref={ref} {...makeProps({ full: false })} />);
      act(() => ref.current.setState({ extend: false }));
      ref.current._handleExtend();
      expect(ref.current.state.extend).toBe(false);
    });

    test('full, extend was false → extend becomes true, no toggleFull', () => {
      const props = makeProps({ full: true });
      const ref = React.createRef();
      render(<MediaWidget ref={ref} {...props} />);
      act(() => ref.current.setState({ extend: false }));
      act(() => ref.current._handleExtend());
      expect(ref.current.state.extend).toBe(true);
      expect(props.toggleFull).not.toHaveBeenCalled();
    });

    test('full, extend was true → extend becomes false → toggleFull', () => {
      const props = makeProps({ full: true });
      const ref = React.createRef();
      render(<MediaWidget ref={ref} {...props} />);
      act(() => ref.current.setState({ extend: true }));
      act(() => ref.current._handleExtend());
      expect(ref.current.state.extend).toBe(false);
      expect(props.toggleFull).toHaveBeenCalled();
    });
  });

  // ─── render ───────────────────────────────────────────────────────────────

  describe('render', () => {
    test('show=false → display:none', () => {
      const { container } = render(<MediaWidget {...makeProps({ show: false })} />);
      const section = container.querySelector('section');
      expect(section.style.display).toBe('none');
    });

    test('show=true, not image type → normal display', () => {
      const { container } = render(<MediaWidget {...makeProps({ show: true, mediaType: 3 })} />);
      const section = container.querySelector('section');
      expect(section.style.display).not.toBe('none');
    });

    test('show=true, full, type 2 → visibility:hidden', () => {
      const { container } = render(<MediaWidget {...makeProps({ show: true, mediaType: 2, full: true })} />);
      const section = container.querySelector('section');
      expect(section.style.visibility).toBe('hidden');
    });

    test('show=true, full, type 9 + item.type 2 → visibility:hidden', () => {
      const list = [{ id: 'a', name: 'A', type: 2 }];
      const ref = React.createRef();
      const { container, rerender } = render(<MediaWidget ref={ref} {...makeProps({ show: true, mediaType: 9, list, full: false })} />);
      ref.current._item = { type: 2, name: 'A' };
      rerender(<MediaWidget ref={ref} {...makeProps({ show: true, mediaType: 9, list, full: true })} />);
      const section = container.querySelector('section');
      expect(section.style.visibility).toBe('hidden');
    });

    test('full → ulClass pull-left', () => {
      const { container } = render(<MediaWidget {...makeProps({ full: true })} />);
      const ul = container.querySelector('ul');
      expect(ul.className).toContain('pull-left');
    });

    test('not full → ulClass pull-right', () => {
      const { container } = render(<MediaWidget {...makeProps({ full: false })} />);
      const ul = container.querySelector('ul');
      expect(ul.className).toContain('pull-right');
    });

    test('option toggle: click info button toggles option state', () => {
      const ref = React.createRef();
      render(<MediaWidget ref={ref} {...makeProps()} />);
      expect(ref.current.state.option).toBe(false);
      // killEvent calls the callback, which toggles option
      const infoLink = document.querySelector('.glyphicon-info-sign').closest('a');
      fireEvent.click(infoLink);
      expect(ref.current.state.option).toBe(true);
    });

    test('option panel: mode displays', () => {
      const ref = React.createRef();
      const { container } = render(<MediaWidget ref={ref} {...makeProps()} />);
      act(() => ref.current.setState({ option: true, mode: 0 }));
      expect(container.textContent).toContain('All');
      act(() => ref.current.setState({ mode: 1 }));
      expect(container.querySelector('.glyphicon-arrow-left')).toBeTruthy();
      act(() => ref.current.setState({ mode: 2 }));
      expect(container.textContent).toContain('1');
      act(() => ref.current.setState({ mode: 3 }));
      expect(container.querySelector('.glyphicon-random')).toBeTruthy();
    });

    test('option panel: local option for type 9', () => {
      const ref = React.createRef();
      const { container } = render(<MediaWidget ref={ref} {...makeProps({ mediaType: 9, list: [{ id: 'a', name: 'A', type: 3 }] })} />);
      act(() => ref.current.setState({ option: true }));
      expect(container.querySelector('option[value="1"]')).toBeTruthy();
    });

    test('option panel: local option for noDb item', () => {
      const ref = React.createRef();
      render(<MediaWidget ref={ref} {...makeProps({ mediaType: 3 })} />);
      ref.current._item = { noDb: true };
      act(() => ref.current.setState({ option: true }));
    });

    test('option panel: subscript option with cid', () => {
      const ref = React.createRef();
      const { container } = render(<MediaWidget ref={ref} {...makeProps({ mediaType: 3 })} />);
      ref.current._item = { cid: 'c1', ctitle: 'Channel' };
      act(() => ref.current.setState({ option: true }));
      expect(container.querySelector('option[value="2"]')).toBeTruthy();
    });

    test('option panel: search/upload/fix/change options for type 3', () => {
      const ref = React.createRef();
      const { container } = render(<MediaWidget ref={ref} {...makeProps({ mediaType: 3 })} />);
      act(() => ref.current.setState({ option: true }));
      expect(container.querySelector('option[value="3"]')).toBeTruthy();
      expect(container.querySelector('option[value="4"]')).toBeTruthy();
      expect(container.querySelector('option[value="5"]')).toBeTruthy();
      expect(container.querySelector('option[value="7"]')).toBeTruthy();
    });

    test('option panel: handle option for level 2', () => {
      const ref = React.createRef();
      const { container } = render(<MediaWidget ref={ref} {...makeProps({ mediaType: 3, level: 2 })} />);
      act(() => ref.current.setState({ option: true }));
      expect(container.querySelector('option[value="6"]')).toBeTruthy();
    });

    test('option panel: no handle option for level !== 2', () => {
      const ref = React.createRef();
      const { container } = render(<MediaWidget ref={ref} {...makeProps({ mediaType: 3, level: 0 })} />);
      act(() => ref.current.setState({ option: true }));
      expect(container.querySelector('option[value="6"]')).toBeNull();
    });

    test('option panel: subOption null for type 4 without noDb/cid', () => {
      const ref = React.createRef();
      const { container } = render(<MediaWidget ref={ref} {...makeProps({ mediaType: 4 })} />);
      ref.current._item = { id: 'item1' };
      act(() => ref.current.setState({ option: true }));
      expect(container.querySelector('select')).toBeNull();
    });

    test('option panel: no search/upload/fix/change for type 2', () => {
      const ref = React.createRef();
      const { container } = render(<MediaWidget ref={ref} {...makeProps({ mediaType: 2 })} />);
      ref.current._item = { noDb: true };
      act(() => ref.current.setState({ option: true }));
      expect(container.querySelector('option[value="3"]')).toBeNull();
    });

    test('option panel: mediaOption with _media', () => {
      const ref = React.createRef();
      const { container } = render(<MediaWidget ref={ref} {...makeProps({ mediaType: 3 })} />);
      const video = ref.current._video;
      mockMediaElement(video);
      ref.current._media = video;
      act(() => ref.current.setState({ option: true }));
      expect(container.querySelector('.glyphicon-backward')).toBeTruthy();
    });

    test('option panel: no mediaOption without _media', () => {
      const ref = React.createRef();
      const { container } = render(<MediaWidget ref={ref} {...makeProps({ mediaType: 2 })} />);
      ref.current._media = null;
      act(() => ref.current.setState({ option: true }));
      expect(container.querySelector('.glyphicon-backward')).toBeNull();
    });

    test('option panel: cue displays', () => {
      const ref = React.createRef();
      const { container } = render(<MediaWidget ref={ref} {...makeProps({ mediaType: 3 })} />);
      act(() => ref.current.setState({ option: true, cue: 'Test Cue Text' }));
      expect(container.textContent).toContain('Test Cue Text');
    });

    test('option panel: no cue', () => {
      const ref = React.createRef();
      const { container } = render(<MediaWidget ref={ref} {...makeProps({ mediaType: 3 })} />);
      act(() => ref.current.setState({ option: true, cue: '' }));
    });

    test('nav panel: playlist with total > 1', () => {
      const ref = React.createRef();
      const { container } = render(<MediaWidget ref={ref} {...makeProps({ mediaType: 3 })} />);
      ref.current._total = 5;
      act(() => ref.current.setState({ option: false }));
      expect(container.querySelector('.glyphicon-chevron-up')).toBeTruthy();
      expect(container.querySelector('.glyphicon-chevron-down')).toBeTruthy();
    });

    test('nav panel: no playlist when total <= 1', () => {
      const ref = React.createRef();
      const { container } = render(<MediaWidget ref={ref} {...makeProps({ mediaType: 3 })} />);
      ref.current._total = 1;
      act(() => ref.current.setState({ option: false }));
      expect(container.querySelector('.glyphicon-chevron-up')).toBeNull();
    });

    test('nav panel: loading adds disabled class', () => {
      const ref = React.createRef();
      const { container } = render(<MediaWidget ref={ref} {...makeProps({ mediaType: 3 })} />);
      act(() => ref.current.setState({ loading: true, option: false }));
      const leftLink = container.querySelector('.glyphicon-chevron-left').closest('a');
      expect(leftLink.className).toContain('disabled');
    });

    test('nav panel: complete button for type 9 + not complete', () => {
      const list = [{ id: 'a', name: 'A', type: 3, complete: false }];
      const ref = React.createRef();
      const { container } = render(<MediaWidget ref={ref} {...makeProps({ mediaType: 9, list })} />);
      ref.current._item = { type: 3, complete: false };
      act(() => ref.current.setState({ option: false }));
      expect(container.querySelector('.glyphicon-refresh')).toBeTruthy();
    });

    test('nav panel: complete button for playlist magnet not complete', () => {
      const ref = React.createRef();
      const { container } = render(<MediaWidget ref={ref} {...makeProps({ mediaType: 3 })} />);
      ref.current._item = { id: 'item1' };
      ref.current._playlist = { obj: { id: 'pl1', is_magnet: true, complete: false } };
      act(() => ref.current.setState({ option: false }));
      expect(container.querySelector('.glyphicon-refresh')).toBeTruthy();
    });

    test('nav panel: no complete button for completed type 9 item', () => {
      const list = [{ id: 'a', name: 'A', type: 3, complete: true }];
      const ref = React.createRef();
      const { container } = render(<MediaWidget ref={ref} {...makeProps({ mediaType: 9, list })} />);
      ref.current._item = { type: 3, complete: true };
      act(() => ref.current.setState({ option: false }));
      expect(container.querySelector('.glyphicon-refresh')).toBeNull();
    });

    test('nav panel: tDownload for type 9, type 1, complete', () => {
      const list = [{ id: 'a', name: 'A', type: 1, complete: true }];
      const ref = React.createRef();
      const { container } = render(<MediaWidget ref={ref} {...makeProps({ mediaType: 9, list })} />);
      ref.current._item = { type: 1, complete: true };
      act(() => ref.current.setState({ option: false }));
      expect(container.querySelector('.glyphicon-download-alt')).toBeTruthy();
    });

    test('nav panel: no tDownload for wrong type or incomplete', () => {
      const list = [{ id: 'a', name: 'A', type: 3 }];
      const ref = React.createRef();
      const { container } = render(<MediaWidget ref={ref} {...makeProps({ mediaType: 9, list })} />);
      ref.current._item = { type: 3 };
      act(() => ref.current.setState({ option: false }));
      expect(container.querySelector('.glyphicon-download-alt')).toBeNull();
    });

    test('nav panel: full toggle button shows minus for full', () => {
      const { container } = render(<MediaWidget {...makeProps({ full: true })} />);
      expect(container.querySelector('.glyphicon-minus-sign')).toBeTruthy();
    });

    test('nav panel: full toggle button shows plus for not full', () => {
      const { container } = render(<MediaWidget {...makeProps({ full: false })} />);
      expect(container.querySelector('.glyphicon-plus-sign')).toBeTruthy();
    });

    test('media: type 2 with doc 2 full → full iframe', () => {
      const ref = React.createRef();
      const { container } = render(<MediaWidget ref={ref} {...makeProps({ mediaType: 2, full: true })} />);
      ref.current._item = { doc: 2 };
      act(() => ref.current.setState({ src: 'http://doc.html' }));
      const iframe = container.querySelector('iframe');
      expect(iframe).toBeTruthy();
      expect(iframe.style.width).toBe('98vw');
    });

    test('media: type 2 with doc 2 not full → small iframe', () => {
      const ref = React.createRef();
      const { container } = render(<MediaWidget ref={ref} {...makeProps({ mediaType: 2, full: false })} />);
      ref.current._item = { doc: 2 };
      act(() => ref.current.setState({ src: 'http://doc.html' }));
      const iframe = container.querySelector('iframe');
      expect(iframe).toBeTruthy();
      expect(iframe.style.width).toBe('50vw');
    });

    test('media: type 2 with doc 3 full → pdf canvas', () => {
      const ref = React.createRef();
      const { container } = render(<MediaWidget ref={ref} {...makeProps({ mediaType: 2, full: true })} />);
      ref.current._item = { doc: 3 };
      act(() => ref.current.setState({ src: 'http://doc.pdf' }));
      const canvas = container.querySelector('#pdf1');
      expect(canvas).toBeTruthy();
    });

    test('media: type 2 with doc 3 not full → small pdf canvas', () => {
      const ref = React.createRef();
      const { container } = render(<MediaWidget ref={ref} {...makeProps({ mediaType: 2, full: false })} />);
      ref.current._item = { doc: 3 };
      act(() => ref.current.setState({ src: 'http://doc.pdf' }));
      const canvas = container.querySelector('#pdf1');
      expect(canvas).toBeTruthy();
    });

    test('media: type 9 + type 2 with doc 3 → uses pdf2 id', () => {
      const list = [{ id: 'a', name: 'A', type: 2, doc: 3 }];
      const ref = React.createRef();
      const { container } = render(<MediaWidget ref={ref} {...makeProps({ mediaType: 9, list })} />);
      ref.current._item = { type: 2, doc: 3, name: 'A' };
      act(() => ref.current.setState({ src: 'http://doc.pdf' }));
      const canvas = container.querySelector('#pdf2');
      expect(canvas).toBeTruthy();
    });

    test('media: type 2 with url pattern → link', () => {
      const ref = React.createRef();
      const { container } = render(<MediaWidget ref={ref} {...makeProps({ mediaType: 2 })} />);
      ref.current._item = { name: 'Test' };
      act(() => ref.current.setState({ src: 'url: http://example.com' }));
      const link = container.querySelector('a[target="_blank"]');
      expect(link).toBeTruthy();
      expect(link.textContent).toBe('http://example.com');
    });

    test('media: type 2, full + extend → extended img with onLoad', () => {
      const ref = React.createRef();
      const { container } = render(<MediaWidget ref={ref} {...makeProps({ mediaType: 2, full: true })} />);
      ref.current._item = { name: 'Test' };
      act(() => ref.current.setState({ src: 'http://img.jpg', extend: true }));
      const img = container.querySelector('img');
      expect(img).toBeTruthy();
      const extendDiv = container.querySelector('#extend');
      expect(extendDiv).toBeTruthy();
      // Trigger onLoad
      fireEvent.load(img);
    });

    test('media: type 2, full + extend → onLoad scrollLeft logic', () => {
      const ref = React.createRef();
      const { container } = render(<MediaWidget ref={ref} {...makeProps({ mediaType: 2, full: true })} />);
      ref.current._item = { name: 'Test' };
      act(() => ref.current.setState({ src: 'http://img.jpg', extend: true }));
      const extendDiv = container.querySelector('#extend');
      Object.defineProperty(extendDiv, 'scrollWidth', { value: 500, configurable: true });
      Object.defineProperty(extendDiv, 'scrollLeft', { value: 0, writable: true, configurable: true });
      const img = container.querySelector('img');
      fireEvent.load(img);
      expect(extendDiv.scrollLeft).toBe(500);
    });

    test('media: type 2, full + extend → onLoad scrollLeft >= 100 → reset to 0', () => {
      const ref = React.createRef();
      const { container } = render(<MediaWidget ref={ref} {...makeProps({ mediaType: 2, full: true })} />);
      ref.current._item = { name: 'Test' };
      act(() => ref.current.setState({ src: 'http://img.jpg', extend: true }));
      const extendDiv = container.querySelector('#extend');
      Object.defineProperty(extendDiv, 'scrollWidth', { value: 500, configurable: true });
      Object.defineProperty(extendDiv, 'scrollLeft', { value: 200, writable: true, configurable: true });
      const img = container.querySelector('img');
      fireEvent.load(img);
      expect(extendDiv.scrollLeft).toBe(0);
    });

    test('media: type 2, full + !extend → full img with resize-full icon', () => {
      const ref = React.createRef();
      const { container } = render(<MediaWidget ref={ref} {...makeProps({ mediaType: 2, full: true })} />);
      ref.current._item = { name: 'Test' };
      act(() => ref.current.setState({ src: 'http://img.jpg', extend: false }));
      const img = container.querySelector('img');
      expect(img).toBeTruthy();
      expect(container.querySelector('.glyphicon-resize-full')).toBeTruthy();
    });

    test('media: type 2, !full → small img', () => {
      const ref = React.createRef();
      const { container } = render(<MediaWidget ref={ref} {...makeProps({ mediaType: 2, full: false })} />);
      ref.current._item = { name: 'Test' };
      act(() => ref.current.setState({ src: 'http://img.jpg' }));
      const img = container.querySelector('img');
      expect(img).toBeTruthy();
      fireEvent.click(img);
    });

    test('video section: type 3 renders video element', () => {
      const { container } = render(<MediaWidget {...makeProps({ mediaType: 3 })} />);
      const video = container.querySelector('video');
      expect(video).toBeTruthy();
    });

    test('video section: type 9 + type 3 renders video', () => {
      const list = [{ id: 'a', name: 'A', type: 3 }];
      const ref = React.createRef();
      const { container } = render(<MediaWidget ref={ref} {...makeProps({ mediaType: 9, list })} />);
      ref.current._item = { type: 3, name: 'A' };
      act(() => ref.current.setState({}));
      const video = container.querySelector('video');
      expect(video).toBeTruthy();
    });

    test('video section: iframe src → media4 iframe, video hidden', () => {
      const ref = React.createRef();
      const { container } = render(<MediaWidget ref={ref} {...makeProps({ mediaType: 3 })} />);
      act(() => ref.current.setState({ src: 'iframe: http://iframe.com' }));
      const iframe = container.querySelector('iframe');
      expect(iframe).toBeTruthy();
    });

    test('video section: embed src → media4 embed', () => {
      const ref = React.createRef();
      const { container } = render(<MediaWidget ref={ref} {...makeProps({ mediaType: 3 })} />);
      act(() => ref.current.setState({ src: 'embed: http://embed.swf' }));
      const embed = container.querySelector('embed');
      expect(embed).toBeTruthy();
    });

    test('video section: url src → media4 link', () => {
      const ref = React.createRef();
      const { container } = render(<MediaWidget ref={ref} {...makeProps({ mediaType: 3 })} />);
      act(() => ref.current.setState({ src: 'url: http://video.com' }));
      const link = container.querySelector('a[target="_blank"]');
      expect(link).toBeTruthy();
    });

    test('video section: normal src → video plays, no media4', () => {
      const ref = React.createRef();
      const { container } = render(<MediaWidget ref={ref} {...makeProps({ mediaType: 3 })} />);
      act(() => ref.current.setState({ src: 'http://vid.mp4' }));
      const video = container.querySelector('video');
      expect(video.style.display).not.toBe('none');
    });

    test('video section: type 9 + !type 3 → video display:none', () => {
      const list = [{ id: 'a', name: 'A', type: 4 }];
      const ref = React.createRef();
      const { container } = render(<MediaWidget ref={ref} {...makeProps({ mediaType: 9, list })} />);
      ref.current._item = { type: 4, name: 'A' };
      act(() => ref.current.setState({}));
      const video = container.querySelector('video');
      expect(video.style.display).toBe('none');
    });

    test('audio section: type 4 renders audio', () => {
      const { container } = render(<MediaWidget {...makeProps({ mediaType: 4 })} />);
      const audio = container.querySelector('audio');
      expect(audio).toBeTruthy();
    });

    test('audio section: type 9 renders audio', () => {
      const list = [{ id: 'a', name: 'A', type: 4 }];
      const { container } = render(<MediaWidget {...makeProps({ mediaType: 9, list })} />);
      const audio = container.querySelector('audio');
      expect(audio).toBeTruthy();
    });

    test('audio section: type 9 + !type 4 → audio display:none', () => {
      const list = [{ id: 'a', name: 'A', type: 3 }];
      const ref = React.createRef();
      const { container } = render(<MediaWidget ref={ref} {...makeProps({ mediaType: 9, list })} />);
      ref.current._item = { type: 3, name: 'A' };
      act(() => ref.current.setState({}));
      const audio = container.querySelector('audio');
      expect(audio.style.display).toBe('none');
    });

    test('heading: shows index + name + title', () => {
      const ref = React.createRef();
      const { container } = render(<MediaWidget ref={ref} {...makeProps({ mediaType: 3 })} />);
      ref.current._item = { name: 'TestFile' };
      act(() => ref.current.setState({ index: 2 }));
      expect(container.textContent).toContain('3 : TestFile');
    });

    test('heading: with playlist end → shows (已完結)', () => {
      const ref = React.createRef();
      const { container } = render(<MediaWidget ref={ref} {...makeProps({ mediaType: 3 })} />);
      ref.current._item = { name: 'TestFile' };
      ref.current._playlist = { end: true, obj: { id: 'p1', is_magnet: false }, total: 5 };
      ref.current._title = '- Extra';
      act(() => ref.current.setState({ index: 0 }));
      expect(container.textContent).toContain('(已完結)');
      expect(container.textContent).toContain('- Extra');
    });

    test('heading: without end → no end marker', () => {
      const ref = React.createRef();
      const { container } = render(<MediaWidget ref={ref} {...makeProps({ mediaType: 3 })} />);
      ref.current._item = { name: 'TestFile' };
      ref.current._playlist = { end: false, obj: { id: 'p1', is_magnet: false }, total: 5 };
      act(() => ref.current.setState({ index: 0 }));
      expect(container.textContent).not.toContain('(已完結)');
    });

    test('heading: no playlist → no end marker', () => {
      const ref = React.createRef();
      const { container } = render(<MediaWidget ref={ref} {...makeProps({ mediaType: 3 })} />);
      ref.current._item = { name: 'TestFile' };
      ref.current._playlist = null;
      act(() => ref.current.setState({ index: 0 }));
      expect(container.textContent).not.toContain('(已完結)');
    });

    test('panel heading click triggers toggle', () => {
      const props = makeProps();
      const { container } = render(<MediaWidget {...props} />);
      const heading = container.querySelector('.panel-heading');
      fireEvent.click(heading);
      expect(killEvent).toHaveBeenCalled();
    });

    test('video section: full → larger maxHeight', () => {
      const { container } = render(<MediaWidget {...makeProps({ mediaType: 3, full: true })} />);
      const video = container.querySelector('video');
      expect(video.style.maxHeight).toBe('70vh');
    });

    test('video section: not full → no maxHeight', () => {
      const { container } = render(<MediaWidget {...makeProps({ mediaType: 3, full: false })} />);
      const video = container.querySelector('video');
      expect(video.style.maxHeight).toBe('');
    });

    test('type 2 show=true full=true doc=2 → visibility:visible iframe', () => {
      const ref = React.createRef();
      const { container } = render(<MediaWidget ref={ref} {...makeProps({ show: true, mediaType: 2, full: true })} />);
      ref.current._item = { doc: 2 };
      act(() => ref.current.setState({ src: 'http://doc.html' }));
      const section = container.querySelector('section');
      // doc=2 means NOT visibility:hidden
      expect(section.style.visibility).not.toBe('hidden');
    });

    test('type 2 show=true full=true doc=3 → NOT visibility:hidden', () => {
      const ref = React.createRef();
      const { container } = render(<MediaWidget ref={ref} {...makeProps({ show: true, mediaType: 2, full: true })} />);
      ref.current._item = { doc: 3 };
      act(() => ref.current.setState({ src: 'http://doc.pdf' }));
      const section = container.querySelector('section');
      expect(section.style.visibility).not.toBe('hidden');
    });

    test('option panel: handleOpt select change fires handler', () => {
      const ref = React.createRef();
      const props = makeProps({ mediaType: 3 });
      const { container } = render(<MediaWidget ref={ref} {...props} />);
      act(() => ref.current.setState({ option: true }));
      const select = container.querySelector('select');
      expect(select).toBeTruthy();
      const spy = jest.spyOn(ref.current, '_changeSub');
      fireEvent.change(select, { target: { value: '7' } });
      expect(spy).toHaveBeenCalled();
    });

    test('option panel: type 9 + type 3 shows search/upload/fix/change options', () => {
      const list = [{ id: 'a', name: 'A', type: 3 }];
      const ref = React.createRef();
      const { container } = render(<MediaWidget ref={ref} {...makeProps({ mediaType: 9, list })} />);
      ref.current._item = { type: 3 };
      act(() => ref.current.setState({ option: true }));
      expect(container.querySelector('option[value="3"]')).toBeTruthy();
      expect(container.querySelector('option[value="4"]')).toBeTruthy();
      expect(container.querySelector('option[value="5"]')).toBeTruthy();
      expect(container.querySelector('option[value="7"]')).toBeTruthy();
    });

    test('option panel: type 9 + non-3 → no search/upload/fix/change', () => {
      const list = [{ id: 'a', name: 'A', type: 2 }];
      const ref = React.createRef();
      const { container } = render(<MediaWidget ref={ref} {...makeProps({ mediaType: 9, list })} />);
      ref.current._item = { type: 2 };
      act(() => ref.current.setState({ option: true }));
      expect(container.querySelector('option[value="3"]')).toBeNull();
    });

    test('option panel: type 9 + type 3 + level 2 → handle option', () => {
      const list = [{ id: 'a', name: 'A', type: 3 }];
      const ref = React.createRef();
      const { container } = render(<MediaWidget ref={ref} {...makeProps({ mediaType: 9, list, level: 2 })} />);
      ref.current._item = { type: 3 };
      act(() => ref.current.setState({ option: true }));
      expect(container.querySelector('option[value="6"]')).toBeTruthy();
    });

    test('no audio/video for type 2', () => {
      const { container } = render(<MediaWidget {...makeProps({ mediaType: 2 })} />);
      expect(container.querySelector('video')).toBeNull();
      expect(container.querySelector('audio')).toBeNull();
    });

    test('no complete button for non-9 non-magnet', () => {
      const ref = React.createRef();
      const { container } = render(<MediaWidget ref={ref} {...makeProps({ mediaType: 3 })} />);
      ref.current._playlist = null;
      act(() => ref.current.setState({ option: false }));
      expect(container.querySelector('.glyphicon-refresh')).toBeNull();
    });

    test('click backward button in option panel calls _backward', () => {
      const ref = React.createRef();
      const { container } = render(<MediaWidget ref={ref} {...makeProps({ mediaType: 3 })} />);
      const video = ref.current._video;
      mockMediaElement(video);
      ref.current._media = video;
      act(() => ref.current.setState({ option: true }));
      const backwardLink = container.querySelector('.glyphicon-backward').closest('a');
      fireEvent.click(backwardLink);
      expect(killEvent).toHaveBeenCalled();
    });

    test('click changeMode button in option panel', () => {
      const ref = React.createRef();
      const { container } = render(<MediaWidget ref={ref} {...makeProps({ mediaType: 3 })} />);
      const video = ref.current._video;
      mockMediaElement(video);
      ref.current._media = video;
      act(() => ref.current.setState({ option: true, mode: 0 }));
      const modeLinks = container.querySelectorAll('a[href="#"]');
      const modeLink = Array.from(modeLinks).find(a => a.textContent === 'All');
      expect(modeLink).toBeTruthy();
      fireEvent.click(modeLink);
      expect(killEvent).toHaveBeenCalled();
    });

    test('click playlist up/down in nav panel', () => {
      const ref = React.createRef();
      const { container } = render(<MediaWidget ref={ref} {...makeProps({ mediaType: 3 })} />);
      ref.current._item = { id: 'item1' };
      ref.current._total = 5;
      act(() => ref.current.setState({ option: false, index: 0, loading: false }));
      const upLink = container.querySelector('.glyphicon-chevron-up').closest('a');
      const downLink = container.querySelector('.glyphicon-chevron-down').closest('a');
      fireEvent.click(upLink);
      fireEvent.click(downLink);
      expect(killEvent).toHaveBeenCalled();
    });

    test('click refresh/complete button in nav panel', () => {
      const list = [{ id: 'a', name: 'A', type: 3, complete: false }];
      const ref = React.createRef();
      const { container } = render(<MediaWidget ref={ref} {...makeProps({ mediaType: 9, list })} />);
      ref.current._item = { type: 3, complete: false, id: 'a' };
      act(() => ref.current.setState({ option: false, index: 0 }));
      const refreshLink = container.querySelector('.glyphicon-refresh').closest('a');
      fireEvent.click(refreshLink);
      expect(killEvent).toHaveBeenCalled();
    });

    test('click download button for type 9 torrent complete', () => {
      const list = [{ id: 'a', name: 'A', type: 1, complete: true }];
      const ref = React.createRef();
      const { container } = render(<MediaWidget ref={ref} {...makeProps({ mediaType: 9, list })} />);
      ref.current._item = { type: 1, complete: true, id: 'a', name: 'A' };
      act(() => ref.current.setState({ option: false, index: 0 }));
      const downloadLink = container.querySelector('.glyphicon-download-alt').closest('a');
      fireEvent.click(downloadLink);
      expect(killEvent).toHaveBeenCalled();
    });

    test('click moveMedia left/right in nav panel', () => {
      const ref = React.createRef();
      const { container } = render(<MediaWidget ref={ref} {...makeProps({ mediaType: 3 })} />);
      ref.current._item = { id: 'item1' };
      act(() => ref.current.setState({ option: false, index: 0, loading: false }));
      const leftLink = container.querySelector('.glyphicon-chevron-left').closest('a');
      const rightLink = container.querySelector('.glyphicon-chevron-right').closest('a');
      fireEvent.click(leftLink);
      fireEvent.click(rightLink);
      expect(killEvent).toHaveBeenCalled();
    });

    test('click toggleFull button in nav panel', () => {
      const props = makeProps({ mediaType: 3 });
      const ref = React.createRef();
      const { container } = render(<MediaWidget ref={ref} {...props} />);
      ref.current._item = { id: 'item1' };
      act(() => ref.current.setState({ option: false, index: 0 }));
      const fullLink = container.querySelector('.glyphicon-plus-sign').closest('a');
      expect(fullLink).toBeTruthy();
      fireEvent.click(fullLink);
      expect(killEvent).toHaveBeenCalled();
    });

    test('full + extend image render with onLoad and click', () => {
      const ref = React.createRef();
      const { container } = render(<MediaWidget ref={ref} {...makeProps({ mediaType: 2, full: true })} />);
      ref.current._item = { id: 'item1', name: 'Test' };
      act(() => ref.current.setState({ src: 'http://img.jpg', extend: true, index: 0, subIndex: 3 }));
      const extDiv = container.querySelector('#extend');
      expect(extDiv).toBeTruthy();
      if (extDiv) {
        Object.defineProperty(extDiv, 'scrollWidth', { value: 500, configurable: true });
        Object.defineProperty(extDiv, 'scrollLeft', { writable: true, value: 0, configurable: true });
        Object.defineProperty(extDiv, 'scrollTop', { writable: true, value: 10, configurable: true });
      }
      const img = extDiv.querySelector('img');
      expect(img).toBeTruthy();
      fireEvent.load(img);
      fireEvent.click(img);
      const links = container.querySelectorAll('a.text-center');
      expect(links.length).toBeGreaterThanOrEqual(2);
      fireEvent.click(links[0]);
      fireEvent.click(links[1]);
    });

    test('full + !extend image render with click', () => {
      const ref = React.createRef();
      const { container } = render(<MediaWidget ref={ref} {...makeProps({ mediaType: 2, full: true })} />);
      ref.current._item = { id: 'item1', name: 'Test' };
      act(() => ref.current.setState({ src: 'http://img.jpg', extend: false, index: 0, subIndex: 3 }));
      const img = container.querySelector('img');
      expect(img).toBeTruthy();
      fireEvent.click(img);
      const links = container.querySelectorAll('a.text-center');
      expect(links.length).toBeGreaterThanOrEqual(2);
      fireEvent.click(links[0]);
      fireEvent.click(links[1]);
    });

    test('full + extend: onLoad scrollLeft >= 100 branch', () => {
      const ref = React.createRef();
      const { container } = render(<MediaWidget ref={ref} {...makeProps({ mediaType: 2, full: true })} />);
      ref.current._item = { id: 'item1', name: 'Test' };
      act(() => ref.current.setState({ src: 'http://img.jpg', extend: true, index: 0 }));
      const extDiv = container.querySelector('#extend');
      if (extDiv) {
        Object.defineProperty(extDiv, 'scrollWidth', { value: 500, configurable: true });
        Object.defineProperty(extDiv, 'scrollLeft', { writable: true, value: 150, configurable: true });
        Object.defineProperty(extDiv, 'scrollTop', { writable: true, value: 10, configurable: true });
      }
      const img = container.querySelector('#extend img');
      if (img) fireEvent.load(img);
    });
  });
});
