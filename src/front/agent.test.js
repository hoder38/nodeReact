import React from 'react'
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react'
import Agent from './components/Agent.js'
import { resetAgentToken } from './agent.js'

class FakeEventSource {
  constructor(url) {
    this.url = url
    this.listeners = {}
    this.closed = false
    FakeEventSource.last = this
  }
  addEventListener(type, fn) {
    (this.listeners[type] = this.listeners[type] || []).push(fn)
  }
  close() {
    this.closed = true
  }
  emit(type, data) {
    (this.listeners[type] || []).forEach(fn => fn({ data: data === undefined ? undefined : JSON.stringify(data) }))
  }
}

const json = body => Promise.resolve({ ok: true, json: () => Promise.resolve(body) })

describe('Agent page', () => {
  let calls
  beforeEach(() => {
    localStorage.clear()
    resetAgentToken()
    calls = []
    FakeEventSource.last = null
    global.EventSource = FakeEventSource
    Element.prototype.scrollIntoView = () => {}
    global.fetch = jest.fn((url, opts = {}) => {
      calls.push({ url, opts })
      if (url === '/api/agent-token') return json({ token: 'tok', expiresIn: 600 })
      if (url === '/api/agent/status') return json({ killswitch: 'off' })
      if (/\/runs$/.test(url)) return json({ run_id: 'r1', decision: { route: 'chat', model: 'local', queue: 'interactive' } })
      if (/\/cancel$/.test(url)) return json({ ok: true })
      return json({ messages: [] })
    })
  })

  test('sends a message, streams tokens and shows the final answer', async () => {
    render(<Agent />)
    const box = screen.getByPlaceholderText(/Message the agent/)
    fireEvent.change(box, { target: { value: 'hello' } })
    fireEvent.keyDown(box, { key: 'Enter' })

    await waitFor(() => expect(FakeEventSource.last && FakeEventSource.last.url).toBe('/api/agent/runs/r1/stream?token=tok'))
    const post = calls.find(c => /\/runs$/.test(c.url))
    expect(post.opts.headers.Authorization).toBe('Bearer tok')
    expect(JSON.parse(post.opts.body).text).toBe('hello')

    const es = FakeEventSource.last
    act(() => {
      es.emit('token', 'Hi')
      es.emit('token', ' there')
    })
    expect(screen.getByText('Hi there')).toBeInTheDocument()
    expect(screen.getByText('Stop')).toBeInTheDocument()

    act(() => es.emit('done', { text: 'Hi there!', cost_usd: 0 }))
    expect(screen.getByText('Hi there!')).toBeInTheDocument()
    expect(es.closed).toBe(true)
    expect(screen.getByText('Send')).toBeInTheDocument()
  })

  test('Stop cancels the running run', async () => {
    render(<Agent />)
    const box = screen.getByPlaceholderText(/Message the agent/)
    fireEvent.change(box, { target: { value: 'long task' } })
    fireEvent.keyDown(box, { key: 'Enter' })
    await waitFor(() => expect(FakeEventSource.last).toBeTruthy())
    act(() => FakeEventSource.last.emit('token', 'x'))

    fireEvent.click(screen.getByText('Stop'))
    await waitFor(() => expect(calls.some(c => c.url === '/api/agent/runs/r1/cancel' && c.opts.method === 'POST')).toBe(true))
    act(() => FakeEventSource.last.emit('cancelled', { reason: 'user' }))
    expect(screen.getByText(/⏹ cancelled/)).toBeInTheDocument()
  })
})
