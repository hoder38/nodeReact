import React from 'react'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import Memory from './components/Memory.js'
import { resetAgentToken } from './agent.js'

const json = body => Promise.resolve({ ok: true, json: () => Promise.resolve(body) })
const mem = { namespace: 'profile', key: 'k1', text: 'The owner uses pnpm', privacy: 'normal', pinned: false, kind: 'auto',
    history: [{ text: 'The owner uses npm', until: '2026-10-01T00:00:00Z' }], updated_at: '2026-10-02T03:04:00Z' }

describe('Memory page', () => {
    let calls
    beforeEach(() => {
        resetAgentToken()
        calls = []
        window.confirm = jest.fn(() => true)
        global.fetch = jest.fn((url, opts = {}) => {
            calls.push({ url, method: opts.method || 'GET', body: opts.body && JSON.parse(opts.body) })
            if (url === '/api/agent-token') return json({ token: 'tok', expiresIn: 600 })
            if (url.startsWith('/api/agent/memories/') && opts.method === 'PUT') return json({ ...mem, ...JSON.parse(opts.body) })
            if (url.startsWith('/api/agent/memories/') && opts.method === 'DELETE') return json({ ok: true })
            if (url.startsWith('/api/agent/memories')) return json({ memories: [mem], namespaces: ['profile', 'procedures', 'episodes', 'coding_episodes'] })
            if (url === '/api/agent/kb/documents') return json({ documents: [
                { id: 1, source: 'folder', path: 'a/README.md', title: 'Readme', n_chunks: 3, privacy_tag: 'NORMAL', indexed_at: '2026-10-02T00:00:00Z' },
                { id: 2, source: 'upload', path: 'note.md', title: 'Note', n_chunks: 1, privacy_tag: 'PRIVATE', indexed_at: '2026-10-02T00:00:00Z' }] })
            if (url.startsWith('/api/agent/kb/search')) return json({ hits: [{ cite: 'a/README.md#Usage', text: 'run it', score: 0.9, vec_sim: 0.6, privacy_tag: 'NORMAL' }] })
            return json({ ok: true })
        })
    })

    test('edits, pins and deletes a memory and shows its history', async () => {
        render(<Memory />)
        const row = await screen.findByLabelText('memory k1')
        fireEvent.click(within(row).getByText('History (1)'))
        expect(within(row).getByText(/The owner uses npm/)).toBeTruthy()

        fireEvent.click(within(row).getByText('Edit'))
        fireEvent.change(within(row).getByLabelText('Memory text'), { target: { value: 'The owner uses pnpm 9' } })
        fireEvent.click(within(row).getByText('Save'))
        await waitFor(() => expect(within(row).getByText('The owner uses pnpm 9')).toBeTruthy())
        expect(calls.find(c => c.method === 'PUT')).toMatchObject({ url: '/api/agent/memories/profile/k1', body: { text: 'The owner uses pnpm 9' } })

        fireEvent.click(within(row).getByText('Pin'))
        await waitFor(() => expect(within(row).getByText('Unpin')).toBeTruthy())

        fireEvent.click(within(row).getByText('Delete'))
        await waitFor(() => expect(screen.queryByLabelText('memory k1')).toBeNull())
        expect(calls.some(c => c.method === 'DELETE' && c.url === '/api/agent/memories/profile/k1')).toBe(true)
    })

    test('filters and searches memories', async () => {
        render(<Memory />)
        await screen.findByLabelText('memory k1')
        fireEvent.change(screen.getByLabelText('Namespace'), { target: { value: 'procedures' } })
        fireEvent.change(screen.getByPlaceholderText('Search memories'), { target: { value: 'js tools' } })
        fireEvent.click(screen.getByText('Search'))
        await waitFor(() => expect(calls.some(c => c.url === '/api/agent/memories?namespace=procedures&q=js%20tools')).toBe(true))
    })

    test('knowledge base tab lists documents, searches, and deletes only uploads', async () => {
        render(<Memory />)
        fireEvent.click(screen.getByText('Knowledge base'))
        await screen.findByText('a/README.md')
        expect(screen.getAllByText('Delete')).toHaveLength(1)
        fireEvent.change(screen.getByPlaceholderText('Test a knowledge-base search'), { target: { value: 'how to run' } })
        fireEvent.click(screen.getByText('Search'))
        expect(await screen.findByText('a/README.md#Usage')).toBeTruthy()
        fireEvent.click(screen.getByText('Delete'))
        await waitFor(() => expect(calls.some(c => c.method === 'DELETE' && c.url === '/api/agent/kb/documents/2')).toBe(true))
    })
})
