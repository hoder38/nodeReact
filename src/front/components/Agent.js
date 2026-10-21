import React, { useEffect, useRef, useState } from 'react'
import { agentApi, useAgentThread } from '../agent.js'

const THREADS_KEY = 'agentThreads'
const CURRENT_KEY = 'agentThread'
const RUNNING = ['queued', 'running', 'deferred', 'paused', 'retrying']

const newThreadId = () => `w${Date.now().toString(36)}`

const loadThreads = () => {
    try {
        const list = JSON.parse(localStorage.getItem(THREADS_KEY) || '[]')
        return Array.isArray(list) && list.length > 0 ? list : [{ id: newThreadId(), title: 'New chat' }]
    } catch (e) {
        return [{ id: newThreadId(), title: 'New chat' }]
    }
}

const bubbleStyle = role => ({
    maxWidth: '85%',
    padding: '6px 10px',
    margin: '4px 0',
    borderRadius: '8px',
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word',
    alignSelf: role === 'user' ? 'flex-end' : 'flex-start',
    background: role === 'user' ? '#d9edf7' : '#f5f5f5',
})

function Message({ msg }) {
    if (msg.role === 'tool') {
        return <div className="text-muted small">🔧 {msg.name}</div>
    }
    const tools = msg.tools || msg.tool_calls || []
    if (msg.role === 'assistant' && !msg.content && tools.length > 0) {
        return <div className="text-muted small">🔧 {tools.join(', ')}</div>
    }
    return (
        <div style={bubbleStyle(msg.role)}>
            {tools.length > 0 ? <div className="text-muted small">🔧 {tools.join(', ')}</div> : null}
            {msg.content || (msg.role === 'assistant' ? '…' : '')}
        </div>
    )
}

export default function Agent() {
    const [threads, setThreads] = useState(loadThreads)
    const [threadId, setThreadId] = useState(() => {
        const cur = localStorage.getItem(CURRENT_KEY)
        return cur && threads.some(t => t.id === cur) ? cur : threads[0].id
    })
    const [text, setText] = useState('')
    const [killswitch, setKillswitch] = useState(null)
    const { messages, run, error, send, cancel } = useAgentThread(threadId)
    const bottomRef = useRef(null)
    const busy = Boolean(run && RUNNING.includes(run.status))

    useEffect(() => {
        localStorage.setItem(THREADS_KEY, JSON.stringify(threads))
        localStorage.setItem(CURRENT_KEY, threadId)
    }, [threads, threadId])

    useEffect(() => {
        agentApi('/status').then(s => setKillswitch(s.killswitch)).catch(() => setKillswitch(null))
    }, [])

    useEffect(() => {
        if (bottomRef.current && bottomRef.current.scrollIntoView) {
            bottomRef.current.scrollIntoView({ block: 'end' })
        }
    }, [messages])

    const submit = () => {
        const t = text.trim()
        if (!t || busy) {
            return
        }
        setText('')
        setThreads(list => list.map(th => (th.id === threadId && th.title === 'New chat' ? { ...th, title: t.slice(0, 30) } : th)))
        send(t)
    }

    const onKeyDown = e => {
        if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
            e.preventDefault()
            submit()
        }
    }

    const newThread = () => {
        const id = newThreadId()
        setThreads(list => [{ id, title: 'New chat' }, ...list])
        setThreadId(id)
    }

    const removeThread = () => {
        const rest = threads.filter(t => t.id !== threadId)
        const next = rest.length > 0 ? rest : [{ id: newThreadId(), title: 'New chat' }]
        setThreads(next)
        setThreadId(next[0].id)
    }

    const changeKillswitch = state => agentApi('/killswitch', { method: 'PUT', body: JSON.stringify({ state }) })
        .then(r => setKillswitch(r.killswitch))
        .catch(err => window.alert(err.message))

    const decision = run && run.decision
    return (
        <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 60px)', padding: '10px' }}>
            <div className="form-inline" style={{ marginBottom: '8px' }}>
                <select className="form-control input-sm" value={threadId} onChange={e => setThreadId(e.target.value)}>
                    {threads.map(t => <option key={t.id} value={t.id}>{t.title}</option>)}
                </select>
                &nbsp;
                <button className="btn btn-default btn-sm" onClick={newThread} title="New chat">
                    <i className="glyphicon glyphicon-plus"></i>
                </button>
                &nbsp;
                <button className="btn btn-default btn-sm" onClick={removeThread} title="Remove from list">
                    <i className="glyphicon glyphicon-trash"></i>
                </button>
                <span className="pull-right small">
                    kill switch&nbsp;
                    <select className="form-control input-sm" value={killswitch || ''} disabled={!killswitch} onChange={e => changeKillswitch(e.target.value)}>
                        {killswitch ? null : <option value="">?</option>}
                        <option value="off">off</option>
                        <option value="cloud">cloud</option>
                        <option value="all">all</option>
                    </select>
                </span>
            </div>
            <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', border: '1px solid #ddd', borderRadius: '4px', padding: '8px' }}>
                {messages.length === 0 ? <div className="text-muted">Prefix with /local, /cloud or /code to pick a route. /status, /stop cloud|all, /resume control the harness.</div> : null}
                {messages.map((m, i) => <Message key={m.id || i} msg={m} />)}
                <div ref={bottomRef}></div>
            </div>
            <div className="small text-muted" style={{ minHeight: '18px', margin: '4px 0' }}>
                {decision ? `${decision.route} → ${decision.model} (${decision.queue})${decision.private ? ' · private' : ''}` : ''}
                {run ? ` · ${run.status}` : ''}
                {run && run.result && run.result.cost_usd ? ` · $${run.result.cost_usd.toFixed(4)}` : ''}
                {error ? <span className="text-danger"> · {error}</span> : null}
            </div>
            <div style={{ display: 'flex' }}>
                <textarea
                    className="form-control"
                    rows="2"
                    value={text}
                    placeholder="Message the agent (Enter to send, Shift+Enter for newline)"
                    onChange={e => setText(e.target.value)}
                    onKeyDown={onKeyDown}
                />
                {busy
                    ? <button className="btn btn-warning" style={{ marginLeft: '6px' }} onClick={cancel}>Stop</button>
                    : <button className="btn btn-primary" style={{ marginLeft: '6px' }} onClick={submit} disabled={!text.trim()}>Send</button>}
            </div>
        </div>
    )
}
