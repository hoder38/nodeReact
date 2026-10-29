import React, { useCallback, useEffect, useRef, useState } from 'react'
import { agentApi } from '../agent.js'

// Memory review UI for agent-harness (ARCHITECTURE.md §10, §19): long-term memories + the knowledge base.
const NS_LABEL = { profile: 'Profile', procedures: 'Procedures', episodes: 'Episodes', coding_episodes: 'Coding episodes' }
const day = iso => (iso ? iso.slice(0, 16).replace('T', ' ') : '')
const enc = encodeURIComponent

function MemoryRow({ m, onSave, onDelete }) {
    const [editing, setEditing] = useState(false)
    const [text, setText] = useState(m.text)
    const [showHistory, setShowHistory] = useState(false)
    useEffect(() => setText(m.text), [m.text])
    const save = patch => onSave(m, patch).then(ok => ok && setEditing(false))
    return (
        <li className="list-group-item" aria-label={`memory ${m.key}`}>
            <div className="small text-muted">
                {NS_LABEL[m.namespace] || m.namespace}
                {m.pinned ? ' · 📌 pinned' : ''}
                {m.privacy === 'private' ? ' · 🔒 private' : ''}
                {m.kind ? ` · ${m.kind}` : ''}
                {` · ${day(m.updated_at)}`}
                {m.score != null ? ` · score ${m.score.toFixed(2)}` : ''}
            </div>
            {editing ? (
                <div>
                    <textarea className="form-control" rows="3" aria-label="Memory text" value={text} onChange={e => setText(e.target.value)} />
                    <button className="btn btn-primary btn-xs" onClick={() => save({ text })} disabled={!text.trim()}>Save</button>
                    &nbsp;
                    <button className="btn btn-default btn-xs" onClick={() => { setText(m.text); setEditing(false) }}>Cancel</button>
                </div>
            ) : <div style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{m.text}</div>}
            <div style={{ marginTop: '4px' }}>
                {editing ? null : <button className="btn btn-default btn-xs" onClick={() => setEditing(true)}>Edit</button>}
                &nbsp;
                <button className="btn btn-default btn-xs" onClick={() => save({ pinned: !m.pinned })}>{m.pinned ? 'Unpin' : 'Pin'}</button>
                &nbsp;
                <button className="btn btn-default btn-xs" onClick={() => save({ privacy: m.privacy === 'private' ? 'normal' : 'private' })}>
                    {m.privacy === 'private' ? 'Make normal' : 'Make private'}
                </button>
                &nbsp;
                <button className="btn btn-danger btn-xs" onClick={() => onDelete(m)}>Delete</button>
                {m.history && m.history.length ? (
                    <button className="btn btn-link btn-xs" onClick={() => setShowHistory(s => !s)}>History ({m.history.length})</button>
                ) : null}
            </div>
            {showHistory ? (
                <ul className="small text-muted">
                    {m.history.map((h, i) => <li key={i}>until {day(h.until)} — {h.text}</li>)}
                </ul>
            ) : null}
        </li>
    )
}

function Memories() {
    const [items, setItems] = useState([])
    const [namespaces, setNamespaces] = useState(Object.keys(NS_LABEL))
    const [ns, setNs] = useState('')
    const [q, setQ] = useState('')
    const [query, setQuery] = useState('')
    const [newText, setNewText] = useState('')
    const [newNs, setNewNs] = useState('profile')
    const [newPrivate, setNewPrivate] = useState(false)
    const [error, setError] = useState(null)

    const alive = useRef(true)
    useEffect(() => () => { alive.current = false }, [])
    const load = useCallback(() => {
        const params = [ns ? `namespace=${enc(ns)}` : '', query ? `q=${enc(query)}` : ''].filter(Boolean).join('&')
        return agentApi(`/memories${params ? `?${params}` : ''}`)
            .then(r => {
                if (alive.current) {
                    setItems(r.memories || [])
                    setNamespaces(ns2 => r.namespaces || ns2)
                    setError(null)
                }
            })
            .catch(err => alive.current && setError(err.message))
    }, [ns, query])
    useEffect(() => { load() }, [load])

    const onSave = (m, patch) => agentApi(`/memories/${enc(m.namespace)}/${enc(m.key)}`, { method: 'PUT', body: JSON.stringify(patch) })
        .then(updated => { setItems(list => list.map(x => (x.key === m.key && x.namespace === m.namespace ? { ...x, ...updated } : x))); return true })
        .catch(err => { setError(err.message); return false })
    const onDelete = m => {
        if (!window.confirm(`Delete this memory?\n\n${m.text}`)) {
            return
        }
        agentApi(`/memories/${enc(m.namespace)}/${enc(m.key)}`, { method: 'DELETE' })
            .then(() => setItems(list => list.filter(x => !(x.key === m.key && x.namespace === m.namespace))))
            .catch(err => setError(err.message))
    }
    const add = () => agentApi('/memories', { method: 'POST', body: JSON.stringify({ namespace: newNs, text: newText.trim(), private: newPrivate }) })
        .then(() => { setNewText(''); return load() })
        .catch(err => setError(err.message))

    return (
        <div>
            <div className="form-inline" style={{ marginBottom: '8px' }}>
                <select className="form-control input-sm" aria-label="Namespace" value={ns} onChange={e => setNs(e.target.value)}>
                    <option value="">All</option>
                    {namespaces.map(n => <option key={n} value={n}>{NS_LABEL[n] || n}</option>)}
                </select>
                &nbsp;
                <input className="form-control input-sm" placeholder="Search memories" value={q} onChange={e => setQ(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && setQuery(q.trim())} />
                &nbsp;
                <button className="btn btn-default btn-sm" onClick={() => setQuery(q.trim())}>Search</button>
                {query ? <button className="btn btn-link btn-sm" onClick={() => { setQ(''); setQuery('') }}>Clear</button> : null}
            </div>
            <div className="form-inline" style={{ marginBottom: '8px' }}>
                <select className="form-control input-sm" aria-label="New memory namespace" value={newNs} onChange={e => setNewNs(e.target.value)}>
                    <option value="profile">Profile</option>
                    <option value="procedures">Procedures</option>
                </select>
                &nbsp;
                <input className="form-control input-sm" style={{ width: '50%' }} placeholder="Add a memory, e.g. I prefer window seats"
                    value={newText} onChange={e => setNewText(e.target.value)} />
                &nbsp;
                <label className="small"><input type="checkbox" checked={newPrivate} onChange={e => setNewPrivate(e.target.checked)} /> private</label>
                &nbsp;
                <button className="btn btn-primary btn-sm" onClick={add} disabled={!newText.trim()}>Add</button>
            </div>
            {error ? <div className="text-danger small">{error}</div> : null}
            {items.length === 0 ? <div className="text-muted">No memories{query ? ' match' : ' yet'}.</div> : null}
            <ul className="list-group">
                {items.map(m => <MemoryRow key={`${m.namespace}/${m.key}`} m={m} onSave={onSave} onDelete={onDelete} />)}
            </ul>
        </div>
    )
}

function Knowledge() {
    const [docs, setDocs] = useState([])
    const [q, setQ] = useState('')
    const [hits, setHits] = useState(null)
    const [title, setTitle] = useState('')
    const [body, setBody] = useState('')
    const [priv, setPriv] = useState(false)
    const [msg, setMsg] = useState(null)
    const [error, setError] = useState(null)

    const alive = useRef(true)
    useEffect(() => () => { alive.current = false }, [])
    const load = useCallback(() => agentApi('/kb/documents')
        .then(r => alive.current && setDocs(r.documents || []))
        .catch(err => alive.current && setError(err.message)), [])
    useEffect(() => { load() }, [load])

    const search = () => q.trim() && agentApi(`/kb/search?q=${enc(q.trim())}`).then(r => setHits(r.hits || [])).catch(err => setError(err.message))
    const upload = () => agentApi('/kb/documents', { method: 'POST', body: JSON.stringify({ title: title.trim(), text: body, private: priv }) })
        .then(() => { setTitle(''); setBody(''); setMsg('Added.'); return load() })
        .catch(err => setError(err.message))
    const remove = d => window.confirm(`Delete "${d.title}"?`) && agentApi(`/kb/documents/${d.id}`, { method: 'DELETE' })
        .then(load).catch(err => setError(err.message))
    const reindex = () => agentApi('/kb/reindex', { method: 'POST' }).then(() => setMsg('Re-index queued.')).catch(err => setError(err.message))

    return (
        <div>
            <div className="form-inline" style={{ marginBottom: '8px' }}>
                <input className="form-control input-sm" style={{ width: '50%' }} placeholder="Test a knowledge-base search" value={q}
                    onChange={e => setQ(e.target.value)} onKeyDown={e => e.key === 'Enter' && search()} />
                &nbsp;
                <button className="btn btn-default btn-sm" onClick={search}>Search</button>
                &nbsp;
                <button className="btn btn-default btn-sm" onClick={reindex} title="Rescan the docs folder">Re-index</button>
            </div>
            {error ? <div className="text-danger small">{error}</div> : null}
            {msg ? <div className="text-success small">{msg}</div> : null}
            {hits ? (
                <ol aria-label="Search results">
                    {hits.length === 0 ? <li className="text-muted">No relevant passages.</li> : null}
                    {hits.map((h, i) => (
                        <li key={i}>
                            <b>{h.cite}</b>{h.privacy_tag === 'PRIVATE' ? ' 🔒' : ''}
                            <span className="small text-muted">{h.score != null ? ` · rerank ${h.score.toFixed(2)}` : ''}{h.vec_sim != null ? ` · sim ${h.vec_sim.toFixed(2)}` : ''}</span>
                            <div className="small" style={{ whiteSpace: 'pre-wrap' }}>{h.text.slice(0, 400)}{h.text.length > 400 ? '…' : ''}</div>
                        </li>
                    ))}
                </ol>
            ) : null}
            <h5>Documents ({docs.length})</h5>
            <table className="table table-condensed small">
                <thead><tr><th>Path</th><th>Title</th><th>Chunks</th><th>Privacy</th><th>Indexed</th><th></th></tr></thead>
                <tbody>
                    {docs.map(d => (
                        <tr key={d.id}>
                            <td>{d.source === 'upload' ? '⬆ ' : ''}{d.path}</td>
                            <td>{d.title}</td>
                            <td>{d.n_chunks}</td>
                            <td>{d.privacy_tag === 'PRIVATE' ? '🔒 private' : 'normal'}</td>
                            <td>{day(d.indexed_at)}</td>
                            <td>{d.source === 'upload' ? <button className="btn btn-danger btn-xs" onClick={() => remove(d)}>Delete</button> : null}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
            <h5>Add a note</h5>
            <input className="form-control input-sm" placeholder="Title" value={title} onChange={e => setTitle(e.target.value)} />
            <textarea className="form-control" rows="5" placeholder="Markdown text" value={body} onChange={e => setBody(e.target.value)} />
            <label className="small"><input type="checkbox" checked={priv} onChange={e => setPriv(e.target.checked)} /> private</label>
            &nbsp;
            <button className="btn btn-primary btn-sm" onClick={upload} disabled={!title.trim() || !body.trim()}>Add note</button>
        </div>
    )
}

export default function Memory() {
    const [tab, setTab] = useState('memories')
    return (
        <div style={{ padding: '10px' }}>
            <ul className="nav nav-tabs" style={{ marginBottom: '10px' }}>
                <li className={tab === 'memories' ? 'active' : ''}><a href="#" onClick={e => { e.preventDefault(); setTab('memories') }}>Memories</a></li>
                <li className={tab === 'kb' ? 'active' : ''}><a href="#" onClick={e => { e.preventDefault(); setTab('kb') }}>Knowledge base</a></li>
            </ul>
            {tab === 'memories' ? <Memories /> : <Knowledge />}
        </div>
    )
}
