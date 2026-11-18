# AI-Based Personalized Learning and Student Performance Analysis System

A full-stack B.Tech project starter for personalized learning analytics.

## Stack

- Frontend: React, Vite, JavaScript, Tailwind CSS, Recharts, Axios
- Backend: Node.js, Express, Zod, dotenv
- Database: SQLite via better-sqlite3
- Security: JWT and bcrypt
- AI: Google Gemini API called only by the backend

## Run locally

Terminal 1:

```powershell
cd backend
npm run dev
```

Terminal 2:

```powershell
cd frontend
npm run dev
```

Open http://localhost:5173. The API health endpoint is http://localhost:5000/api/health.

Copy `backend/.env.example` when setting up another machine. Add a Gemini API key to `backend/.env` to enable the AI analysis endpoint; never add it to frontend environment files.
