// Client for agent-harness (agent-harness/ARCHITECTURE.md §4a): nodeReact mints a short-lived JWT,
// then the browser talks to /api/agent/* directly (nginx → agent-api) and streams via EventSource.
import { useCallback, useEffect, useRef, useState } from 'react'

let cached = { token: null, exp: 0 }

export const resetAgentToken = () => { cached = { token: null, exp: 0 } }

export async function getAgentToken() {
    if (cached.token && Date.now() < cached.exp - 60000) {
        return cached.token
    }
    const r = await fetch('/api/agent-token', { credentials: 'include' })
    if (!r.ok) {
        throw new Error(`agent token: ${r.status}`)
    }
    const { token, expiresIn } = await r.json()
    cached = { token, exp: Date.now() + expiresIn * 1000 }
    return token
}

export async function agentApi(path, opts = {}) {
    const token = await getAgentToken()
    const r = await fetch(`/api/agent${path}`, {
        ...opts,
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...(opts.headers || {}) },
    })
    if (!r.ok) {
        throw new Error(`${path}: ${r.status} ${await r.text()}`)
    }
    return r.json()
}

const parse = data => {
    try {
        return JSON.parse(data)
    } catch (e) {
        return data
    }
}

export function useAgentThread(threadId) {
    const [messages, setMessages] = useState([])
    const [run, setRun] = useState(null)
    const [error, setError] = useState(null)
    const esRef = useRef(null)

    const closeStream = () => {
        if (esRef.current) {
            esRef.current.close()
            esRef.current = null
        }
    }

    useEffect(() => {
        let alive = true
        setMessages([])
        setRun(null)
        setError(null)
        // Prepend history so messages sent before it arrives are kept.
        agentApi(`/threads/${threadId}`).then(t => alive && setMessages(m => [...t.messages, ...m])).catch(err => alive && setError(err.message))
        return () => {
            alive = false
            closeStream()
        }
    }, [threadId])

    const send = useCallback(async text => {
        setError(null)
        setMessages(m => [...m, { role: 'user', content: text }, { role: 'assistant', content: '' }])
        let res
        try {
            res = await agentApi(`/threads/${threadId}/runs`, {
                method: 'POST',
                body: JSON.stringify({ text, client_msg_id: `${threadId}-${Date.now()}` }),
            })
        } catch (err) {
            setMessages(m => m.slice(0, -1))
            setError(err.message)
            return
        }
        if (res.command_reply) {
            setMessages(m => [...m.slice(0, -1), { role: 'assistant', content: res.command_reply }])
            return
        }
        setRun({ id: res.run_id, decision: res.decision, status: 'queued' })
        const token = await getAgentToken()
        closeStream()
        const es = new EventSource(`/api/agent/runs/${res.run_id}/stream?token=${encodeURIComponent(token)}`)
        esRef.current = es
        const updateLast = fn => setMessages(m => [...m.slice(0, -1), fn(m[m.length - 1])])
        es.addEventListener('decision', e => setRun(r => ({ ...r, decision: parse(e.data) })))
        es.addEventListener('status', e => setRun(r => ({ ...r, status: parse(e.data).status || r.status })))
        es.addEventListener('token', e => {
            setRun(r => (r && r.status !== 'running' ? { ...r, status: 'running' } : r))
            updateLast(last => ({ ...last, content: last.content + parse(e.data) }))
        })
        es.addEventListener('tool', e => {
            const d = parse(e.data)
            updateLast(last => ({ ...last, tools: [...(last.tools || []), d.name] }))
        })
        const finish = status => e => {
            const d = e && e.data ? parse(e.data) : {}
            if (status === 'done' && typeof d.text === 'string') {
                updateLast(last => ({ ...last, content: d.text }))
            }
            if (status === 'error') {
                updateLast(last => ({ ...last, content: `${last.content}\n\n⚠️ ${d.message || 'error'}` }))
            }
            if (status === 'cancelled') {
                updateLast(last => ({ ...last, content: `${last.content}\n\n⏹ cancelled` }))
            }
            setRun(r => ({ ...r, status, result: d }))
            closeStream()
        }
        es.addEventListener('done', finish('done'))
        es.addEventListener('cancelled', finish('cancelled'))
        // A server-sent `error` event carries data; a bare transport error does not (EventSource retries itself).
        es.addEventListener('error', e => (e.data ? finish('error')(e) : null))
    }, [threadId])

    const cancel = useCallback(() => {
        if (run && run.id) {
            agentApi(`/runs/${run.id}/cancel`, { method: 'POST' }).catch(err => setError(err.message))
        }
    }, [run])

    return { messages, run, error, send, cancel }
}
