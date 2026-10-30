import React, { useCallback, useEffect, useRef, useState } from 'react'
import { agentApi } from '../agent.js'

// Inbox for agent-harness (ARCHITECTURE.md §12 L10, phase 7): approvals/questions that wait for you (even for days),
// plus alerts and memory-write notes.
const day = iso => (iso ? iso.slice(0, 16).replace('T', ' ') : '')
const ICON = { approval: '✅', question: '❓', alert: '⚠️', memory: '🧠' }
const KINDS = ['', 'approval', 'question', 'alert', 'memory']

function Item({ it, onAct }) {
    const [text, setText] = useState('')
    const actionable = it.status === 'open' && (it.kind === 'approval' || it.kind === 'question')
    const options = (it.detail && it.detail.options) || []
    return (
        <li className="list-group-item" aria-label={`inbox ${it.id}`} style={it.read ? null : { fontWeight: 'bold' }}>
            <div>{ICON[it.kind]} {it.title}{it.private ? ' 🔒' : ''}</div>
            <div className="small text-muted" style={{ fontWeight: 'normal' }}>{it.kind} · {it.status} · {day(it.created_at)}</div>
            {it.body ? <div style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontWeight: 'normal' }}>{it.body}</div> : null}
            <div style={{ marginTop: '4px' }}>
                {actionable && it.kind === 'approval' ? (
                    <>
                        <button className="btn btn-success btn-xs" onClick={() => onAct(it, 'answer', { value: options[0] || 'Approve' })}>Approve</button>
                        &nbsp;
                        <button className="btn btn-danger btn-xs" onClick={() => onAct(it, 'dismiss')}>Reject</button>
                    </>
                ) : null}
                {actionable && it.kind === 'question' ? (
                    <>
                        {options.map(o => (
                            <button key={o} className="btn btn-default btn-xs" style={{ marginRight: '4px' }} onClick={() => onAct(it, 'answer', { value: o })}>{o}</button>
                        ))}
                        <input className="form-control input-sm" style={{ display: 'inline-block', width: '50%' }} aria-label="Answer" value={text}
                            onChange={e => setText(e.target.value)} />
                        &nbsp;
                        <button className="btn btn-primary btn-xs" disabled={!text.trim()} onClick={() => onAct(it, 'answer', { value: text.trim() })}>Send</button>
                        &nbsp;
                        <button className="btn btn-default btn-xs" onClick={() => onAct(it, 'dismiss')}>Dismiss</button>
                    </>
                ) : null}
                {!actionable && it.status === 'open' ? <button className="btn btn-default btn-xs" onClick={() => onAct(it, 'dismiss')}>Dismiss</button> : null}
                {!it.read ? <>&nbsp;<button className="btn btn-link btn-xs" onClick={() => onAct(it, 'read')}>Mark read</button></> : null}
            </div>
        </li>
    )
}

export default function Inbox() {
    const [items, setItems] = useState([])
    const [counts, setCounts] = useState({})
    const [kind, setKind] = useState('')
    const [status, setStatus] = useState('open')
    const [error, setError] = useState(null)
    const alive = useRef(true)
    useEffect(() => () => { alive.current = false }, [])
    const load = useCallback(() => agentApi(`/inbox?status=${status}${kind ? `&kind=${kind}` : ''}`)
        .then(r => { if (alive.current) { setItems(r.items || []); setCounts(r.counts || {}); setError(null) } })
        .catch(err => alive.current && setError(err.message)), [status, kind])
    useEffect(() => { load() }, [load])

    const act = (it, what, body) => agentApi(`/inbox/${it.id}/${what}`, { method: 'POST', body: JSON.stringify(body || {}) })
        .then(load).catch(err => setError(err.message))
    const bulk = k => window.confirm(`Dismiss all open ${k} items?`) && agentApi('/inbox/dismiss', { method: 'POST', body: JSON.stringify({ kind: k }) })
        .then(load).catch(err => setError(err.message))

    return (
        <div style={{ padding: '10px' }}>
            <div className="form-inline" style={{ marginBottom: '8px' }}>
                <select className="form-control input-sm" aria-label="Kind" value={kind} onChange={e => setKind(e.target.value)}>
                    {KINDS.map(k => <option key={k} value={k}>{k || 'All kinds'}</option>)}
                </select>
                &nbsp;
                <select className="form-control input-sm" aria-label="Status" value={status} onChange={e => setStatus(e.target.value)}>
                    <option value="open">Open</option>
                    <option value="done">Done</option>
                    <option value="dismissed">Dismissed</option>
                    <option value="all">All</option>
                </select>
                &nbsp;
                <span className="small text-muted">{counts.actionable || 0} waiting for you · {counts.unread || 0} unread</span>
                &nbsp;
                <button className="btn btn-default btn-xs" onClick={() => bulk('memory')}>Dismiss all memory notes</button>
                &nbsp;
                <button className="btn btn-default btn-xs" onClick={() => bulk('alert')}>Dismiss all alerts</button>
            </div>
            {error ? <div className="text-danger small">{error}</div> : null}
            {items.length === 0 ? <div className="text-muted">Inbox is empty.</div> : null}
            <ul className="list-group">
                {items.map(it => <Item key={it.id} it={it} onAct={act} />)}
            </ul>
        </div>
    )
}
