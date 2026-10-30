import React, { useCallback, useEffect, useRef, useState } from 'react'
import { agentApi } from '../agent.js'

// Todos for agent-harness (ARCHITECTURE.md §10, phase 7). The agent and Copilot add to the same list.
const due = iso => (iso ? iso.slice(0, 16).replace('T', ' ') : '')

export default function Todos() {
    const [items, setItems] = useState([])
    const [status, setStatus] = useState('open')
    const [title, setTitle] = useState('')
    const [dueAt, setDueAt] = useState('')
    const [error, setError] = useState(null)
    const alive = useRef(true)
    useEffect(() => () => { alive.current = false }, [])
    const load = useCallback(() => agentApi(`/todos?status=${status}`)
        .then(r => { if (alive.current) { setItems(r.todos || []); setError(null) } })
        .catch(err => alive.current && setError(err.message)), [status])
    useEffect(() => { load() }, [load])

    const fail = err => setError(err.message)
    const add = () => agentApi('/todos', { method: 'POST', body: JSON.stringify({ title: title.trim(), due_at: dueAt || undefined }) })
        .then(() => { setTitle(''); setDueAt(''); return load() }).catch(fail)
    const set = (t, patch) => agentApi(`/todos/${t.id}`, { method: 'PUT', body: JSON.stringify(patch) }).then(load).catch(fail)
    const rename = t => {
        const next = window.prompt('Edit todo', t.title)
        return next && next.trim() && next.trim() !== t.title ? set(t, { title: next.trim() }) : null
    }
    const remove = t => window.confirm(`Delete "${t.title}"?`) && agentApi(`/todos/${t.id}`, { method: 'DELETE' }).then(load).catch(fail)

    return (
        <div style={{ padding: '10px' }}>
            <div className="form-inline" style={{ marginBottom: '8px' }}>
                <input className="form-control input-sm" style={{ width: '40%' }} placeholder="Add a todo" aria-label="New todo" value={title}
                    onChange={e => setTitle(e.target.value)} onKeyDown={e => e.key === 'Enter' && title.trim() && add()} />
                &nbsp;
                <input type="date" className="form-control input-sm" aria-label="Due date" value={dueAt} onChange={e => setDueAt(e.target.value)} />
                &nbsp;
                <button className="btn btn-primary btn-sm" onClick={add} disabled={!title.trim()}>Add</button>
                &nbsp;
                <select className="form-control input-sm" aria-label="Status filter" value={status} onChange={e => setStatus(e.target.value)}>
                    <option value="open">Open</option>
                    <option value="done">Done</option>
                    <option value="all">All</option>
                </select>
            </div>
            {error ? <div className="text-danger small">{error}</div> : null}
            {items.length === 0 ? <div className="text-muted">No todos.</div> : null}
            <ul className="list-group">
                {items.map(t => (
                    <li key={t.id} className="list-group-item" aria-label={`todo ${t.id}`}>
                        <span style={t.status === 'done' ? { textDecoration: 'line-through' } : null}>{t.title}</span>
                        <span className="small text-muted">{t.due_at ? ` · due ${due(t.due_at)}` : ''} · {t.source_channel}</span>
                        <div style={{ marginTop: '4px' }}>
                            <button className="btn btn-default btn-xs" onClick={() => set(t, { status: t.status === 'done' ? 'open' : 'done' })}>
                                {t.status === 'done' ? 'Reopen' : 'Done'}
                            </button>
                            &nbsp;
                            <button className="btn btn-default btn-xs" onClick={() => rename(t)}>Edit</button>
                            &nbsp;
                            <button className="btn btn-danger btn-xs" onClick={() => remove(t)}>Delete</button>
                        </div>
                    </li>
                ))}
            </ul>
        </div>
    )
}
