# VitalAI — AI-Powered Family Nutrition Assistant

Most nutrition apps treat one person. But families eat together — and every member has different restrictions.

I wanted to build something that understands a family as a unit: one person is diabetic, another is lactose intolerant, someone else is vegetarian. VitalAI generates recipes that satisfy everyone simultaneously, scans barcodes to flag dangerous ingredients, and answers nutrition questions in multiple languages.

**Next.js · Express · MongoDB · Claude API · Pinecone · RAG**

---

## The Problem

Existing nutrition apps track one person's diet. They don't handle the complexity of real families — where a single meal needs to work for 4+ people with completely different restrictions.

Manually checking every ingredient against every family member's allergens is exhausting. Most people just give up.

---

## How It Works

```
Create family profiles (diet, allergens, health conditions)
                    ↓
   Scan product barcodes → OCR extracts ingredients
   → flags risky items per profile
                    ↓
   Enter pantry items → AI generates recipes
   that satisfy ALL family restrictions
                    ↓
   Ask nutrition questions → RAG chatbot
   answers in your language using verified sources
```

---

## Features

- **Multi-Profile Management** — Up to 6 family members, each with their own diet type, allergens, and health conditions
- **Barcode Scanner** — Scan products, extract ingredients via OCR, and instantly check them against every family member's restrictions
- **AI Recipe Generator** — Input what's in your pantry → get recipes that work for everyone, not just one person
- **RAG Nutrition Chatbot** — Multilingual Q&A powered by Pinecone vector store and Claude API, grounded in verified nutrition data
- **Daily Activity Logging** — Track meals, water intake, and nutrition goals per profile
- **JWT Authentication** — Secure per-user data isolation

---

## Engineering Highlights

- **Multi-constraint recipe generation** — Merges dietary restrictions from all family profiles into a single compliance check before generating recipes
- **RAG pipeline** — User queries are embedded, matched against a Pinecone vector store of nutrition documents, and fed to Claude with context for accurate, cited responses
- **OCR ingredient extraction** — Barcode scanning triggers ingredient extraction using Tesseract.js, then cross-references against each profile's allergen list
- **MongoDB schema design** — Multi-profile data isolation with per-user activity logging and daily nutrition tracking

---

## The Hardest Problem I Solved

The recipe generator needed to satisfy multiple people's restrictions at once — not just one person's.

A recipe might be vegan and gluten-free but still contain nuts, which one family member is allergic to. The naive approach (check one profile at a time) missed these conflicts.

I redesigned it so all profiles are merged into a single constraint set before generation. The AI receives the combined restrictions as context, ensuring every generated recipe works for the whole family. It's a simple idea, but getting the data flow right — from profile merging to constraint injection to recipe validation — took real effort.

---

## Tech Stack

| | |
|-|-|
| **Frontend** | React.js, Next.js, TypeScript, Tailwind CSS, Framer Motion |
| **Backend** | Node.js, Express, REST APIs |
| **Database** | MongoDB (Mongoose) |
| **AI** | Claude API, Pinecone (Vector DB), RAG Pipeline |
| **OCR** | Tesseract.js |
| **Auth** | JWT |

---

## Screenshots

> *Add screenshots: family profile dashboard, barcode scan flow, recipe generation, chatbot interface*

---

Built by [Arpit Singh](https://linkedin.com/in/arpitsingh05)

