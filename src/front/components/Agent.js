import React, { useCallback, useEffect, useRef, useState } from 'react'
import { agentApi, useAgentThread } from '../agent.js'

const CURRENT_KEY = 'agentThread'
const RUNNING = ['queued', 'running', 'deferred', 'paused', 'retrying']

const newThreadId = () => `w${Date.now().toString(36)}`

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
    // The thread list lives on the harness (so every device/tab sees the same chats).
    // A new chat is only a local draft until its first message is sent.
    const [threads, setThreads] = useState([])
    const [draft, setDraft] = useState(null)
    const draftRef = useRef(null)
    draftRef.current = draft
    const [threadId, setThreadId] = useState(() => localStorage.getItem(CURRENT_KEY) || null)
    const [text, setText] = useState('')
    const [killswitch, setKillswitch] = useState(null)
    const { messages, run, error, pending, send, resume, skip, cancel } = useAgentThread(threadId)
    const bottomRef = useRef(null)
    const busy = Boolean(run && RUNNING.includes(run.status))

    const refreshThreads = useCallback(() => agentApi('/threads')
        .then(res => {
            const list = (res && res.threads) || []
            setThreads(list)
            setDraft(d => (d && list.some(t => t.id === d.id) ? null : d))
            setThreadId(cur => {
                if (cur && list.some(t => t.id === cur)) {
                    return cur
                }
                const d = draftRef.current
                if (list.length > 0 && !(d && cur === d.id)) {
                    return list[0].id
                }
                return cur
            })
            return list
        })
        .catch(() => null), [])

    useEffect(() => {
        localStorage.removeItem('agentThreads') // old browser-only list
        refreshThreads().then(list => {
            if (list && list.length === 0) {
                const id = newThreadId()
                setDraft({ id, title: 'New chat' })
                setThreadId(id)
            }
        })
        const onFocus = () => refreshThreads()
        window.addEventListener('focus', onFocus)
        return () => window.removeEventListener('focus', onFocus)
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    useEffect(() => {
        if (threadId) {
            localStorage.setItem(CURRENT_KEY, threadId)
        }
    }, [threadId])

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
        if (!t || busy || !threadId) {
            return
        }
        setText('')
        setDraft(d => (d && d.id === threadId ? { ...d, title: t.slice(0, 30) } : d))
        Promise.resolve(send(t)).then(() => refreshThreads())
    }

    const onKeyDown = e => {
        if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
            e.preventDefault()
            submit()
        }
    }

    const newThread = () => {
        const id = newThreadId()
        setDraft({ id, title: 'New chat' })
        setThreadId(id)
    }

    const removeThread = async () => {
        if (draft && draft.id === threadId) {
            setDraft(null)
        } else {
            try {
                await agentApi(`/threads/${threadId}`, { method: 'DELETE' })
            } catch (err) {
                window.alert(err.message)
                return
            }
        }
        const rest = threads.filter(t => t.id !== threadId)
        setThreads(rest)
        if (rest.length > 0) {
            setThreadId(rest[0].id)
        } else {
            newThread()
        }
    }

    const shown = draft && !threads.some(t => t.id === draft.id) ? [draft, ...threads] : threads
    const changeKillswitch = state => agentApi('/killswitch', { method: 'PUT', body: JSON.stringify({ state }) })
        .then(r => setKillswitch(r.killswitch))
        .catch(err => window.alert(err.message))

    const decision = run && run.decision
    return (
        <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 60px)', padding: '10px' }}>
            <div className="form-inline" style={{ marginBottom: '8px' }}>
                <select className="form-control input-sm" aria-label="Chats" value={threadId || ''} onChange={e => setThreadId(e.target.value)}>
                    {shown.map(t => <option key={t.id} value={t.id}>{`${t.private ? '🔒 ' : ''}${t.channel === 'line' ? '💬 ' : ''}${t.title}`}</option>)}
                </select>
                {(threads.find(t => t.id === threadId) || {}).private ? <span className="label label-warning" style={{ marginLeft: '6px' }} title="This chat contains private content, so only the local model is used. Start a new chat to unlock.">🔒 Private · local only</span> : null}
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
                {messages.length === 0 ? <div className="text-muted">Prefix with /local, /cloud or /code to pick a route. /status, /stop cloud|all, /resume control the harness. /skip skips a clarifying question.</div> : null}
                {messages.map((m, i) => <Message key={m.id || i} msg={m} />)}
                {pending && !busy ? (
                    <div style={{ alignSelf: 'flex-start', margin: '4px 0' }} aria-label="Clarifying question">
                        {pending.options.map((o, i) => (
                            <button key={o} className="btn btn-default btn-sm" style={{ margin: '0 6px 4px 0' }} onClick={() => resume(String(i + 1))}>
                                {o}
                            </button>
                        ))}
                        <button className="btn btn-link btn-sm" style={{ marginBottom: '4px' }} onClick={skip} title="Answer with a stated assumption">
                            Skip
                        </button>
                    </div>
                ) : null}
                <div ref={bottomRef}></div>
            </div>
            <div className="small text-muted" style={{ minHeight: '18px', margin: '4px 0' }}>
                {decision ? `${decision.route} → ${decision.model} (${decision.queue})${decision.private ? ' · private' : ''}` : ''}
                {run ? ` · ${run.status}` : ''}
                {run && run.result && run.result.cost_usd ? ` · $${run.result.cost_usd.toFixed(4)}` : ''}
                {run && run.result && run.result.grounding && run.result.grounding.citations && run.result.grounding.citations.length
                    ? ` · ${run.result.grounding.citations.length} source${run.result.grounding.citations.length > 1 ? 's' : ''}` : ''}
                {error ? <span className="text-danger"> · {error}</span> : null}
            </div>
            <div style={{ display: 'flex' }}>
                <textarea
                    className="form-control"
                    rows="2"
                    value={text}
                    placeholder={pending ? 'Answer the question above, or pick an option (Enter to send)' : 'Message the agent (Enter to send, Shift+Enter for newline)'}
                    onChange={e => setText(e.target.value)}
                    onKeyDown={onKeyDown}
                />
                {busy
                    ? <button className="btn btn-warning" style={{ marginLeft: '6px' }} onClick={cancel}>Stop</button>
                    : <button className="btn btn-primary" style={{ marginLeft: '6px' }} onClick={submit} disabled={!text.trim()}>Send</button>}
                {pending && !busy
                    ? <button className="btn btn-default" style={{ marginLeft: '6px' }} onClick={cancel} title="Drop the question">Cancel</button>
                    : null}
            </div>
        </div>
    )
}
