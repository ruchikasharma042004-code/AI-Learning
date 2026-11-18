import { useState } from 'react'
import axios from 'axios'
import { useLanguage } from './i18n.jsx'
import './AiTutor.css'

const API = import.meta.env.VITE_API_URL || '/api'
const api = axios.create({ baseURL: API })

function AiTutor({ token }) {
  const { t, languageName } = useLanguage()
  const [open, setOpen] = useState(false)
  const [input, setInput] = useState('')
  const [messages, setMessages] = useState([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const ask = async (event) => {
    event.preventDefault()
    const message = input.trim()
    if (!message || busy) return
    const nextMessages = [...messages, { role: 'user', content: message }]
    setMessages(nextMessages)
    setInput('')
    setError('')
    setBusy(true)
    try {
      const { data } = await api.post('/ai/chat', { message, history: messages, language: languageName }, { headers: { Authorization: `Bearer ${token}` } })
      setMessages([...nextMessages, { role: 'assistant', content: data.answer }])
    } catch (requestError) {
      setError(requestError.response?.data?.error || t('tutorError'))
    } finally {
      setBusy(false)
    }
  }

  const startPrompt = (prompt) => setInput(prompt === t('explainTopic') ? t('explainPrefix') : `${prompt}: `)

  return <>
    <button className="tutor-launch" onClick={() => setOpen(true)} title={t('aiTutor')}><span>✦</span><span>{t('aiTutor')}</span></button>
    {open && <div className="tutor-backdrop" onClick={() => setOpen(false)}><section className="tutor-drawer" onClick={(event) => event.stopPropagation()} aria-label={t('tutorAssistant')}>
      <header className="tutor-header"><div><p className="eyebrow accent">{t('tutorAssistant')}</p><h2>{t('studyWithHelp')}</h2><p className="muted">{t('askAbout')}</p></div><button className="tutor-close" onClick={() => setOpen(false)} aria-label={t('dismiss')}>×</button></header>
      <div className="tutor-messages" aria-live="polite">
        {!messages.length && <div className="tutor-welcome"><span className="tutor-spark">✦</span><h3>{t('tutorWelcome')}</h3><p>{t('studyHelp')}</p><div className="starter-prompts">{[t('explainTopic'), t('giveExample'), t('examPrep')].map((prompt) => <button key={prompt} onClick={() => startPrompt(prompt)}>{prompt}<span>↗</span></button>)}</div></div>}
        {messages.map((item, index) => <div className={`tutor-message ${item.role}`} key={`${item.role}-${index}`}><span className="message-label">{item.role === 'assistant' ? t('tutor') : t('you')}</span><p>{item.content}</p></div>)}
        {busy && <div className="tutor-message assistant"><span className="message-label">{t('tutor')}</span><p className="typing"><i /> <i /> <i /></p></div>}
      </div>
      {error && <div className="tutor-error" role="alert"><span>{error}</span><button onClick={() => setError('')}>{t('dismiss')}</button></div>}
      <form className="tutor-composer" onSubmit={ask}><textarea value={input} onChange={(event) => setInput(event.target.value)} placeholder={t('askQuestion')} rows="2" maxLength="2000" disabled={busy} aria-label={t('askQuestion')} /><div><small>{input.length}/2000</small><button className="primary" disabled={busy || !input.trim()}>{busy ? t('thinking') : t('askTutor')} <span>↑</span></button></div></form>
    </section></div>}
  </>
}

export default AiTutor
