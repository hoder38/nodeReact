import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import UserInput from './UserInput.js';

describe('UserInput component', () => {
  const makeGetInput = (overrides = {}) => ({
    getRef: jest.fn(),
    onenter: jest.fn(),
    onchange: jest.fn(),
    className: 'form-control',
    style: {},
    ...overrides,
  });

  test('renders input with placeholder and value', () => {
    const getinput = makeGetInput();
    const { container } = render(
      <UserInput val="hello" getinput={getinput} placeholder="Enter text" />
    );
    const input = container.querySelector('input');
    expect(input.value).toBe('hello');
    expect(input.placeholder).toBe('Enter text');
  });

  test('renders nothing when show=false', () => {
    const getinput = makeGetInput();
    const { container } = render(
      <UserInput val="" getinput={getinput} show={false} />
    );
    expect(container.innerHTML).toBe('');
  });

  test('renders textarea when type=textarea', () => {
    const getinput = makeGetInput();
    const { container } = render(
      <UserInput val={'multi\nline'} getinput={getinput} type="textarea" />
    );
    expect(container.querySelector('textarea')).toBeTruthy();
    expect(container.querySelector('textarea').value).toBe('multi\nline');
  });

  test('renders password type', () => {
    const getinput = makeGetInput();
    const { container } = render(
      <UserInput val="" getinput={getinput} type="password" placeholder="Password" />
    );
    const input = container.querySelector('input');
    expect(input.type).toBe('password');
  });

  test('non-editable without copy shows text directly', () => {
    const getinput = makeGetInput();
    const { container } = render(
      <UserInput val="plain text" getinput={getinput} edit={false} />
    );
    expect(container.textContent).toBe('plain text');
  });

  test('non-editable textarea renders links from [[...]] syntax', () => {
    const getinput = makeGetInput();
    const { container } = render(
      <UserInput val="before [[https://example.com]] after" getinput={getinput} edit={false} type="textarea" />
    );
    const link = container.querySelector('a');
    expect(link).toBeTruthy();
    expect(link.href).toBe('https://example.com/');
    expect(link.textContent).toBe('https://example.com');
  });

  test('copy mode shows readonly input', () => {
    const getinput = makeGetInput();
    const copyFn = jest.fn();
    const { container } = render(
      <UserInput val="secret" getinput={getinput} edit={false} copy={copyFn} />
    );
    const input = container.querySelector('input');
    expect(input.readOnly).toBe(true);
    expect(input.type).toBe('text');
  });

  test('wraps in child element when children provided', () => {
    const getinput = makeGetInput();
    const { container } = render(
      <UserInput val="test" getinput={getinput}>
        <div className="wrapper" />
      </UserInput>
    );
    expect(container.querySelector('.wrapper')).toBeTruthy();
    expect(container.querySelector('.wrapper input')).toBeTruthy();
  });

  test('onChange calls getinput.onchange', () => {
    const onchange = jest.fn();
    const getinput = makeGetInput({ onchange });
    const { container } = render(
      <UserInput val="" getinput={getinput} />
    );
    const input = container.querySelector('input');
    fireEvent.change(input, { target: { value: 'new' } });
    expect(onchange).toHaveBeenCalled();
  });
});

describe('UserInput.Input class', () => {
  test('initValue returns empty strings for all names', () => {
    const input = new UserInput.Input(['username', 'password'], jest.fn(), jest.fn());
    expect(input.initValue()).toEqual({ username: '', password: '' });
  });

  test('initValue with initial values', () => {
    const input = new UserInput.Input(['name', 'email'], jest.fn(), jest.fn());
    expect(input.initValue({ name: 'John' })).toEqual({ name: 'John', email: '' });
  });

  test('getInput returns proper structure', () => {
    const change = jest.fn();
    const input = new UserInput.Input(['field1'], jest.fn(), change, 'my-class', { color: 'red' });
    const result = input.getInput('field1');
    expect(result.className).toBe('my-class');
    expect(result.style).toEqual({ color: 'red' });
    expect(result.onchange).toBe(change);
    expect(typeof result.getRef).toBe('function');
    expect(typeof result.onenter).toBe('function');
  });

  test('getInput onenter advances focus to next field', () => {
    const submit = jest.fn();
    const input = new UserInput.Input(['field1', 'field2'], submit, jest.fn());
    const mockRef1 = { focus: jest.fn() };
    const mockRef2 = { focus: jest.fn() };
    input.getInput('field1').getRef(mockRef1);
    input.getInput('field2').getRef(mockRef2);

    const event = { key: 'Enter', preventDefault: jest.fn() };
    input.getInput('field1').onenter(event);
    expect(mockRef2.focus).toHaveBeenCalled();
    expect(submit).not.toHaveBeenCalled();
  });

  test('getInput onenter on last field calls submit', () => {
    const submit = jest.fn();
    const input = new UserInput.Input(['only'], submit, jest.fn());
    const mockRef = { focus: jest.fn() };
    input.getInput('only').getRef(mockRef);

    const event = { key: 'Enter', preventDefault: jest.fn() };
    input.getInput('only').onenter(event);
    expect(submit).toHaveBeenCalled();
  });

  test('getInput onenter ignores non-Enter keys', () => {
    const submit = jest.fn();
    const input = new UserInput.Input(['field1'], submit, jest.fn());
    const event = { key: 'a', preventDefault: jest.fn() };
    input.getInput('field1').onenter(event);
    expect(submit).not.toHaveBeenCalled();
    expect(event.preventDefault).not.toHaveBeenCalled();
  });

  test('getValue reads from refs', () => {
    const input = new UserInput.Input(['a', 'b'], jest.fn(), jest.fn());
    input.getInput('a').getRef({ value: 'val_a' });
    input.getInput('b').getRef({ value: 'val_b' });
    expect(input.getValue()).toEqual({ a: 'val_a', b: 'val_b' });
  });

  test('initFocus focuses first non-null ref', () => {
    const input = new UserInput.Input(['a', 'b'], jest.fn(), jest.fn());
    const mockRef = { focus: jest.fn() };
    input.getInput('a').getRef(null);
    input.getInput('b').getRef(mockRef);
    input.initFocus();
    expect(mockRef.focus).toHaveBeenCalled();
  });

  test('allBlur blurs all refs', () => {
    const input = new UserInput.Input(['a', 'b'], jest.fn(), jest.fn());
    const ref1 = { blur: jest.fn() };
    const ref2 = { blur: jest.fn() };
    input.getInput('a').getRef(ref1);
    input.getInput('b').getRef(ref2);
    input.allBlur();
    expect(ref1.blur).toHaveBeenCalled();
    expect(ref2.blur).toHaveBeenCalled();
  });
});
