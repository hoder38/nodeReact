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
  let serverThreads
  let threadBody
  const ready = () => waitFor(() => expect(screen.getByRole('combobox', { name: 'Chats' }).value).not.toBe(''))
  beforeEach(() => {
    serverThreads = []
    threadBody = { messages: [] }
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
      if (url === '/api/agent/threads') return json({ threads: serverThreads })
      if (/\/runs$/.test(url)) return json({ run_id: 'r1', decision: { route: 'chat', model: 'local', queue: 'interactive' } })
      if (/\/cancel$/.test(url)) return json({ ok: true })
      if (/\/resume$/.test(url)) return json({ run_id: 'r2', decision: { route: 'chat', model: 'local', queue: 'interactive' } })
      return json(threadBody)
    })
  })

  test('sends a message, streams tokens and shows the final answer', async () => {
    render(<Agent />)
    await ready()
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
    await ready()
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

  test('chat list comes from the server (incl. LINE) and remove hides it there', async () => {
    serverThreads = [
      { id: 'wold', title: 'older chat', channel: 'web' },
      { id: 'line', title: 'LINE', channel: 'line' },
    ]
    render(<Agent />)
    await ready()
    const select = screen.getByRole('combobox', { name: 'Chats' })
    expect(select.value).toBe('wold')
    expect(screen.getByText('💬 LINE')).toBeInTheDocument()
    await waitFor(() => expect(calls.some(c => c.url === '/api/agent/threads/wold')).toBe(true))

    fireEvent.change(select, { target: { value: 'line' } })
    await waitFor(() => expect(calls.some(c => c.url === '/api/agent/threads/line')).toBe(true))

    fireEvent.click(screen.getByTitle('Remove from list'))
    await waitFor(() => expect(calls.some(c => c.url === '/api/agent/threads/line' && c.opts.method === 'DELETE')).toBe(true))
    await waitFor(() => expect(select.value).toBe('wold'))
    expect(localStorage.getItem('agentThreads')).toBeNull()
  })

  test('clarifying question: options, reset, answer by button resumes the run', async () => {
    render(<Agent />)
    await ready()
    const box = screen.getByPlaceholderText(/Message the agent/)
    fireEvent.change(box, { target: { value: 'how much is that' } })
    fireEvent.keyDown(box, { key: 'Enter' })
    await waitFor(() => expect(FakeEventSource.last).toBeTruthy())
    const es = FakeEventSource.last
    act(() => {
      es.emit('token', 'draft')
      es.emit('reset')
      es.emit('interrupt', { question: 'Which one?', options: ['Phone', 'Laptop'], round: 1, run_id: 'r1' })
    })
    expect(screen.getByText(/Which one\?\s+1\. Phone\s+2\. Laptop/)).toBeInTheDocument()
    expect(screen.queryByText(/draft/)).toBeNull()
    expect(es.closed).toBe(true)
    expect(screen.getByPlaceholderText(/Answer the question/)).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Laptop' }))
    await waitFor(() => expect(calls.some(c => c.url === '/api/agent/runs/r1/resume')).toBe(true))
    const post = calls.find(c => c.url === '/api/agent/runs/r1/resume')
    expect(JSON.parse(post.opts.body)).toEqual({ value: '2' })
    await waitFor(() => expect(FakeEventSource.last.url).toBe('/api/agent/runs/r2/stream?token=tok'))
    expect(screen.getAllByText('Laptop').length).toBe(1) // the user bubble; the option buttons are gone
    act(() => FakeEventSource.last.emit('done', { text: 'About $999 [1]', grounding: { citations: [{ n: 1 }] } }))
    expect(screen.getByText('About $999 [1]')).toBeInTheDocument()
    expect(screen.getByText(/1 source/)).toBeInTheDocument()
  })

  test('pending question from history: Skip resumes with an empty value', async () => {
    serverThreads = [{ id: 'wq', title: 'q', channel: 'web' }]
    threadBody = { messages: [{ role: 'assistant', content: 'Which one?' }],
      pending: { run_id: 'r9', round: 1, question: 'Which one?', options: [] } }
    render(<Agent />)
    await ready()
    await waitFor(() => expect(screen.getByText('Skip')).toBeInTheDocument())
    fireEvent.click(screen.getByText('Skip'))
    await waitFor(() => expect(calls.some(c => c.url === '/api/agent/runs/r9/resume')).toBe(true))
    expect(JSON.parse(calls.find(c => c.url === '/api/agent/runs/r9/resume').opts.body)).toEqual({ value: '' })
    expect(screen.getByText('/skip')).toBeInTheDocument()
  })
})
