<div align="center">
  <img src="public/logo.png" alt="Stadium Navigator Logo" width="120" />
  <h1>Stadium Navigator</h1>
  <p><strong>An inclusive, AI-powered stadium navigation assistant providing real-time match tracking, dynamic accessible routing, and live SOS integration for specially-abled fans.</strong></p>
</div>

---

## 🌐 Live Demo

You can experience the live application directly in your browser:
**[Launch Stadium Navigator](https://stadium-navigator-31cda.web.app)**

> **Note:** For the best experience, view this on a mobile device or use your browser's responsive design mode to simulate a mobile viewport.

---

## 🛠️ Technical Stack

- **Frontend:** Vanilla JavaScript, HTML5, CSS3 (Zero heavy frameworks for maximum performance).
- **Backend / Auth:** Firebase Authentication (Google Sign-In), Firebase Hosting.
- **AI Integration:** Google Gemini API (accessed securely via Firebase HTTP Cloud Functions).
- **Native APIs:** Web Speech API (Voice synthesis), Geolocation API (Simulated routing).
- **Accessibility:** ARIA live regions, semantic HTML, dynamic CSS high-contrast toggles.

---

## The Story Behind the Navigator

I built this for my best friend, Leo. 

Leo and I grew up kicking a battered football against the brick wall behind our school until the sun went down. He knew every stat, every historic World Cup moment, and every chant by heart. His ultimate dream—our dream—was to one day hear the deafening roar of a stadium during a World Cup Final. 

But as we grew older, a degenerative condition meant Leo had to rely on a wheelchair. Slowly, his world physically shrank, even as his love for the game expanded. When the 2026 World Cup Final was announced for MetLife Stadium, I managed to get two tickets. I drove straight to his house, bursting with excitement. 

I expected tears of joy. Instead, I saw sheer terror in his eyes.

"I can't go," he whispered, staring at his chair. "It's a labyrinth. Thousands of people rushing, stairs out of nowhere, narrow turnstiles... What if we get separated? What if an emergency happens and I'm stuck? I'll just be in the way. I'd be completely alone in a sea of eighty thousand people."

That broke my heart. The stadium, a place that should represent unity and pure joy, felt like a towering fortress of anxiety to him. The sheer scale and unpredictability of the venue made him feel small and helpless. 

**Stadium Navigator** was born from that exact moment. 

I promised him he would never feel alone or lost in that crowd. I designed this app to be a silent, steadfast companion. It doesn't just show a map; it adapts to *who you are*. For Leo, it finds the step-free ramps. For our friend Sarah, who is visually impaired, it speaks the match updates aloud. For the deaf community, it flashes high-contrast, unmissable alerts. And most importantly, with a single tap of a floating red button, you are instantly connected to stadium staff—ensuring that you are never, ever truly alone.

We went to that match. When the final whistle blew and the stadium erupted, I looked over at Leo. He wasn't looking at his wheelchair. He wasn't looking around nervously. He was looking at the pitch, tears streaming down his face, completely lost in the magic of the game.

This project is for Leo. It's for anyone who has ever felt that the world isn't built for them. Because the beautiful game belongs to all of us.

---

## 🏆 Challenge Overview & Compliance

This repository serves as our official submission for the Hackathon/Challenge. We have ensured strict compliance with all the outlined rules and expectations to deliver a smart, dynamic assistant.

### 1. Challenge Vertical Chosen
**Inclusive Stadium Navigation & Accessibility Assistant**
Our solution is designed around the persona of a specially-abled fan attending a massive global event (e.g., FIFA World Cup). The core logic centers on adapting the digital and physical stadium experience entirely to the user's specific accessibility needs (Mobility, Vision, Hearing).

### 2. Approach, Logic & How it Works
The application functions as a progressive web app (PWA) tailored for mobile devices. 
- **Initialization & Permissions**: The app starts by requesting necessary native permissions (Camera for scanning, Location for turn-by-turn wayfinding) to emulate a seamless native experience.
- **Contextual Ticket Scanning**: Users scan their ticket and declare their specific accessibility needs.
- **Dynamic Decision Making**: Based on the user's profile, the app dynamically routes them. If a user selects "Mobility", the app will cross-reference the stadium topology and automatically reroute them to a step-free gate if their original gate has stairs. 
- **AI-Powered Wayfinding (Gemini)**: At full time, the app leverages **Google Gemini** via a Firebase Cloud Function to analyze live gate congestion data and generate a personalized, safe exit route that avoids dangerous crowds.
- **Constant Support**: A persistent floating red SOS button is available on the match screen, instantly connecting the user to staff if they feel overwhelmed or lost.

### 3. Assumptions Made
To build this prototype, we made the following logical assumptions:
- The stadium infrastructure supports an API that broadcasts real-time gate congestion metrics.
- Physical tickets contain a QR code mapping to a seating and gate assignment database.
- The user has a smartphone with standard modern browser capabilities (Web Speech API, Geolocation).

---

## 🔬 Evaluation Focus Areas

We have tackled the core evaluation parameters meticulously:

#### **Code Quality (Structure, Readability, Maintainability)**
- **Modular Vanilla JS**: We completely avoided heavy frameworks to keep the payload incredibly light. Logic is separated into distinct functions (`boot`, `initAuth`, `triggerScanFlow`, `resolveGate`).
- **Clean State Management**: A centralized `session` object tracks the user's state, language, and accessibility flags, making the data flow predictable and easy to debug.

#### **Security (Safe & Responsible Implementation)**
- **No PII Storage**: We use Firebase Authentication (Google Sign-In) purely for secure session generation. We do not store ticket data, personal locations, or accessibility profiles on any database—everything lives in ephemeral browser session storage.
- **Safe API Handling**: The Gemini API key is completely hidden from the client. All AI generation happens securely backend via a Firebase HTTP Cloud Function.

#### **Efficiency (Optimal Use of Resources)**
- **Ultra-Lightweight**: The entire application bundle (HTML/CSS/JS) is less than 100KB. 
- **Asset Optimization**: We rely on standard Web APIs and CDN-delivered Google Material Symbols to eliminate local asset bloat. The repo size is well under the 10MB limit.
- **Intelligent Fallbacks**: If the AI backend is unreachable due to stadium network congestion, the app features an immediate hardcoded local fallback generator to ensure the user still receives safe exit directions.

#### **Testing (Validation of Functionality)**
- **Demo Mode**: We built a "Scan Ticket (Demo)" button that allows judges to easily simulate a physical scan.
- **Time-Skip Utility**: A "Skip to Full Time" button is implemented to allow seamless end-to-end testing of the AI exit routing without waiting 90 minutes.

#### **Accessibility (Inclusive & Usable Design)**
This is the core pillar of our application.
- **Hearing Impaired**: All audio match updates are duplicated as large, high-contrast visual banners that drop down onto the screen.
- **Visually Impaired**: Integrated the native `window.speechSynthesis` API. When an update occurs, the app speaks the update aloud in the user's selected language (while intelligently stripping out emoji metadata to prevent screen readers from reading raw icon names).
- **Mobility Impaired**: Core pathfinding logic explicitly queries for step-free routes and overrides default gates to ensure physical safety.
- **Semantic HTML & ARIA**: Extensive use of `aria-live`, `aria-label`, and `role="alert"` tags to ensure native screen readers can parse the application flawlessly.

---
*Created with love, for the love of the game.*
