# ⚽ Stadium Navigator
### Gate & Access Assistant · FIFA World Cup 2026 Final · MetLife Stadium

[![Firebase](https://img.shields.io/badge/Firebase-Hosting%20%2B%20Functions-orange?logo=firebase)](https://firebase.google.com)
[![Gemini](https://img.shields.io/badge/AI-Gemini%202.5%20Flash-blue?logo=google)](https://ai.google.dev)
[![Accessibility](https://img.shields.io/badge/Accessibility-Vision%20%7C%20Hearing%20%7C%20Mobility-green)](#accessibility-layer)

---

## 1 · Chosen Vertical

**Navigation + Accessibility + Real-Time Decision Support**

A fan's stadium-day experience is full of decisions that require context they don't have: which gate is closest to their seat, whether it's congested right now, and what to do the moment the final whistle blows. Stadium Navigator solves this in one ticket-entry flow, with a hard accessibility principle: **a mobility flag changes the recommended gate itself, not just how the recommendation is displayed**.

---

## 2 · Approach and Logic

### State Machine
The app progresses through 5 states — login → ticket entry → live match → exit choice → result — each triggered automatically where the PRD requires it (full-time auto-transition is a hard requirement, not a "check back" prompt).

### Gate Resolution (§6.2)
```
section number
    │
    ├─ [mobility = false] → nearest gate by quadrant map
    │
    └─ [mobility = true]
           │
           └─ default gate has ramp? → same gate
           └─ default gate has no ramp? → override to nearest of Gate A / Gate C
                  (end-zone ramp gates, per MetLife's published accessibility facts)
```

### AI Directions (§6.6)
Two prompt types, both go through a Firebase Cloud Function (key never reaches browser):

| Condition | Prompt type | Output |
|---|---|---|
| Gate congestion < 88% flood threshold | `directions` | 2–3 sentence personalised route in fan's language |
| All gates ≥ 88% | `wait` | Calm hold message + auto-recheck countdown |

**Fallback:** if no API key is configured, a deterministic local generator produces a correct, shape-identical message in all 7 supported languages — the app is fully demoable without exposing a key.

### Congestion Mock
- Starts moderate pre-match (35–42%)
- Drops during play (7–14%)
- Spikes at full-time (93–97%) — all gates above the 88% flood threshold
- Drains in steps over subsequent recheck cycles

---

## 3 · How the Solution Works

```
Browser (public/index.html)
    │
    │  Google Auth (Firebase Auth)
    ▼
Ticket Entry  →  Gate resolved in-browser from stadium-seed.json
    │
    ▼
Live Match  →  Mock match-status-mock.json polled on timer
               Congestion from congestion-mock.json
               Accessibility layer: TTS (vision) / high-contrast banner (hearing)
    │
    │  Auto-triggered at full_time
    ▼
Exit Choice
    ├─ "Need Help?" → simulated staff connect (2 s delay), escort note if mobility
    └─ "Give Directions"
           │  POST to Cloud Function (API_URL)
           │  Key: process.env.GEMINI_API_KEY — never in source or browser
           ▼
       Gemini 2.5 Flash → 2–3 sentence response in fan's language
           │
           └─ If all gates flooded → wait message + 60 s auto-recheck loop
```

---

## 4 · Assumptions Made

- MetLife Stadium's published section ranges (101–149 / 201–250 / 301–350), gate names, and accessibility facts (two end-zone ramp gates, wheelchair seating in all sections, assistive listening at Guest Services) are accurate as published for NFL-era operations. FIFA's actual World Cup venue plan is not public; the quadrant-to-gate mapping is a stated simplification.
- "Real-time" congestion and match status are simulated data, stated explicitly rather than implied to be live.
- A single ticketed-fan persona without login verification satisfies the "choose one persona" requirement. Google Auth is added as a security layer (user identity only; no ticket verification).
- Web Speech API (TTS) is the correct delivery channel for vision accessibility on the web. Vibration (`navigator.vibrate`) was excluded — not supported on iOS Safari.

---

## 5 · Local Setup

```bash
# 1. Clone
git clone https://github.com/shikhar1809/Stadium-Navigator.git
cd Stadium-Navigator

# 2. Install Cloud Functions dependencies
cd functions && npm install && cd ..

# 3. Set Gemini API key (stays local — gitignored)
cp .env.example functions/.env
# Edit functions/.env and add your key:
# GEMINI_API_KEY=your_key_here

# 4. Run locally with Firebase Emulator
firebase emulators:start

# 5. Open http://127.0.0.1:5000
```

> **No key?** The app works fully without one — the local fallback generator produces correct output in all 7 languages.

---

## 6 · Accessibility Layer

| Flag | Behaviour |
|---|---|
| **Mobility ♿** | Routing input — changes the gate recommended, not just the display |
| **Vision 👁** | Every status/direction message spoken via Web Speech API; falls back to browser default voice if requested language unavailable |
| **Hearing 🦻** | Large, high-contrast banner (black on white, 3 px border) for every update; "Repeat" button always visible |
| None | Subtle ambient banner for all users |

---

## 7 · Supported Languages

English · Español · Français · Português · العربية · Deutsch · 中文

AI directions and wait messages delivered in the fan's chosen language. Fallback generator covers all 7 languages without an API key.

---

## 8 · Manual Test Plan (§14)

| # | Case | Steps | Expected |
|---|---|---|---|
| 1 | Demo happy path | Demo ticket → Enter → skip to full-time → Give Directions | Spanish-language gate route |
| 2 | Mobility override | Section 120 + mobility checked → Enter | Gate A (ramp) not Gate B |
| 3 | Flooded exit | At full-time → Give Directions | Wait message + countdown |
| 4 | No-key fallback | Remove key from functions/.env → restart → Give Directions | Correct local message |
| 5 | Invalid input | Submit with empty/non-numeric section | Inline error, no crash |
| 6 | Vision voice fallback | Set language to uncommon locale + vision checked | Message still spoken |

---

## 9 · Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Vanilla HTML + CSS + JS (no build step, < 10 MB) |
| Auth | Firebase Authentication · Google Sign-In |
| Backend | Firebase Cloud Functions (Node.js 20) |
| AI | Google Gemini 2.5 Flash |
| Hosting | Firebase Hosting |
| Key security | `GEMINI_API_KEY` in `functions/.env` (gitignored) · never in source or browser |

---

*Stadium Navigator · Built with Antigravity AI · Shikhar · 2026*
