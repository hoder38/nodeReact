import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { Provider } from 'react-redux';
import { createStore } from 'redux';
import AlertMsg from './AlertMsg.js';
import Alertlist from './Alertlist.js';
import ToggleNav from './ToggleNav.js';
import WidgetButton from './WidgetButton.js';
import Dropdown from './Dropdown.js';
import DropdownMenu from './DropdownMenu.js';
import GlobalComfirm from './GlobalComfirm.js';

describe('ToggleNav', () => {
  test('renders toggle button with icon bars', () => {
    const { container } = render(<ToggleNav collapse="left" />);
    expect(container.querySelector('button.navbar-toggle')).toBeTruthy();
    expect(container.querySelectorAll('.icon-bar')).toHaveLength(3);
  });

  test('applies float:left when inverse=true', () => {
    const { container } = render(<ToggleNav inverse={true} collapse="right" />);
    const btn = container.querySelector('button');
    expect(btn.style.float).toBe('left');
  });

  test('no float when inverse is falsy', () => {
    const { container } = render(<ToggleNav inverse={false} collapse="left" />);
    const btn = container.querySelector('button');
    expect(btn.style.float).toBe('');
  });
});

describe('WidgetButton', () => {
  test('renders button with name and progress', () => {
    const { container } = render(
      <WidgetButton name="Upload" show={true} progress={75} buttonType="primary" widget="upload" />
    );
    expect(screen.getByText('Upload')).toBeTruthy();
    expect(screen.getByText('75')).toBeTruthy();
    expect(container.querySelector('.btn-primary')).toBeTruthy();
  });

  test('hidden when show=false', () => {
    const { container } = render(
      <WidgetButton name="Upload" show={false} progress={0} buttonType="info" widget="upload" />
    );
    const btn = container.querySelector('button');
    expect(btn.style.display).toBe('none');
  });

  test('shows > prefix when more=true', () => {
    render(<WidgetButton name="Music" show={true} progress={5} buttonType="success" widget="music" more={true} />);
    expect(screen.getByText((_, el) => el.textContent === '>5')).toBeTruthy();
  });
});

describe('AlertMsg', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  test('renders message text', () => {
    const onclose = jest.fn();
    render(<AlertMsg msg="Something went wrong" onclose={onclose} />);
    expect(screen.getByText('Something went wrong')).toBeTruthy();
  });

  test('calls onclose after 5 seconds', () => {
    const onclose = jest.fn();
    render(<AlertMsg msg="Error" onclose={onclose} />);
    expect(onclose).not.toHaveBeenCalled();
    jest.advanceTimersByTime(5000);
    expect(onclose).toHaveBeenCalledTimes(1);
  });

  test('clicking X calls onclose', () => {
    const onclose = jest.fn();
    const { container } = render(<AlertMsg msg="Error" onclose={onclose} />);
    const closeBtn = container.querySelector('button.close');
    fireEvent.click(closeBtn);
    expect(onclose).toHaveBeenCalled();
  });

  test('clears timeout on unmount', () => {
    const onclose = jest.fn();
    const { unmount } = render(<AlertMsg msg="Error" onclose={onclose} />);
    unmount();
    jest.advanceTimersByTime(5000);
    expect(onclose).not.toHaveBeenCalled();
  });
});

describe('Alertlist', () => {
  test('renders multiple alerts', () => {
    const alerts = [
      { key: 0, msg: 'Error 1' },
      { key: 1, msg: 'Error 2' },
    ];
    const onclose = jest.fn();
    jest.useFakeTimers();
    render(<Alertlist alertlist={alerts} onclose={onclose} />);
    expect(screen.getByText('Error 1')).toBeTruthy();
    expect(screen.getByText('Error 2')).toBeTruthy();
    jest.useRealTimers();
  });

  test('empty alert list renders container only', () => {
    const { container } = render(<Alertlist alertlist={[]} onclose={jest.fn()} />);
    expect(container.querySelector('div')).toBeTruthy();
    expect(container.querySelectorAll('.alert')).toHaveLength(0);
  });

  test('onclose passes correct key', () => {
    const alerts = [{ key: 42, msg: 'Test' }];
    const onclose = jest.fn();
    jest.useFakeTimers();
    render(<Alertlist alertlist={alerts} onclose={onclose} />);
    // Auto-close after 5s
    jest.advanceTimersByTime(5000);
    expect(onclose).toHaveBeenCalledWith(42);
    jest.useRealTimers();
  });
});

describe('DropdownMenu', () => {
  test('renders menu items with titles', () => {
    const droplist = [
      { key: '1', title: 'Edit', className: 'glyphicon glyphicon-edit', onclick: jest.fn() },
      { key: '2' }, // divider
      { key: '3', title: 'Delete', className: 'glyphicon glyphicon-trash', onclick: jest.fn() },
    ];
    const globalClick = jest.fn();
    const { container } = render(<DropdownMenu droplist={droplist} globalClick={globalClick} />);
    expect(globalClick).toHaveBeenCalledWith(true);
    expect(screen.getByText('Edit')).toBeTruthy();
    expect(screen.getByText('Delete')).toBeTruthy();
    expect(container.querySelectorAll('.divider')).toHaveLength(1);
  });

  test('unmount calls globalClick(false)', () => {
    const globalClick = jest.fn();
    const { unmount } = render(<DropdownMenu droplist={[]} globalClick={globalClick} />);
    unmount();
    expect(globalClick).toHaveBeenCalledWith(false);
  });

  test('clicking item calls onclick with param', () => {
    const onclick = jest.fn();
    const droplist = [{ key: '1', title: 'Action', className: '', onclick }];
    render(<DropdownMenu droplist={droplist} globalClick={jest.fn()} param="myParam" />);
    const link = screen.getByText('Action').closest('a');
    fireEvent.mouseDown(link);
    expect(onclick).toHaveBeenCalledWith('myParam');
  });
});

describe('Dropdown', () => {
  test('opens/closes on click', () => {
    const droplist = [{ key: '1', title: 'Option', className: '', onclick: jest.fn() }];
    const { container } = render(
      <Dropdown headelement="div" droplist={droplist}>
        <span>Menu</span>
      </Dropdown>
    );
    const wrapper = container.querySelector('.dropdown');
    expect(wrapper.classList.contains('open')).toBe(false);
    fireEvent.click(wrapper);
    expect(wrapper.classList.contains('open')).toBe(true);
  });

  test('renders children', () => {
    const { container } = render(
      <Dropdown headelement="div" droplist={[]} className="custom">
        <span>Click me</span>
      </Dropdown>
    );
    expect(screen.getByText('Click me')).toBeTruthy();
    expect(container.querySelector('.custom.dropdown')).toBeTruthy();
  });

  test('_closeDrop closes the menu via mouseup', () => {
    const droplist = [{ key: '1', title: 'Opt', className: '', onclick: jest.fn() }];
    const { container } = render(
      <Dropdown headelement="div" droplist={droplist}>
        <span>Menu</span>
      </Dropdown>
    );
    const wrapper = container.querySelector('.dropdown');
    fireEvent.click(wrapper);
    expect(wrapper.classList.contains('open')).toBe(true);
    fireEvent.mouseUp(document);
    expect(wrapper.classList.contains('open')).toBe(false);
  });
});

describe('GlobalComfirm', () => {
  test('renders confirm dialog with text', () => {
    const callback = jest.fn();
    const onclose = jest.fn();
    render(<GlobalComfirm callback={callback} onclose={onclose} text="Delete this?" />);
    expect(screen.getByText('confirm')).toBeTruthy();
    expect(screen.getByText('OK')).toBeTruthy();
    expect(screen.getByText('Cancel')).toBeTruthy();
  });

  test('OK button calls callback and onclose', () => {
    const callback = jest.fn();
    const onclose = jest.fn();
    const { container } = render(<GlobalComfirm callback={callback} onclose={onclose} text="Sure?" />);
    const form = container.querySelector('form');
    fireEvent.submit(form);
    expect(callback).toHaveBeenCalled();
    expect(onclose).toHaveBeenCalled();
  });

  test('Cancel button calls onclose only', () => {
    const callback = jest.fn();
    const onclose = jest.fn();
    render(<GlobalComfirm callback={callback} onclose={onclose} text="Sure?" />);
    fireEvent.click(screen.getByText('Cancel'));
    expect(onclose).toHaveBeenCalled();
    expect(callback).not.toHaveBeenCalled();
  });
});
