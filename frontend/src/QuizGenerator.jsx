import { useState } from 'react'
import axios from 'axios'
import { useLanguage } from './i18n.jsx'
import './QuizGenerator.css'

const API = import.meta.env.VITE_API_URL || '/api'
const api = axios.create({ baseURL: API })

function QuizGenerator({ token }) {
  const { t, languageName } = useLanguage()
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState({ subject: '', topic: '', difficulty: 'Medium', numberQuestions: 5 })
  const [quiz, setQuiz] = useState(null)
  const [answers, setAnswers] = useState([])
  const [result, setResult] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const update = (event) => setForm((current) => ({ ...current, [event.target.name]: event.target.value }))
  const generate = async (event) => {
    event.preventDefault(); setBusy(true); setError(''); setQuiz(null); setResult(null)
    try { const { data } = await api.post('/ai/generate-quiz', { ...form, numberQuestions: Number(form.numberQuestions), language: languageName }, { headers: { Authorization: `Bearer ${token}` } }); setQuiz(data); setAnswers(Array(data.questions.length).fill('')) } catch (requestError) { setError(requestError.response?.data?.error || t('quizGenerationError')) } finally { setBusy(false) }
  }
  const submit = async (event) => {
    event.preventDefault(); setBusy(true); setError('')
    if (answers.some((answer) => !answer)) { setError(t('answerEvery')); setBusy(false); return }
    try { const { data } = await api.post('/quiz/submit', { subject: quiz.subject, topic: quiz.topic, questions: quiz.questions, answers }, { headers: { Authorization: `Bearer ${token}` } }); setResult(data); window.dispatchEvent(new Event('quiz-saved')) } catch (requestError) { setError(requestError.response?.data?.error || t('quizSubmissionError')) } finally { setBusy(false) }
  }
  return <><button className="quiz-launch" onClick={() => setOpen(true)} title={t('aiQuiz')}>✦ <span>{t('aiQuiz')}</span></button>{open && <div className="quiz-backdrop" onClick={() => setOpen(false)}><section className="quiz-drawer" onClick={(event) => event.stopPropagation()}><button className="quiz-close" onClick={() => setOpen(false)} aria-label={t('dismiss')}>×</button>{!quiz && !result && <><p className="eyebrow accent">{t('aiQuiz')}</p><h2>{t('testUnderstanding')}</h2><p className="muted">{t('quizIntro')}</p><form className="quiz-form" onSubmit={generate}><label>{t('subject')}<input name="subject" value={form.subject} onChange={update} placeholder={t('subjectPlaceholder')} required /></label><label>{t('topic')}<input name="topic" value={form.topic} onChange={update} placeholder={t('topicPlaceholder')} required /></label><label>{t('difficulty')}<select name="difficulty" value={form.difficulty} onChange={update}><option value="Easy">{t('easy')}</option><option value="Medium">{t('medium')}</option><option value="Hard">{t('hard')}</option></select></label><label>{t('numberQuestions')}<input name="numberQuestions" type="number" min="1" max="20" value={form.numberQuestions} onChange={update} required /></label>{error && <p className="quiz-error" role="alert">{error}</p>}<button className="primary full" disabled={busy}>{busy ? t('generatingQuiz') : t('generateQuiz')} <span>→</span></button></form></>}{quiz && !result && <form onSubmit={submit}><p className="eyebrow accent">{quiz.subject} · {quiz.difficulty}</p><h2>{quiz.topic}</h2><p className="muted">{quiz.questions.length} {t('generatedQuestions')}</p><div className="questions">{quiz.questions.map((item, index) => <fieldset key={item.question}><legend>{index + 1}. {item.question}</legend>{item.options.map((option) => <label className="option" key={option}><input type="radio" name={`question-${index}`} value={option} checked={answers[index] === option} onChange={() => setAnswers((current) => current.map((answer, answerIndex) => answerIndex === index ? option : answer))} />{option}</label>)}</fieldset>)}</div>{error && <p className="quiz-error" role="alert">{error}</p>}<button className="primary full" disabled={busy}>{busy ? t('wait') : t('submitQuiz')} <span>→</span></button></form>}{result && <div className="quiz-result"><p className="eyebrow accent">{t('quizComplete')}</p><h2>{result.percentage}%</h2><p>{result.correctAnswers} {t('correct')} · {result.incorrectAnswers} {t('incorrect')}</p><button className="primary full" onClick={() => { setQuiz(null); setResult(null); setAnswers([]); setError('') }}>{t('backToQuiz')} <span>→</span></button></div>}</section></div>}</>
}

export default QuizGenerator
