import React from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import Inbox from './components/Inbox.js'
import Todos from './components/Todos.js'
import { resetAgentToken } from './agent.js'

const json = body => Promise.resolve({ ok: true, json: () => Promise.resolve(body) })
const approval = { id: 1, kind: 'approval', title: 'Approve code change in harness', body: 'diff', status: 'open', read: false,
    created_at: '2026-10-30T01:00:00Z', detail: { options: ['Approve', 'Reject'] } }
const note = { id: 2, kind: 'memory', title: 'Remembered (profile)', body: 'likes tea', status: 'open', read: true, created_at: '2026-10-30T01:00:00Z', detail: {} }

let calls
beforeEach(() => {
    resetAgentToken()
    calls = []
    window.confirm = jest.fn(() => true)
    global.fetch = jest.fn((url, opts = {}) => {
        calls.push({ url, method: opts.method || 'GET', body: opts.body && JSON.parse(opts.body) })
        if (url === '/api/agent-token') return json({ token: 'tok', expiresIn: 600 })
        if (url.startsWith('/api/agent/inbox?')) return json({ items: [approval, note], counts: { open: 2, unread: 1, actionable: 1 } })
        if (url.startsWith('/api/agent/todos?')) return json({ todos: [{ id: 5, title: 'Buy tea', status: 'open', due_at: '2026-11-02T15:59:00+00:00', source_channel: 'copilot' }] })
        return json({ ok: true })
    })
})

test('inbox approves, rejects and bulk-dismisses memory notes', async () => {
    render(<Inbox />)
    await screen.findByText(/Approve code change in harness/)
    expect(screen.getByText(/1 waiting for you · 1 unread/)).toBeTruthy()
    fireEvent.click(screen.getByText('Approve'))
    await waitFor(() => expect(calls.find(c => c.url === '/api/agent/inbox/1/answer').body).toEqual({ value: 'Approve' }))
    fireEvent.click(screen.getByText('Reject'))
    await waitFor(() => expect(calls.some(c => c.url === '/api/agent/inbox/1/dismiss' && c.method === 'POST')).toBe(true))
    fireEvent.click(screen.getByText('Dismiss all memory notes'))
    await waitFor(() => expect(calls.find(c => c.url === '/api/agent/inbox/dismiss').body).toEqual({ kind: 'memory' }))
})

test('todos add and complete', async () => {
    render(<Todos />)
    await screen.findByText('Buy tea')
    fireEvent.change(screen.getByLabelText('New todo'), { target: { value: 'Call mum' } })
    fireEvent.click(screen.getByText('Add'))
    await waitFor(() => expect(calls.find(c => c.url === '/api/agent/todos' && c.method === 'POST').body).toEqual({ title: 'Call mum' }))
    fireEvent.click(screen.getByRole('button', { name: 'Done' }))
    await waitFor(() => expect(calls.find(c => c.url === '/api/agent/todos/5').body).toEqual({ status: 'done' }))
})
