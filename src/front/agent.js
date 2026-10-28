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
    // An open clarifying question from the grounded graph: { run_id, round, question, options }.
    const [pending, setPending] = useState(null)
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
        setPending(null)
        if (!threadId) {
            return undefined
        }
        // Prepend history so messages sent before it arrives are kept.
        agentApi(`/threads/${threadId}`).then(t => {
            if (!alive) {
                return
            }
            setMessages(m => [...t.messages, ...m])
            setPending(t.pending || null)
        }).catch(err => alive && setError(err.message))
        return () => {
            alive = false
            closeStream()
        }
    }, [threadId])

    // Stream a run's events into the last (assistant) message.
    const follow = useCallback(async res => {
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
        // The answer is being rewritten (e.g. a citation fix): drop what was streamed so far.
        es.addEventListener('reset', () => updateLast(last => ({ ...last, content: '' })))
        es.addEventListener('tool', e => {
            const d = parse(e.data)
            updateLast(last => ({ ...last, tools: [...(last.tools || []), d.name] }))
        })
        es.addEventListener('interrupt', e => {
            const d = parse(e.data)
            const options = d.options || []
            updateLast(last => ({ ...last, content: d.question + options.map((o, i) => `\n${i + 1}. ${o}`).join('') }))
            setPending({ run_id: d.run_id || res.run_id, round: d.round, question: d.question, options })
            setRun(r => ({ ...r, status: 'awaiting_input', result: d }))
            closeStream()
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
    }, [])

    const post = useCallback(async (shown, path, body) => {
        setError(null)
        setMessages(m => [...m, { role: 'user', content: shown }, { role: 'assistant', content: '' }])
        let res
        try {
            res = await agentApi(path, { method: 'POST', body: JSON.stringify(body) })
        } catch (err) {
            setMessages(m => m.slice(0, -1))
            setError(err.message)
            return
        }
        await follow(res)
    }, [follow])

    // Answer the open clarifying question: an option number, free text, or '' to skip (answer with an assumption).
    const resume = useCallback(async value => {
        const p = pending
        if (!p) {
            return
        }
        const v = String(value == null ? '' : value).trim()
        const n = /^\d+$/.test(v) ? Number(v) : 0
        const shown = !v || v === '/skip' ? '/skip' : (n >= 1 && n <= p.options.length ? p.options[n - 1] : v)
        setPending(null)
        await post(shown, `/runs/${p.run_id}/resume`, { value: v === '/skip' ? '' : v })
    }, [pending, post])

    const skip = useCallback(() => resume(''), [resume])

    const send = useCallback(async text => {
        if (pending) {
            return resume(text)
        }
        return post(text, `/threads/${threadId}/runs`, { text, client_msg_id: `${threadId}-${Date.now()}` })
    }, [threadId, pending, resume, post])

    const cancel = useCallback(() => {
        const id = pending ? pending.run_id : run && run.id
        if (id) {
            agentApi(`/runs/${id}/cancel`, { method: 'POST' }).catch(err => setError(err.message))
        }
        if (pending) {
            setPending(null)
            setRun(r => (r ? { ...r, status: 'cancelled' } : r))
        }
    }, [run, pending])

    return { messages, run, error, pending, send, resume, skip, cancel }
}
