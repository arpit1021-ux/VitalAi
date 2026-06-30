# VitalAI — AI-Powered Family Nutrition Assistant

> A full-stack AI platform that manages family nutrition with personalized diet plans, barcode scanning, and a RAG-based multilingual nutrition chatbot.

## What It Does

VitalAI helps families manage nutrition by:
- Supporting **up to 6 family profiles** with individual diet types, allergens, and health conditions
- **Barcode scanning** using OCR + Claude API to flag risky ingredients against a user's health profile
- **AI recipe generation** from pantry inventory, merging multiple family members' dietary restrictions into one compliant recipe
- **RAG-based chatbot** (Pinecone + Claude API) for multilingual nutrition Q&A

## Key Features

- **Multi-Profile Management** — Each family member gets their own profile with diet type, allergens, and health conditions
- **Barcode Scanner** — Scan product barcodes, extract ingredients via OCR, and check them against health profiles for risks
- **AI Recipe Generator** — Input pantry items → get recipes that satisfy ALL family members' restrictions simultaneously
- **Nutrition Chatbot** — RAG-powered assistant using Pinecone vector store and Claude API for contextual, multilingual nutrition advice
- **Daily Activity Logging** — Track meals, water intake, and nutrition goals per profile
- **JWT Authentication** — Secure per-user data isolation

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React.js, Next.js, TypeScript, Tailwind CSS, Framer Motion |
| Backend | Node.js, Express, REST APIs |
| Database | MongoDB (Mongoose) |
| AI/ML | Claude API, Pinecone (Vector DB), RAG Pipeline |
| OCR | Tesseract.js for barcode/ingredient extraction |
| Auth | JWT Authentication |

## Architecture

```
VitalAi/
├── client/           # Next.js frontend
│   ├── components/   # UI components
│   ├── pages/        # Route pages
│   └── hooks/        # Custom React hooks
├── server/           # Express backend
│   ├── models/       # Mongoose schemas
│   ├── routes/       # API routes
│   └── services/     # AI integration, OCR, RAG
└── .env.example
```

## How the RAG Chatbot Works

1. User asks a nutrition question (in any supported language)
2. Query is embedded and sent to Pinecone vector store
3. Top-K relevant nutrition documents are retrieved
4. Context + question is sent to Claude API
5. Response is generated with citations from the knowledge base

## How the Recipe Generator Works

1. User inputs available pantry items
2. System fetches all family profiles' dietary restrictions
3. AI generates recipes that:
   - Use only available ingredients
   - Avoid all allergens across all profiles
   - Meet all health condition requirements
   - Are nutritionally balanced

## Getting Started

```bash
git clone https://github.com/arpit1021-ux/VitalAi.git
cd VitalAi

# Install client dependencies
cd client && npm install

# Install server dependencies
cd ../server && npm install

# Set up environment variables
cp .env.example .env  # Add MongoDB, Claude API, Pinecone keys

# Start server
npm run dev

# Start client (in separate terminal)
cd ../client && npm run dev
```

## Environment Variables

```env
# Server
MONGODB_URI=
JWT_SECRET=
CLAUDE_API_KEY=
PINECONE_API_KEY=
PINECONE_INDEX=

# Client
NEXT_PUBLIC_API_URL=http://localhost:5000
```

## What I Learned Building This

- Designing multi-tenant data isolation with MongoDB
- Building RAG pipelines with Pinecone and Claude API
- Implementing OCR-based ingredient extraction
- Merging multiple dietary restriction sets into compliant recipes
- Full-stack MERN + Next.js architecture

---

Built by [Arpit Singh](https://linkedin.com/in/arpitsingh05)
