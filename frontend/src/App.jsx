import { useCallback, useState } from 'react'
import axios from 'axios'
import Dashboard from './Dashboard.jsx'
import QuizGenerator from './QuizGenerator.jsx'
import AiTutor from './AiTutor.jsx'
import StudyPlan from './StudyPlan.jsx'
import { LanguageProvider, LanguageSelector, useLanguage } from './i18n.jsx'
import './App.css'
import './Auth.css'

const API = import.meta.env.VITE_API_URL || '/api'
const api = axios.create({ baseURL: API })
const emptyForm = { name: '', email: '', password: '' }

function AuthPage({ onAuthenticated }) {
  const [mode, setMode] = useState('login')
  const [form, setForm] = useState(emptyForm)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const { t, languageName } = useLanguage()
  const updateField = (event) => setForm((current) => ({ ...current, [event.target.name]: event.target.value }))
  const submit = async (event) => {
    event.preventDefault()
    setError('')
    if (mode === 'register' && form.name.trim().length < 2) return setError(t('invalidName'))
    if (!form.email.includes('@')) return setError(t('invalidEmail'))
    if (form.password.length < 8) return setError(t('invalidPassword'))
    setBusy(true)
    try {
      const { data } = await api.post(mode === 'register' ? '/auth/register' : '/auth/login', form)
      onAuthenticated(data)
    } catch (requestError) {
      const status = requestError.response?.status
      if (status === 401) setError(languageName === 'Hindi' ? 'ईमेल या पासवर्ड गलत है।' : 'Invalid email or password.')
      else if (status === 409) setError(languageName === 'Hindi' ? 'यह ईमेल पहले से पंजीकृत है।' : 'This email is already registered.')
      else setError(t('connectionError'))
    } finally {
      setBusy(false)
    }
  }
  return <main className="auth-shell">
    <section className="auth-story"><div className="brand"><span className="brand-mark">L</span><span>Learnlytics</span></div><div className="auth-story-copy"><p className="eyebrow accent">{t('personalizedLearning')}</p><h1>{t('progressVisible')} <em>{t('visible')}</em></h1><p>{t('understandPerformance')}</p></div><small>{t('secureWorkspace')}</small></section>
    <section className="auth-card"><LanguageSelector /><p className="eyebrow accent">{mode === 'login' ? t('welcomeBack') : t('getStarted')}</p><h2>{mode === 'login' ? t('signInWorkspace') : t('createAccount')}</h2><p className="muted">{mode === 'login' ? t('pickUp') : t('privateAccount')}</p><div className="auth-tabs"><button className={mode === 'login' ? 'selected' : ''} onClick={() => { setMode('login'); setError('') }}>{t('signIn')}</button><button className={mode === 'register' ? 'selected' : ''} onClick={() => { setMode('register'); setError('') }}>{t('register')}</button></div><form onSubmit={submit}>{mode === 'register' && <label>{t('fullName')}<input name="name" value={form.name} onChange={updateField} placeholder={t('namePlaceholder')} autoComplete="name" /></label>}<label>{t('email')}<input name="email" type="email" value={form.email} onChange={updateField} placeholder="you@example.com" autoComplete="email" /></label><label>{t('password')}<input name="password" type="password" value={form.password} onChange={updateField} placeholder={t('passwordPlaceholder')} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} /></label>{error && <p className="form-error" role="alert">{error}</p>}<button className="primary full" disabled={busy}>{busy ? t('wait') : mode === 'login' ? t('openDashboard') : t('createAccountButton')} <span>→</span></button></form></section>
  </main>
}

function AppContent() {
  const [session, setSession] = useState(() => ({ token: localStorage.getItem('learnlytics_token'), user: JSON.parse(localStorage.getItem('learnlytics_user') || 'null') }))
  const onAuthenticated = ({ token, user }) => { localStorage.setItem('learnlytics_token', token); localStorage.setItem('learnlytics_user', JSON.stringify(user)); setSession({ token, user }) }
  const onLogout = useCallback(() => { localStorage.removeItem('learnlytics_token'); localStorage.removeItem('learnlytics_user'); setSession({ token: null, user: null }) }, [])
  if (!session.token || !session.user) return <AuthPage onAuthenticated={onAuthenticated} />
  return <><div className="app-language-selector"><LanguageSelector /></div><Dashboard user={session.user} token={session.token} onLogout={onLogout} /><QuizGenerator token={session.token} /><AiTutor token={session.token} /><StudyPlan token={session.token} /></>
}

function App() { return <LanguageProvider><AppContent /></LanguageProvider> }
export default App
