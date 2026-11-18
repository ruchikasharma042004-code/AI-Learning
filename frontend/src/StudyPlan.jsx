import { useState } from 'react'
import axios from 'axios'
import { useLanguage } from './i18n.jsx'

const API = import.meta.env.VITE_API_URL || '/api'
const api = axios.create({ baseURL: API })

function StudyPlan({ token }) {
  const { languageName } = useLanguage()
  const hindi = languageName === 'Hindi'
  const [open, setOpen] = useState(false)
  const [plan, setPlan] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const copy = hindi ? { button: 'अध्ययन योजना', title: 'आपकी व्यक्तिगत अध्ययन योजना', intro: 'आपके प्रदर्शन के आधार पर अगले सात दिनों की योजना।', build: 'नई योजना बनाएं', building: 'योजना बन रही है...', target: 'लक्ष्य क्षेत्र', empty: 'अभी अध्ययन योजना नहीं बनी है।', close: 'बंद करें', error: 'अध्ययन योजना उपलब्ध नहीं है।' } : { button: 'Study plan', title: 'Your personalized study plan', intro: 'A focused seven-day plan based on your performance.', build: 'Build new plan', building: 'Building plan...', target: 'Target area', empty: 'No study plan has been generated yet.', close: 'Close', error: 'The study plan is temporarily unavailable.' }
  const loadPlan = async () => {
    setBusy(true); setError('')
    try { const { data } = await api.get('/study-plan', { headers: { Authorization: `Bearer ${token}` } }); setPlan(data.plan) } catch (requestError) { if (requestError.response?.status !== 404) setError(requestError.response?.data?.error || copy.error) } finally { setBusy(false) }
  }
  const openPlan = async () => { setOpen(true); if (!plan) await loadPlan() }
  const buildPlan = async () => {
    setBusy(true); setError('')
    try { const { data } = await api.post('/study-plan', { language: languageName }, { headers: { Authorization: `Bearer ${token}` } }); setPlan(data.plan) } catch (requestError) { setError(requestError.response?.data?.error || copy.error) } finally { setBusy(false) }
  }
  return <><button className="study-plan-launch" onClick={openPlan} title={copy.button}>✦ <span>{copy.button}</span></button>{open && <div className="study-plan-backdrop" onClick={() => setOpen(false)}><section className="study-plan-drawer" onClick={(event) => event.stopPropagation()}><header><div><p className="eyebrow accent">{copy.button}</p><h2>{copy.title}</h2><p className="muted">{copy.intro}</p></div><button className="study-plan-close" onClick={() => setOpen(false)} aria-label={copy.close}>×</button></header>{plan ? <><div className="study-plan-target"><small>{copy.target}</small><strong>{plan.target.subject}</strong><span>{plan.target.topic} · {plan.target.score}%</span></div><div className="study-plan-days">{plan.days.map((day) => <article key={day.day}><span>{day.day}</span><div><b>{day.focus}</b><p>{day.task}</p></div></article>)}</div></> : <div className="study-plan-empty"><p>{error || copy.empty}</p><button className="primary" onClick={buildPlan} disabled={busy}>{busy ? copy.building : copy.build} <span>→</span></button></div>}</section></div>}</>
}

export default StudyPlan
