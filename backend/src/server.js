require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bcrypt = require('bcrypt');
const { z } = require('zod');
const db = require('./db');
const { createToken, requireAuth } = require('./auth');
const { analyzePerformance, answerEducationalQuestion, generateQuiz } = require('./gemini');

const app = express();
const port = Number(process.env.PORT || 5000);
const allowedOrigins = new Set([process.env.CLIENT_URL || 'http://localhost:5173', 'http://localhost:5173', 'http://127.0.0.1:5173']);
app.use(cors({ origin: (origin, callback) => callback(null, !origin || allowedOrigins.has(origin)) }));
app.use(express.json());

const credentials = z.object({ name: z.string().min(2).max(80).optional(), email: z.string().email(), password: z.string().min(8).max(100) });
const recordInput = z.object({ subject: z.string().min(2).max(80), topic: z.string().max(120).optional().default(''), marks: z.number().min(0), totalMarks: z.number().positive().optional().default(100), studyHours: z.number().min(0).optional().default(0), score: z.number().min(0).max(100).optional() });
const quizInput = z.object({ subject: z.string().min(2).max(80), topic: z.string().max(120).optional().default(''), score: z.number().min(0), totalQuestions: z.number().int().positive() });
const quizGenerationInput = z.object({ subject: z.string().min(2).max(80), topic: z.string().min(2).max(120), difficulty: z.enum(['Easy', 'Medium', 'Hard']), numberQuestions: z.number().int().min(1).max(20), language: z.enum(['English', 'Hindi']).optional().default('English') });
const quizSubmissionInput = z.object({ subject: z.string().min(2).max(80), topic: z.string().min(2).max(120), questions: z.array(z.object({ question: z.string().min(1), options: z.array(z.string()).length(4), correctAnswer: z.string().min(1), explanation: z.string().min(1) })).min(1), answers: z.array(z.string()).min(1) });
const chatInput = z.object({ message: z.string().trim().min(1).max(2000), history: z.array(z.object({ role: z.enum(['user', 'assistant']), content: z.string().trim().min(1).max(4000) })).max(20).optional().default([]), language: z.enum(['English', 'Hindi']).optional().default('English') });
const languageInput = z.object({ language: z.enum(['English', 'Hindi']).optional().default('English') });

function buildStudyPlan(userId, language) {
  const performance = db.prepare('SELECT subject, topic, ROUND(SUM(marks) * 100.0 / NULLIF(SUM(total_marks), 0), 2) AS score, ROUND(SUM(study_hours), 2) AS studyHours FROM performance WHERE user_id = ? GROUP BY subject, topic ORDER BY score ASC').all(userId);
  const quizzes = db.prepare('SELECT subject, topic, ROUND(SUM(score) * 100.0 / NULLIF(SUM(total_questions), 0), 2) AS score FROM quiz_results WHERE user_id = ? GROUP BY subject, topic ORDER BY score ASC').all(userId);
  if (!performance.length && !quizzes.length) return null;
  const weakest = performance[0] || quizzes[0];
  const subject = weakest.subject;
  const topic = weakest.topic || (language === 'Hindi' ? 'मुख्य अवधारणाएं' : 'core concepts');
  const hindi = language === 'Hindi';
  const days = hindi
    ? [{ day: 'दिन 1', focus: `${subject}: ${topic}`, task: 'अवधारणाओं की समीक्षा करें और संक्षिप्त नोट्स बनाएं।' }, { day: 'दिन 2', focus: 'सक्रिय अभ्यास', task: '10 लक्षित अभ्यास प्रश्न हल करें और गलतियों को लिखें।' }, { day: 'दिन 3', focus: 'कमज़ोर बिंदु', task: 'गलत उत्तरों की समीक्षा करें और कठिन भाग दोहराएं।' }, { day: 'दिन 4', focus: 'क्विज़ तैयारी', task: 'एक नया AI क्विज़ पूरा करें और परिणाम दर्ज करें।' }, { day: 'दिन 5', focus: 'अनुप्रयोग', task: 'वास्तविक उदाहरणों पर सीखी हुई अवधारणाओं का प्रयोग करें।' }, { day: 'दिन 6', focus: 'पुनरावृत्ति', task: 'फ्लैशकार्ड या स्मरण अभ्यास से मुख्य सूत्र दोहराएं।' }, { day: 'दिन 7', focus: 'साप्ताहिक समीक्षा', task: 'अपनी प्रगति देखें और अगले सप्ताह का लक्ष्य तय करें।' }]
    : [{ day: 'Day 1', focus: `${subject}: ${topic}`, task: 'Review the core concepts and write concise notes.' }, { day: 'Day 2', focus: 'Active practice', task: 'Complete 10 targeted practice questions and record mistakes.' }, { day: 'Day 3', focus: 'Weak points', task: 'Review incorrect answers and revisit difficult sections.' }, { day: 'Day 4', focus: 'Quiz readiness', task: 'Complete a new AI quiz and record the result.' }, { day: 'Day 5', focus: 'Application', task: 'Apply the concepts to real examples or exam-style problems.' }, { day: 'Day 6', focus: 'Revision', task: 'Review key formulas and ideas with flashcards or recall practice.' }, { day: 'Day 7', focus: 'Weekly review', task: 'Check your progress and set next week’s learning target.' }];
  return { language, target: { subject, topic, score: weakest.score }, days, generatedAt: new Date().toISOString() };
}

app.get('/api/health', (_req, res) => res.json({ status: 'ok', service: 'learning-analytics-api', database: 'sqlite' }));

app.post('/api/auth/register', async (req, res) => {
  const parsed = credentials.safeParse(req.body);
  if (!parsed.success || !parsed.data.name) return res.status(400).json({ error: 'Name, valid email, and password of 8+ characters are required' });
  try {
    const passwordHash = await bcrypt.hash(parsed.data.password, 12);
    const result = db.prepare('INSERT INTO users (name, email, password, password_hash) VALUES (?, ?, ?, ?)').run(parsed.data.name, parsed.data.email.toLowerCase(), passwordHash, passwordHash);
    const user = { id: result.lastInsertRowid, name: parsed.data.name, email: parsed.data.email.toLowerCase(), role: 'student' };
    res.status(201).json({ user, token: createToken(user) });
  } catch (error) {
    res.status(error.code === 'SQLITE_CONSTRAINT_UNIQUE' ? 409 : 500).json({ error: error.code === 'SQLITE_CONSTRAINT_UNIQUE' ? 'Email is already registered' : 'Could not create account' });
  }
});

app.post('/api/auth/login', async (req, res) => {
  const parsed = credentials.omit({ name: true }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Valid email and password are required' });
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(parsed.data.email.toLowerCase());
  if (!user || !(await bcrypt.compare(parsed.data.password, user.password))) return res.status(401).json({ error: 'Invalid email or password' });
  const safeUser = { id: user.id, name: user.name, email: user.email, role: user.role };
  res.json({ user: safeUser, token: createToken(safeUser) });
});

app.get('/api/performance', requireAuth, (req, res) => {
  const records = db.prepare('SELECT id, subject, topic, marks, total_marks AS totalMarks, study_hours AS studyHours, ROUND(marks * 100.0 / total_marks, 2) AS score, created_at AS createdAt FROM performance WHERE user_id = ? ORDER BY created_at DESC, id DESC').all(req.user.sub);
  res.json({ records });
});

app.get('/api/performance/summary', requireAuth, (req, res) => {
  const summary = db.prepare('SELECT COALESCE(ROUND(SUM(marks) * 100.0 / NULLIF(SUM(total_marks), 0), 2), 0) AS overallPerformance, COALESCE(ROUND(AVG(marks), 2), 0) AS averageMarks, COALESCE(ROUND(AVG(total_marks), 2), 0) AS averageTotalMarks, COALESCE(ROUND(SUM(study_hours), 2), 0) AS studyHours, COUNT(*) AS performanceCount FROM performance WHERE user_id = ?').get(req.user.sub);
  res.json({ summary });
});

app.post('/api/performance', requireAuth, (req, res) => {
  const parsed = recordInput.safeParse(req.body);
  if (!parsed.success || (parsed.data.marks > parsed.data.totalMarks)) return res.status(400).json({ error: 'Subject, valid marks, and total marks are required' });
  const marks = parsed.data.score === undefined ? parsed.data.marks : parsed.data.score;
  const result = db.prepare('INSERT INTO performance (user_id, subject, topic, marks, total_marks, study_hours) VALUES (?, ?, ?, ?, ?, ?)').run(req.user.sub, parsed.data.subject, parsed.data.topic, marks, parsed.data.totalMarks, parsed.data.studyHours);
  res.status(201).json({ id: result.lastInsertRowid, ...parsed.data, marks, totalMarks: parsed.data.totalMarks });
});

app.post('/api/quiz-results', requireAuth, (req, res) => {
  const parsed = quizInput.safeParse(req.body);
  if (!parsed.success || parsed.data.score > parsed.data.totalQuestions) return res.status(400).json({ error: 'Subject, valid score, and total questions are required' });
  const result = db.prepare('INSERT INTO quiz_results (user_id, subject, topic, score, total_questions) VALUES (?, ?, ?, ?, ?)').run(req.user.sub, parsed.data.subject, parsed.data.topic, parsed.data.score, parsed.data.totalQuestions);
  res.status(201).json({ id: result.lastInsertRowid, ...parsed.data });
});

app.post('/api/ai/generate-quiz', requireAuth, async (req, res) => {
  const parsed = quizGenerationInput.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Subject, topic, difficulty, and 1-20 questions are required' });
  try {
    const quiz = await generateQuiz(parsed.data);
    res.json({ subject: parsed.data.subject, topic: parsed.data.topic, difficulty: parsed.data.difficulty, ...quiz });
  } catch (error) {
    const statusByCode = { GEMINI_NOT_CONFIGURED: 503, GEMINI_INVALID_KEY: 502, GEMINI_TIMEOUT: 504, GEMINI_INVALID_RESPONSE: 502 };
    const status = statusByCode[error.code] || 502;
    console.error('Quiz generation failed:', error.code || error.message);
    res.status(status).json({ error: status === 503 ? 'Gemini AI is not configured on the backend' : status === 504 ? 'Quiz generation timed out' : status === 502 && error.code === 'GEMINI_INVALID_KEY' ? 'Gemini API key is invalid or unauthorized' : 'Quiz generation is temporarily unavailable' });
  }
});

app.post('/api/ai/chat', requireAuth, async (req, res) => {
  const parsed = chatInput.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Enter a question of up to 2,000 characters' });
  try {
    const answer = await answerEducationalQuestion(parsed.data);
    res.json({ answer });
  } catch (error) {
    const statusByCode = { GEMINI_NOT_CONFIGURED: 503, GEMINI_INVALID_KEY: 502, GEMINI_TIMEOUT: 504, GEMINI_INVALID_RESPONSE: 502 };
    const status = statusByCode[error.code] || 502;
    console.error('Tutor chat failed:', error.code || error.message);
    res.status(status).json({ error: status === 503 ? 'Gemini AI is not configured on the backend' : status === 504 ? 'The tutor took too long to respond' : status === 502 && error.code === 'GEMINI_INVALID_KEY' ? 'Gemini API key is invalid or unauthorized' : 'The tutor is temporarily unavailable' });
  }
});

app.post('/api/quiz/submit', requireAuth, (req, res) => {
  const parsed = quizSubmissionInput.safeParse(req.body);
  if (!parsed.success || parsed.data.answers.length !== parsed.data.questions.length) return res.status(400).json({ error: 'A selected answer is required for every generated question' });
  const correctAnswers = parsed.data.questions.reduce((count, question, index) => count + (parsed.data.answers[index] === question.correctAnswer ? 1 : 0), 0);
  const totalQuestions = parsed.data.questions.length;
  const result = db.prepare('INSERT INTO quiz_results (user_id, subject, topic, score, total_questions) VALUES (?, ?, ?, ?, ?)').run(req.user.sub, parsed.data.subject, parsed.data.topic, correctAnswers, totalQuestions);
  res.status(201).json({ id: result.lastInsertRowid, score: correctAnswers, totalQuestions, percentage: Math.round(correctAnswers * 100 / totalQuestions), correctAnswers, incorrectAnswers: totalQuestions - correctAnswers });
});

app.get('/api/dashboard', requireAuth, (req, res) => {
  try {
    const userId = req.user.sub;
    const performanceSummary = db.prepare(`SELECT COALESCE(ROUND(SUM(marks) * 100.0 / NULLIF(SUM(total_marks), 0), 2), 0) AS overallPerformance, COALESCE(ROUND(AVG(marks), 2), 0) AS averageMarks, COALESCE(ROUND(AVG(total_marks), 2), 0) AS totalMarks, COALESCE(ROUND(SUM(study_hours), 2), 0) AS studyHours, COUNT(*) AS performanceCount FROM performance WHERE user_id = ?`).get(userId);
    const quizSummary = db.prepare('SELECT COALESCE(ROUND(SUM(score) * 100.0 / NULLIF(SUM(total_questions), 0), 2), 0) AS averageQuizScore, COUNT(*) AS quizCount FROM quiz_results WHERE user_id = ?').get(userId);
    const bySubject = db.prepare(`SELECT subject, ROUND(SUM(marks) * 100.0 / NULLIF(SUM(total_marks), 0), 2) AS score FROM performance WHERE user_id = ? GROUP BY subject ORDER BY score`).all(userId);
    const byTopic = db.prepare(`SELECT subject, topic, ROUND(SUM(marks) * 100.0 / NULLIF(SUM(total_marks), 0), 2) AS score FROM performance WHERE user_id = ? AND topic <> '' GROUP BY subject, topic ORDER BY score`).all(userId);
    const recentQuizResults = db.prepare('SELECT id, subject, topic, score, total_questions AS totalQuestions, substr(created_at, 1, 10) AS createdAt FROM quiz_results WHERE user_id = ? ORDER BY created_at DESC, id DESC LIMIT 8').all(userId);
    const progress = db.prepare(`SELECT substr(created_at, 1, 10) AS label, ROUND(marks * 100.0 / NULLIF(total_marks, 0), 2) AS score FROM performance WHERE user_id = ? ORDER BY created_at ASC, id ASC`).all(userId);
    const recommendations = [];
    if (byTopic[0]) recommendations.push(`Review ${byTopic[0].topic} in ${byTopic[0].subject}; your current topic score is ${byTopic[0].score}%.`);
    if (bySubject[0]) recommendations.push(`Schedule a focused study block for ${bySubject[0].subject}, currently your lowest-scoring subject at ${bySubject[0].score}%.`);
    if (performanceSummary.studyHours > 0 && performanceSummary.studyHours < 5) recommendations.push('Build a consistent study routine by adding at least one more focused hour this week.');
    if (quizSummary.quizCount === 0) recommendations.push('Complete your first quiz to unlock quiz-specific recommendations.');
    res.json({ summary: { ...performanceSummary, ...quizSummary }, weakSubjects: bySubject.slice(0, 3), strongSubjects: bySubject.slice(-3).reverse(), weakTopics: byTopic.slice(0, 5), recentQuizResults, progress, recommendations });
  } catch (error) {
    console.error('Dashboard query failed:', error);
    res.status(500).json({ error: 'Could not load dashboard data' });
  }
});

app.get('/api/study-plan', requireAuth, (req, res) => {
  const latest = db.prepare('SELECT id, plan_data AS planData, created_at AS createdAt FROM study_plans WHERE user_id = ? ORDER BY created_at DESC, id DESC LIMIT 1').get(req.user.sub);
  if (!latest) return res.json({ plan: null });
  res.json({ id: latest.id, createdAt: latest.createdAt, plan: JSON.parse(latest.planData) });
});

app.post('/api/study-plan', requireAuth, (req, res) => {
  const language = languageInput.safeParse(req.body).success ? languageInput.parse(req.body).language : 'English';
  const plan = buildStudyPlan(req.user.sub, language);
  if (!plan) return res.status(422).json({ error: 'Add performance or quiz data before generating a study plan' });
  const result = db.prepare('INSERT INTO study_plans (user_id, plan_data) VALUES (?, ?)').run(req.user.sub, JSON.stringify(plan));
  res.status(201).json({ id: result.lastInsertRowid, plan });
});

app.post('/api/ai/analyze-performance', requireAuth, async (req, res) => {
  const language = languageInput.safeParse(req.body).success ? languageInput.parse(req.body).language : 'English';
  const userId = req.user.sub;
  const records = db.prepare('SELECT subject, topic, marks, total_marks AS totalMarks, study_hours AS studyHours, ROUND(marks * 100.0 / NULLIF(total_marks, 0), 2) AS score, created_at AS createdAt FROM performance WHERE user_id = ? ORDER BY created_at ASC, id ASC').all(userId);
  const quizResults = db.prepare('SELECT subject, topic, score, total_questions AS totalQuestions, created_at AS createdAt FROM quiz_results WHERE user_id = ? ORDER BY created_at ASC, id ASC').all(userId);
  if (!records.length && !quizResults.length) return res.status(422).json({ error: 'Add performance or quiz data before requesting AI analysis' });
  const analysisData = {
    performance: records,
    quizzes: quizResults,
    weakSubjects: db.prepare('SELECT subject, ROUND(SUM(marks) * 100.0 / NULLIF(SUM(total_marks), 0), 2) AS score FROM performance WHERE user_id = ? GROUP BY subject ORDER BY score ASC LIMIT 5').all(userId),
    weakTopics: db.prepare('SELECT subject, topic, ROUND(SUM(marks) * 100.0 / NULLIF(SUM(total_marks), 0), 2) AS score FROM performance WHERE user_id = ? AND topic <> \'\' GROUP BY subject, topic ORDER BY score ASC LIMIT 8').all(userId),
    strongSubjects: db.prepare('SELECT subject, ROUND(SUM(marks) * 100.0 / NULLIF(SUM(total_marks), 0), 2) AS score FROM performance WHERE user_id = ? GROUP BY subject ORDER BY score DESC LIMIT 5').all(userId),
  };
  try {
    const analysis = await analyzePerformance(analysisData, language);
    res.json({ generatedAt: new Date().toISOString(), analysis });
  } catch (error) {
    const statusByCode = { GEMINI_NOT_CONFIGURED: 503, GEMINI_INVALID_KEY: 502, GEMINI_TIMEOUT: 504, GEMINI_INVALID_RESPONSE: 502 };
    const status = statusByCode[error.code] || 502;
    console.error('Gemini analysis failed:', error.code || error.message);
    res.status(status).json({ error: status === 503 ? 'Gemini AI is not configured on the backend' : status === 504 ? 'Gemini AI request timed out' : status === 502 && error.code === 'GEMINI_INVALID_KEY' ? 'Gemini API key is invalid or unauthorized' : 'Gemini AI analysis is temporarily unavailable' });
  }
});

app.post('/api/ai/analyze', requireAuth, async (req, res) => {
  try {
    const records = db.prepare('SELECT subject, ROUND(marks * 100.0 / total_marks, 2) AS score FROM performance WHERE user_id = ?').all(req.user.sub);
    res.json(await analyzePerformance(records));
  } catch (error) {
    res.status(502).json({ error: 'AI analysis is temporarily unavailable' });
  }
});

app.use((error, _req, res, _next) => res.status(500).json({ error: 'Unexpected server error' }));
app.listen(port, () => console.log(`Learning analytics API running on http://localhost:${port}`));
