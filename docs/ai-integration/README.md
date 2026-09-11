# 🚀 AI Integration Architecture & Roadmap for KanjiWidgets

## 🧭 System Architecture & Design Principles

To maintain KanjiWidgets' core philosophy — **lightning-fast, zero-build-step, offline-capable, lightweight vanilla JS/PWA** — the AI integration follows these architectural principles:

1. **Zero Bloat & Modular Architecture**:
   - All AI logic lives in clean, decoupled vanilla JS modules (`ai-manager.js`, `srs-engine.js`, `ai-tutor-modal.js`).
   - `ai-tutor-modal.js` owns all AI Sensei modal + Kanji Drawer UI logic; `script.js` delegates to it.
   - No node build pipelines, heavyweight frameworks, or server requirements.
2. **Provider Agnostic (BYOK - Bring Your Own Key)**:
   - Supports **Google Gemini** (Gemini 1.5 Flash / Pro - generous free tier), **OpenAI** (GPT-4o / GPT-4o-mini), **Anthropic Claude** (Claude 3.5 Sonnet / Haiku), **OpenRouter**, and local **Ollama** endpoints (`http://localhost:11434`).
   - Users can plug in their own free or paid API key in Settings. Keys are stored locally in `localStorage` (plain text, browser-only — never transmitted to any KanjiWidgets server).
3. **Graceful Offline & Fallback Handling**:
   - If offline or no API key is provided, the app falls back to rule-based algorithmic analysis (SM-2 statistical heuristics and local diagnostics).
   - Smart local caching (`localStorage` / memory) ensures generated mnemonics, analyses, and quiz feedback don't trigger repeated API requests for the same kanji.
4. **Data Privacy First**:
   - Only non-PII study metrics (kanji error rates, SRS interval history, level progress) are transmitted to the completion endpoint.

```
┌────────────────────────────────────────────────────────────────────────┐
│                          KanjiWidgets UI                               │
│   [Kanji Card]  [Kanji Dictionary]  [AI Sensei Dock]  [Quiz Arena]     │
└───────────────────▲────────────────────────────▲───────────────────────┘
                    │                            │
                    ▼                            ▼
┌───────────────────────────────┐ ┌──────────────────────────────────────┐
│       SRS Engine (SM-2)       │ │          AI Manager Service          │
│ - Interval & Ease Factor Calc │ │ - Multi-Provider API Client         │
│ - Mistake & Confusion Tracker │ │ - Prompt Templates & Structured JSON │
│ - Weakness / Strength Index   │ │ - Response Cache & Offline Fallback  │
└───────────────▲───────────────┘ └──────────────────▲───────────────────┘
                │                                    │
                ▼                                    ▼
┌───────────────────────────────┐ ┌──────────────────────────────────────┐
│     Storage Manager (V2)      │ │        AI Provider Endpoints         │
│ - Progress & SRS Metrics DB   │ │ (Gemini 1.5 Flash / GPT-4o-mini /    │
│ - Local API Key Storage       │ │  Claude 3.5 Haiku / Ollama / Local)  │
│   (plain-text localStorage)   │ └──────────────────────────────────────┘
└───────────────────────────────┘
```

---

## 🏆 Feature Roadmap Prioritized by Value & Impact

### 🥇 Tier 1: Core AI Diagnostics & Adaptive Learning (Highest Priority)

#### 1. AI Profile & SRS Diagnostic Analyzer ("Sensei's Weakness Report")
- **Usefulness**: ⭐⭐⭐⭐⭐
- **Description**: Analyzes user SRS review history, lapse rates, answer speeds, and mastered/pending decks to generate actionable diagnostics:
  - **Radical Confusion Detector**: Identifies visual lookalike traps (e.g., 待 vs 持, 土 vs 士, 末 vs 未, 微 vs 徴).
  - **Onyomi vs. Kunyomi Pitfalls**: Pinpoints whether mistakes stem from reading mix-ups, vowel lengthening (お vs おう), or geminate consonants (っ).
  - **Memory Decay Warnings**: Flags kanji at high risk of forgetting based on retention curves before they are lost.
  - **Strengths vs. Weaknesses Scorecard**: Concrete percentage breakdown of visual recall, audio recognition, and meaning accuracy.

#### 2. Adaptive Personalized Study Path Planner ("Daily AI Roadmap")

---

### 🥈 Tier 2: Interactive AI Tutor & Active Recall (High Priority)

#### 4. "AI Sensei" Interactive Assistant Dock & Kanji Deep-Dive
- **Usefulness**: ⭐⭐⭐⭐½
- **Description**: A dedicated, collapsible AI floating assistant panel accessible from anywhere in the app:
  - **Vivid Custom Mnemonics**: Generates memorable stories breaking down the kanji's radicals based on user preferences.
  - **Etymology & Radical Anatomy**: Explains why a kanji is built the way it is.
  - **Contextual Nuance Explainer**: Explains subtle differences between similar synonyms (e.g., 探す vs 捜す, 見る vs 観る vs 診る).
  - **Interactive Free Q&A**: Ask any Japanese question in English or Japanese.

#### 5. Adaptive AI Quiz & Testing Arena
- **Usefulness**: ⭐⭐⭐⭐½
- **Description**: Dynamic test generator that creates active recall challenges based on user's current level:
  - **Contextual Sentence Fill-in**: Generates natural JLPT-level sentences with missing kanji/readings.
  - **Smart Distractor Quizzes**: AI crafts convincing wrong answers specifically targeting common phonological errors.
  - **Real-Time Mistake Breakdown**: Immediate explanation of why an answer was wrong, automatically feeding the mistake back into the SRS weakness tracker.

---

### 🥉 Tier 3: Contextual Immersion & Generative Content (Medium-High Priority)

#### 6. AI Graded Micro-Story Generator ("Immersion Mode")
- **Usefulness**: ⭐⭐⭐⭐
- **Description**:
  - Generates custom short stories (100–300 characters) constrained strictly to vocabulary and kanji the user has already mastered or is currently studying.
  - Includes toggleable furigana and English translations on tap.
  - Reinforces kanji in real sentence contexts instead of isolated flashcards.

#### 7. Kanji AI Sentence Builder with Grammar Check
- **Usefulness**: ⭐⭐⭐½
- **Description**:
  - User attempts to write an original sentence using the current card's kanji.
  - AI provides instant corrections, natural phrasing suggestions, and JLPT-level grammar tips.

---

### 🎖️ Tier 4: Advanced Multimodal Features (Future Polish)

#### 8. AI Stroke / Drawing Critique (Vision / Geometry Evaluation)
- **Usefulness**: ⭐⭐⭐
- **Description**: Evaluates user handwriting on canvas against KanjiVG stroke order vector data.

#### 9. AI Voice Pitch & Reading Pronunciation Evaluator
- **Usefulness**: ⭐⭐⭐
- **Description**: Uses browser speech recognition and phoneme alignment to check user pitch accent and pronunciation clarity.

---

## 📅 Implementation Schedule & Milestones

```
  ┌──────────────┐     ┌──────────────┐     ┌──────────────┐     ┌──────────────┐
  │   PHASE 1    │ ──> │   PHASE 2    │ ──> │   PHASE 3    │ ──> │   PHASE 4    │
  │  SRS Core &  │     │  AI Sensei & │     │  AI Testing  │     │ Immersion &  │
  │ Diagnostics  │     │ Study Planner│     │  & Quizzes   │     │  Polish      │
  │  (Sprint 1)  │     │  (Sprint 2)  │     │  (Sprint 3)  │     │  (Sprint 4)  │
  └──────────────┘     └──────────────┘     └──────────────┘     └──────────────┘
```

| Phase | Milestone / Focus | Deliverables & Tasks | Target Timeline |
| :--- | :--- | :--- | :--- |
| **Phase 1** | **SRS Foundation & AI Diagnostic Engine** | • Implement `srs-engine.js` (SM-2 intervals, lapses, review queues)<br>• Build `ai-manager.js` (Multi-provider API client with OpenAI/Gemini/Claude/Ollama)<br>• Create AI Settings panel for API keys & model selection<br>• Develop "Sensei Diagnostic Report" modal (Weak & Strong points analysis) | **Days 1 – 3** |
| **Phase 2** | **AI Sensei Assistant & Study Path Planner** | • Build collapsible AI Sensei floating UI component<br>• Implement radical decomposition & dynamic mnemonic generator<br>• Develop "Personalized Daily Study Deck" generator based on SRS weaknesses<br>• Add caching layer to prevent duplicate API calls | **Days 4 – 6** |
| **Phase 3** | **Interactive Testing & Adaptive Quiz Arena** | • Build Quiz Modal UI (Multiple Choice, Kanji->Reading, Reading->Kanji, Fill-in-Blank)<br>• Implement AI Distractor Generator & Contextual Sentence Generator<br>• Connect Quiz score results directly into SRS memory decay curves | **Days 7 – 9** |
| **Phase 4** | **Immersion Graded Reader & UI Polish** | • Build "AI Graded Micro-Story" generator with Furigana popovers<br>• Implement user sentence composition critique tool<br>• Performance audit, mobile responsiveness, and lint verification | **Days 10 – 12** |

- **Usefulness**: ⭐⭐⭐⭐⭐
- **Description**: Replaces random or purely linear deck navigation with an intelligent daily study session:
  - Generates a tailored daily deck: **X Critical Reviews (High-risk)** + **Y Weak-Kanji Drills** + **Z Fresh Kanji**.
  - Adjusts pacing dynamically based on user retention velocity and target exam/mastery dates.

#### 3. True Spaced Repetition (SRS) Engine (`srs-engine.js`)
- **Usefulness**: ⭐⭐⭐⭐⭐
- **Description**: Upgrades the binary `mastered / unmastered` state into a full spaced repetition algorithm (SM-2):
  - Tracks `repetition`, `interval`, `easeFactor`, `lastReviewed`, `dueDate`, `lapses`, and `history`.
  - Serves as the rich telemetry data source for the AI Analyzer.
