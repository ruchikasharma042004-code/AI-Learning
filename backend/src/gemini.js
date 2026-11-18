const { GoogleGenerativeAI } = require('@google/generative-ai');
const { z } = require('zod');

const analysisSchema = z.object({
  summary: z.string(),
  weakSubjects: z.array(z.string()),
  weakTopics: z.array(z.string()),
  strongSubjects: z.array(z.string()),
  performanceTrends: z.array(z.string()),
  reasonsForPoorPerformance: z.array(z.string()),
  topicsToImprove: z.array(z.string()),
  studyPriorities: z.array(z.string()),
  personalizedRecommendations: z.array(z.string()),
});

const quizQuestionSchema = z.object({
  question: z.string().min(1),
  options: z.array(z.string().min(1)).length(4),
  correctAnswer: z.string().min(1),
  explanation: z.string().min(1),
}).superRefine((item, context) => {
  if (!item.options.includes(item.correctAnswer)) context.addIssue({ code: z.ZodIssueCode.custom, message: 'Correct answer must match one option', path: ['correctAnswer'] });
});

const quizSchema = z.object({ questions: z.array(quizQuestionSchema).min(1) });

function timeoutError() {
  const error = new Error('Gemini request timed out');
  error.code = 'GEMINI_TIMEOUT';
  return error;
}

function isInvalidKeyError(error) {
  const message = String(error?.message || '').toLowerCase();
  return [400, 401, 403].includes(error?.status) || message.includes('api key') || message.includes('permission denied') || message.includes('unauthenticated');
}

function parseModelJson(text) {
  const cleaned = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  try {
    return analysisSchema.parse(JSON.parse(cleaned));
  } catch {
    const error = new Error('Gemini returned invalid structured analysis');
    error.code = 'GEMINI_INVALID_RESPONSE';
    throw error;
  }
}

function getModel(responseMimeType = 'application/json') {
  if (!process.env.GEMINI_API_KEY) {
    const error = new Error('GEMINI_API_KEY is not configured');
    error.code = 'GEMINI_NOT_CONFIGURED';
    throw error;
  }
  const client = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  return client.getGenerativeModel({ model: process.env.GEMINI_MODEL || 'gemini-3.6-flash', generationConfig: { responseMimeType } });
}

async function answerEducationalQuestion({ message, history = [], language = 'English' }, timeoutMs = 30000) {
  const model = getModel('text/plain');
  const transcript = history.map((item) => `${item.role === 'assistant' ? 'Tutor' : 'Student'}: ${item.content}`).join('\n');
  const prompt = `You are Learnlytics Tutor, a patient educational assistant. Answer the student's question accurately and at an appropriate level. Explain difficult topics step by step, give a concrete example when useful, and help with exam preparation when asked. Encourage understanding rather than just giving an answer. If the question is ambiguous, ask one concise clarifying question. Do not claim to know personal student data, and say when you are uncertain. Use clear paragraphs and simple markdown such as short headings or bullet points. Respond entirely in ${language}.\n\nPrevious conversation:\n${transcript || '(none)'}\n\nStudent's latest question: ${message}`;
  try {
    const result = await Promise.race([model.generateContent(prompt), new Promise((_, reject) => setTimeout(() => reject(timeoutError()), timeoutMs))]);
    const answer = result.response.text().trim();
    if (!answer) {
      const error = new Error('Gemini returned an empty answer');
      error.code = 'GEMINI_INVALID_RESPONSE';
      throw error;
    }
    return answer;
  } catch (error) {
    if (isInvalidKeyError(error)) {
      const invalidKeyError = new Error('Gemini API key is invalid or unauthorized');
      invalidKeyError.code = 'GEMINI_INVALID_KEY';
      throw invalidKeyError;
    }
    throw error;
  }
}

async function analyzePerformance(performanceData, language = 'English', timeoutMs = 20000) {
  const model = getModel();
  const prompt = `You are an academic performance analyst. Analyze only the student's supplied data. Do not invent scores, subjects, or facts. Return valid JSON matching exactly this shape: {"summary":"string","weakSubjects":["string"],"weakTopics":["string"],"strongSubjects":["string"],"performanceTrends":["string"],"reasonsForPoorPerformance":["string"],"topicsToImprove":["string"],"studyPriorities":["string"],"personalizedRecommendations":["string"]}. Keep arrays concise and practical. Explain possible reasons only as cautious hypotheses grounded in the data. Write all string values in ${language}. Student data: ${JSON.stringify(performanceData)}`;
  try {
    const result = await Promise.race([model.generateContent(prompt), new Promise((_, reject) => setTimeout(() => reject(timeoutError()), timeoutMs))]);
    return parseModelJson(result.response.text());
  } catch (error) {
    if (isInvalidKeyError(error)) {
      const invalidKeyError = new Error('Gemini API key is invalid or unauthorized');
      invalidKeyError.code = 'GEMINI_INVALID_KEY';
      throw invalidKeyError;
    }
    throw error;
  }
}

async function generateQuiz({ subject, topic, difficulty, numberQuestions, language = 'English' }, timeoutMs = 30000) {
  const model = getModel();
  const prompt = `Create exactly ${numberQuestions} ${difficulty}-difficulty multiple-choice questions for the subject "${subject}" and topic "${topic}". Return valid JSON with exactly this shape: {"questions":[{"question":"string","options":["string","string","string","string"],"correctAnswer":"one exact option string","explanation":"short explanation"}]}. Use four distinct options per question. Do not include markdown, numbering outside the JSON, or facts unrelated to the requested topic. Write all question text and explanations in ${language}.`;
  try {
    const result = await Promise.race([model.generateContent(prompt), new Promise((_, reject) => setTimeout(() => reject(timeoutError()), timeoutMs))]);
    const cleaned = result.response.text().trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
    const parsed = quizSchema.parse(JSON.parse(cleaned));
    if (parsed.questions.length !== numberQuestions) {
      const error = new Error('Gemini returned an incorrect number of questions');
      error.code = 'GEMINI_INVALID_RESPONSE';
      throw error;
    }
    return parsed;
  } catch (error) {
    if (isInvalidKeyError(error)) {
      const invalidKeyError = new Error('Gemini API key is invalid or unauthorized');
      invalidKeyError.code = 'GEMINI_INVALID_KEY';
      throw invalidKeyError;
    }
    if (error instanceof z.ZodError || error instanceof SyntaxError) {
      const invalidResponseError = new Error('Gemini returned invalid quiz structure');
      invalidResponseError.code = 'GEMINI_INVALID_RESPONSE';
      throw invalidResponseError;
    }
    throw error;
  }
}

module.exports = { analyzePerformance, answerEducationalQuestion, generateQuiz };
