"use strict";

/**
 * Stadium Navigator — app.js
 * Generative AI-enabled Gate & Access Assistant · MetLife Stadium
 * Powered by Google Gemini AI for crowd management and accessibility.
 *
 * State machine: login → ticket → match → exit → result
 * Accessibility layer runs cross-cutting on every state.
 *
 * AI calls go through a Firebase Cloud Function — the Gemini API key
 * lives in functions/.env on the server and never reaches the browser.
 * With no deployed function, the local fallback generator handles all cases.
 */

// ─── Cloud Function URL ─────────────────────────────────────────────────
const API_URL = "https://us-central1-stadium-navigator-31cda.cloudfunctions.net/api";

// ─── Match step timing (ms between steps for the demo) ───────────────────────
// In a real deployment these would be real match-feed polls.
const MATCH_STEP_MS = [3000, 6000, 8000, 6000, 5000]; // scheduled→kickoff→1st→half→2nd→full

// ─── Recheck interval after "wait" message (ms) ──────────────────────────────
const RECHECK_INTERVAL_MS = 60_000;

// ─── Flood threshold (%) — matches congestion-mock.json ──────────────────────
let FLOOD_THRESHOLD = 88; // overridden by seed data load

// ═════════════════════════════════════════════════════════════════════════════
// SESSION STATE  (in-memory only — never persisted per §10 of PRD)
// ═════════════════════════════════════════════════════════════════════════════
const session = {
  user: null,
  section: null,
  language: "en",
  mobility: false,
  vision: false,
  hearing: false,
  gate: null,            // resolved gate object from stadium-seed
  wasOverridden: false,  // mobility ramp override fired
  matchStatus: null,
  congestion: {},
  drainStep: 0,          // index into congestion-mock.drainSteps
  lastUpdate: "",        // last spoken/displayed message
  runId: 0,              // track session epochs to prevent async race conditions
};

// ─── Loaded mock data ─────────────────────────────────────────────────────────
let stadiumSeed   = null;
let matchStatuses = null;
let congestionMap = null;
let uiTranslations = {};

// ─── Timers ───────────────────────────────────────────────────────────────────
let matchTimer    = null;
let recheckTimer  = null;
let countdownInterval = null;
let exitTimer     = null;
let sosTimer      = null;
let scanTimers    = []; // track nested timeouts for scanning

// ─── Haptics ──────────────────────────────────────────────────────────────────
/**
 * Triggers physical device vibrations.
 * @param {"light"|"heavy"|"sos"} type 
 */
function triggerHaptic(type = "light") {
  if (!("vibrate" in navigator)) return;
  try {
    if (type === "light") navigator.vibrate(50);
    else if (type === "heavy") navigator.vibrate([200, 100, 200]);
    else if (type === "sos") navigator.vibrate([500, 200, 500, 200, 500]);
  } catch(e) { console.warn("Haptics failed:", e); }
}

// ═════════════════════════════════════════════════════════════════════════════
// BOOT — wait for Firebase module to initialise
// ═════════════════════════════════════════════════════════════════════════════
async function boot() {
  await loadMockData();
  
  // Sync session with preserved dropdown state on reload
  const langSelect = document.getElementById("select-language");
  if (langSelect && langSelect.value) {
    session.language = langSelect.value;
  }
  updateUIForLanguage(session.language);

  // Wait for Firebase to expose auth
  if (window._firebaseAuth) {
    initAuth();
  } else {
    window.addEventListener("firebase-ready", initAuth, { once: true });
  }

  // Attach light haptics to all buttons
  document.querySelectorAll("button, .btn").forEach(btn => {
    btn.addEventListener("click", () => {
      if (btn.id !== "btn-match-help") triggerHaptic("light");
    });
  });
}

// ─── Load all mock JSON files ─────────────────────────────────────────────────
async function loadMockData() {
  try {
    const [seed, statuses, congestion, translations] = await Promise.all([
      fetch("data/stadium-seed.json").then(r => r.json()),
      fetch("data/match-status-mock.json").then(r => r.json()),
      fetch("data/congestion-mock.json").then(r => r.json()),
      fetch("data/translations.json").then(r => r.json()),
    ]);
    stadiumSeed   = seed;
    matchStatuses = statuses;
    congestionMap = congestion;
    uiTranslations = translations;
    FLOOD_THRESHOLD = congestion.floodThreshold ?? 88;
  } catch (err) {
    console.error("Failed to load mock data:", err);
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// AUTH
// ═════════════════════════════════════════════════════════════════════════════
function initAuth() {
  const auth = window._firebaseAuth;

  window._onAuthStateChanged(auth, (user) => {
    if (user) {
      session.user = user;
      showPostLoginUI(user);
    } else {
      if (!sessionStorage.getItem("permsGranted")) {
        showScreen("permissions");
      } else {
        showScreen("login");
      }
    }
  });

  $("btn-grant-permissions")?.addEventListener("click", async () => {
    // Trigger real browser prompts for demo realism
    try {
      const stream = await navigator.mediaDevices.getUserMedia({video: true});
      stream.getTracks().forEach(t => t.stop());
    } catch(e) { console.warn("Camera permission denied/failed", e); }
    
    try {
      await new Promise((resolve, reject) => navigator.geolocation.getCurrentPosition(resolve, reject));
    } catch(e) { console.warn("Location permission denied/failed", e); }
    
    sessionStorage.setItem("permsGranted", "1");
    showScreen("login");
  });

  $("btn-google-signin").addEventListener("click", async () => {
    try {
      await window._signInWithPopup(auth, window._googleProvider);
    } catch (err) {
      if (err.code !== "auth/popup-closed-by-user") {
        console.error("Sign-in error:", err);
      }
    }
  });

  $("btn-signout").addEventListener("click", () => {
    window._signOut(auth);
    resetSession();
    showScreen("login");
  });

  $("btn-match-help")?.addEventListener("click", () => {
    // Immediately stop any ongoing match commentary
    if ("speechSynthesis" in window) window.speechSynthesis.cancel();

    triggerHaptic("sos");
    showScreen("result");
    showResultLoading("loading_staff");
    
    sosTimer = setTimeout(() => {
      $("result-loading").classList.add("hidden");
      $("result-card").classList.remove("hidden");
      $("result-icon").innerHTML = `<span class="material-symbols-outlined" style="font-size:inherit; color: var(--red);">support_agent</span>`;
      $("result-heading").textContent = "Assistance Requested";
      $("result-heading").style.color = "var(--red)";
      $("result-message").textContent = "Staff is notified, please remain at your position, assistance is on the way.";
      $("result-message").style.color = "var(--text-primary)";
      playA11yAlert("Staff is notified, please remain at your position, assistance is on the way.", "result");
    }, 1500);
  });
}

function showPostLoginUI(user) {
  $("user-name").textContent  = user.displayName || user.email;
  $("user-photo").src         = user.photoURL || "";
  $("user-photo").alt         = user.displayName || "";
  $("app-header").style.display = "";
  showScreen("ticket");
}

// ═════════════════════════════════════════════════════════════════════════════
// SCREEN ROUTER
// ═════════════════════════════════════════════════════════════════════════════
function showScreen(name) {
  document.querySelectorAll(".screen").forEach(s => s.classList.remove("active"));
  const target = document.getElementById(`screen-${name}`);
  if (target) target.classList.add("active");

  // Header visible only after login
  $("app-header").style.display = name === "login" ? "none" : "";

  // Announce screen change for screen readers
  target.focus?.();
}

// ═════════════════════════════════════════════════════════════════════════════
// TICKET SCREEN
// ═════════════════════════════════════════════════════════════════════════════
$("select-language")?.addEventListener("change", (e) => {
  session.language = e.target.value;
  updateUIForLanguage(session.language);
});

$("btn-demo")?.addEventListener("click", triggerScanFlow);

function triggerScanFlow() {
  const idleUi = $("scan-ui-idle");
  const activeUi = $("scan-ui-active");
  const statusText = $("scan-status-text");

  idleUi.classList.add("hidden");
  activeUi.classList.remove("hidden");

  const dict = uiTranslations[session.language] || uiTranslations["en"];
  statusText.textContent = "Ticket scanned ✅";
  
  scanTimers.forEach(clearTimeout);
  scanTimers = [];

  scanTimers.push(setTimeout(() => {
    statusText.textContent = "Fetching seat details...";
    
    scanTimers.push(setTimeout(() => {
      statusText.textContent = "Mapping out accessibility needs...";
      
      scanTimers.push(setTimeout(() => {
        statusText.textContent = "All set! ✨";
        
        scanTimers.push(setTimeout(() => {
          const demo = stadiumSeed?.demoTicket ?? { section: "120", language: "en" };
          session.section = parseInt(demo.section, 10);
          session.mobility = $("check-mobility").checked;
          session.vision = $("check-vision").checked;
          session.hearing = $("check-hearing").checked;
          resolveGate();
        }, 1000));
      }, 1500));
    }, 1500));
  }, 1000));
}

function resolveGate() {
  const sectionKey = String(session.section);
  const defaultGateId = stadiumSeed.sectionToGate[sectionKey];
  const defaultGate   = stadiumSeed.gates[defaultGateId];

  let resolvedGate   = defaultGate;
  let wasOverridden  = false;

  // §6.2: Mobility override — route to nearest ramp gate even if it isn't closest by section
  if (session.mobility && !defaultGate.ramp) {
    const nearest = stadiumSeed.nearestRampGate;
    const isNorthSection = nearest.northSections.includes(session.section);
    const rampGateId = isNorthSection ? nearest.northRampGate : nearest.southRampGate;
    resolvedGate  = stadiumSeed.gates[rampGateId];
    wasOverridden = true;
  }

  session.gate         = { ...resolvedGate, section: session.section };
  session.wasOverridden = wasOverridden;

  // Render gate badge
  $("gate-name").textContent = resolvedGate.label;
  $("gate-note").textContent = resolvedGate.note;

  if (wasOverridden) {
    $("gate-override").classList.remove("hidden");
  } else {
    $("gate-override").classList.add("hidden");
  }

  showScreen("gate");
}

$("btn-continue-match")?.addEventListener("click", () => {
  showScreen("match");
  setupMatchScreen();
  startMatchSequence();
});



// ═════════════════════════════════════════════════════════════════════════════
// MATCH SCREEN
// ═════════════════════════════════════════════════════════════════════════════
function setupMatchScreen() {
  // Show user's gate on match screen
  $("match-gate-name").textContent = session.gate.label;
  $("match-gate-note").textContent = session.gate.note;

  // Render congestion grid
  renderCongestion(congestionMap["scheduled"]);
}

let matchStepIndex = 0;

function startMatchSequence() {
  matchStepIndex = 0;
  advanceMatchStep();
}

function advanceMatchStep() {
  if (matchStepIndex >= matchStatuses.length) return;

  const step = matchStatuses[matchStepIndex];
  applyMatchStatus(step);

  if (step.status === "full_time") {
    clearTimeout(matchTimer);
    return; // Terminal state handled in applyMatchStatus
  }

  const delay = MATCH_STEP_MS[matchStepIndex] ?? 5000;
  matchStepIndex++;
  matchTimer = setTimeout(advanceMatchStep, delay);
}

function applyMatchStatus(step) {
  session.matchStatus = step.status;
  const lang = session.language || "en";

  // Update status bar
  $("status-text").textContent   = step.label[lang] || step.label["en"];
  $("status-minute").textContent = step.minute !== null ? `${step.minute}'` : "—";

  const dot = $("status-dot");
  dot.className = "status-dot";
  if (["kickoff","first_half","second_half"].includes(step.status)) dot.classList.add("live");
  else if (step.status === "half_time")  dot.classList.add("halftime");
  else if (step.status === "full_time")  dot.classList.add("fulltime");

  // Congestion
  const cData = congestionMap[step.status] ?? congestionMap["scheduled"];
  renderCongestion(cData);
  session.congestion = cData;

  // Push through accessibility layer
  const msg = step.message[lang] || step.message["en"];
  pushA11yUpdate(msg, "match");

  if (step.status === "full_time") {
    clearTimeout(matchTimer);
    // §6.4: Auto-trigger exit screen — hard requirement, no user action needed
    clearTimeout(exitTimer);
    exitTimer = setTimeout(triggerExitScreen, 1200);
  }
}

$("btn-skip-fulltime")?.addEventListener("click", () => {
  clearTimeout(matchTimer);
  const fullTimeStep = matchStatuses.find(s => s.status === "full_time");
  if (fullTimeStep) {
    session.matchStatus = "full_time";
    session.congestion  = congestionMap["full_time"];
    applyMatchStatus(fullTimeStep);
  }
});

// ─── Congestion rendering ─────────────────────────────────────────────────────
function renderCongestion(data) {
  const grid    = $("congestion-grid");
  const gates   = stadiumSeed?.gates ?? {};
  grid.innerHTML = "";

  Object.entries(data).forEach(([gateId, pct]) => {
    if (typeof pct !== "number") return;
    const gate = gates[gateId];
    if (!gate) return;

    const isMyGate   = gateId === session.gate?.id;
    const color      = congestionColor(pct);
    const item       = document.createElement("div");
    item.className   = "congestion-item";
    item.setAttribute("role", "listitem");
    item.innerHTML   = `
      <div class="congestion-gate" style="color:${isMyGate ? 'var(--green)' : ''}">
        ${gate.name}${isMyGate ? " ← yours" : ""}${gate.ramp ? " ♿" : ""}
      </div>
      <div class="congestion-bar" role="meter" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100" aria-label="${gate.name} congestion ${pct}%">
        <div class="congestion-fill" style="width:${pct}%;background:${color}"></div>
      </div>
      <div class="congestion-pct" style="color:${color}">${pct}%</div>
    `;
    grid.appendChild(item);
  });
}

function congestionColor(pct) {
  if (pct >= FLOOD_THRESHOLD) return "var(--red)";
  if (pct >= 60)               return "var(--gold)";
  return "var(--green)";
}

// ═════════════════════════════════════════════════════════════════════════════
// EXIT SCREEN  — §6.4 auto-triggered
// ═════════════════════════════════════════════════════════════════════════════
function triggerExitScreen() {
  showScreen("exit");
  const dict = uiTranslations[session.language] || uiTranslations["en"];
  const msg = dict?.full_time_desc || "The match is over. How can we help you get home?";
  pushA11yUpdate(msg, "exit");
}

$("btn-need-help")?.addEventListener("click", () => {
  showScreen("result");
  showHelpConnect();
});

$("btn-give-directions")?.addEventListener("click", () => {
  showScreen("result");
  fetchDirections();
});

// ─── Staff connect — §6.5 ────────────────────────────────────────────────────
function showHelpConnect() {
  showResultLoading("loading_staff");

  setTimeout(() => {
    try {
      const dict = uiTranslations[session.language] || uiTranslations["en"];
      const gateLabel = session.gate ? session.gate.label : "your gate";
      
      const escortNote = session.mobility && dict.staff_escort
        ? dict.staff_escort.replace("${gate}", gateLabel)
        : "";
        
      const msg = dict.staff_success
        ? dict.staff_success.replace("${gate}", gateLabel).replace("${escort}", escortNote)
        : `Connected! Staff near ${gateLabel} have been notified.${escortNote}`;

      showResultCard(
        "🤝",
        dict.staff_notified || "Staff Notified",
        msg,
        "help-card",
        null
      );
      pushA11yUpdate(msg, "result");
    } catch (err) {
      console.error("Staff connect error:", err);
      showResultCard("🤝", "Staff Notified", "Connected to staff.", "help-card", null);
    }
  }, 2000);
}

// ─── Directions flow — §6.6 ──────────────────────────────────────────────────
// ─── Gemini client (lazy-initialised) ────────────────────────────────────────────
function getGeminiModel() {
  const apiKey = window.STADIUM_CONFIG?.GEMINI_API_KEY;
  if (!apiKey) return null; // no key — fallback path
  const genAI = new GoogleGenerativeAI(apiKey);
  return genAI.getGenerativeModel({
    model: "gemini-2.5-flash",
    systemInstruction:
      "You are a calm, warm, and concise stadium navigation assistant for the FIFA World Cup 2026 Final at MetLife Stadium. " +
      "You give short, factual, reassuring guidance — never more than 3 sentences. " +
      "Never invent facts not provided in the prompt. " +
      "Respond ONLY in the language specified. Do not add any preamble or sign-off.",
  });
}

async function callGemini(prompt) {
  const model = getGeminiModel();
  if (!model) return null; // triggers fallback in callers
  const result = await model.generateContent(prompt);
  return result.response.text().trim();
}
async function fetchDirections() {
  showResultLoading("loading_directions");

  // Drain congestion step by step after full-time
  const currentCongestion = getCurrentCongestion();
  session.congestion = currentCongestion;

  const gateKey    = session.gate.id;
  const gatePct    = currentCongestion[gateKey] ?? 0;
  const maxPct     = Math.max(...Object.values(currentCongestion).filter(v => typeof v === "number"));
  const allFlooded = maxPct >= FLOOD_THRESHOLD;

  if (allFlooded) {
    // §6.6 Case B — wait + auto-recheck
    await handleWaitState(maxPct);
  } else {
    // §6.6 Case A — personalised route
    await handleDirectionsState(gatePct);
  }
}

function getCurrentCongestion() {
  // After full_time, drain over time using drainSteps
  const drain = congestionMap.drainSteps;
  if (session.matchStatus === "full_time" && drain && session.drainStep < drain.length) {
    return drain[session.drainStep];
  }
  return congestionMap[session.matchStatus] ?? congestionMap["full_time"];
}

async function handleDirectionsState(gatePct) {
  clearCountdown();
  $("recheck-block").classList.add("hidden");

  let message, source;
  const currentRunId = session.runId;

  try {
    const payload = {
      type: "directions",
      gate: {
        section:    session.section,
        label:      session.gate.label,
        quadrant:   session.gate.quadrant,
        congestion: gatePct,
      },
      language: session.language,
      mobility: session.mobility,
    };
    const res  = await fetch(API_URL, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify(payload),
    });
    const data = await res.json();
    message = data.message;
    source  = data.source;
  } catch {
    // Cloud Function unreachable — use local fallback
    message = localFallbackDirections(session.gate, session.mobility, session.language);
    source  = "fallback";
  }

  // Prevent race condition if user restarted while fetching
  if (session.runId !== currentRunId) return;

  const dict = uiTranslations[session.language] || uiTranslations["en"];
  showResultCard("🧭", dict.your_exit_route, message, "", source);
  pushA11yUpdate(message, "result");
}

async function handleWaitState(maxPct) {
  let message, source;
  const currentRunId = session.runId;

  try {
    const payload = { type: "wait", maxCongestion: maxPct, language: session.language };
    const res  = await fetch(API_URL, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify(payload),
    });
    const data = await res.json();
    message = data.message;
    source  = data.source;
  } catch {
    message = localFallbackWait(maxPct, session.language);
    source  = "fallback";
  }

  // Prevent race condition if user restarted while fetching
  if (session.runId !== currentRunId) return;

  const dict = uiTranslations[session.language] || uiTranslations["en"];
  showResultCard("⏳", dict.please_wait, message, "wait-card", source);
  pushA11yUpdate(message, "result");

  // §6.6: Show countdown + auto-recheck every 60 seconds
  startRecheckCountdown();
}

// ─── Auto-recheck countdown ───────────────────────────────────────────────────
function startRecheckCountdown() {
  $("recheck-block").classList.remove("hidden");
  let secs = RECHECK_INTERVAL_MS / 1000;
  $("countdown-display").textContent = formatCountdown(secs);

  clearCountdown();
  countdownInterval = setInterval(() => {
    secs--;
    $("countdown-display").textContent = formatCountdown(secs);
    if (secs <= 0) {
      clearCountdown();
      session.drainStep++; // advance drain step
      fetchDirections();   // re-run the full check
    }
  }, 1000);
}

function clearCountdown() {
  clearInterval(countdownInterval);
  countdownInterval = null;
}

function formatCountdown(secs) {
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

// ─── Result card rendering ────────────────────────────────────────────────────
function showResultLoading(textKey) {
  const dict = uiTranslations[session.language] || uiTranslations["en"];
  $("result-loading").querySelector("p").textContent = dict ? dict[textKey] : textKey;
  $("result-loading").classList.remove("hidden");
  $("result-card").classList.add("hidden");
  $("recheck-block").classList.add("hidden");
  $("btn-repeat-result").style.display = "none";
  
  // Clear stale data
  $("result-icon").innerHTML = "";
  $("result-heading").textContent = "";
  $("result-message").textContent = "";
}

function showResultCard(icon, heading, message, cardClass, source) {
  $("result-loading").classList.add("hidden");

  const card = $("result-card");
  card.className = `result-card${cardClass ? " " + cardClass : ""}`;
  $("result-icon").textContent    = icon;
  $("result-heading").textContent = heading;
  $("result-message").textContent = message;

  const src = $("result-source");
  if (source) {
    src.classList.remove("hidden", "fallback");
    if (source === "fallback") src.classList.add("fallback");
    const dict = uiTranslations[session.language] || uiTranslations["en"];
    src.textContent = source === "gemini"
      ? dict.src_gemini
      : source === "fallback"
        ? dict.src_fallback
        : dict.src_staff;
  } else {
    src.classList.add("hidden");
  }

  card.classList.remove("hidden");
}

// ─── Back / restart ───────────────────────────────────────────────────────────
$("btn-back-exit")?.addEventListener("click", () => {
  clearCountdown();
  $("recheck-block").classList.add("hidden");
  showScreen("exit");
});

$("btn-restart")?.addEventListener("click", () => {
  clearCountdown();
  clearTimeout(matchTimer);
  clearTimeout(exitTimer);
  clearTimeout(sosTimer);
  scanTimers.forEach(clearTimeout);
  scanTimers = [];
  
  if ("speechSynthesis" in window) window.speechSynthesis.cancel();
  
  // Hide all accessibility banners
  document.querySelectorAll(".a11y-banner").forEach(b => {
    b.classList.remove("visible", "hearing-banner", "ambient");
  });

  resetSession();
  
  const idleUi = $("scan-ui-idle");
  const activeUi = $("scan-ui-active");
  if (idleUi) idleUi.classList.remove("hidden");
  if (activeUi) activeUi.classList.add("hidden");
  
  showScreen("ticket");
  $("gate-override").classList.add("hidden");
  $("select-language").value = "en";
  updateUIForLanguage("en");
  $("check-mobility").checked = false;
  $("check-vision").checked   = false;
  $("check-hearing").checked  = false;
});

// ═════════════════════════════════════════════════════════════════════════════
// ACCESSIBILITY DELIVERY LAYER  — §8
// Runs on every state. Flag determines delivery mode.
// ═════════════════════════════════════════════════════════════════════════════

/**
 * @param {string} message
 * @param {"match"|"exit"|"result"} context
 */
function pushA11yUpdate(message, context) {
  session.lastUpdate = message;

  const bannerId   = `a11y-${context}-banner`;
  const textId     = `a11y-${context}-text`;
  const repeatId   = `btn-repeat-${context}`;

  const banner = $(bannerId);
  const text   = $(textId);
  if (!banner || !text) return;

  text.textContent = message;
  
  // Vibrate heavily to physically notify users of an important match/a11y update
  triggerHaptic("heavy");

  // ── Hearing flag: large, high-contrast banner ─────────────────────────────
  if (session.hearing) {
    banner.className = "a11y-banner hearing-banner visible";
    banner.setAttribute("dir", session.language === "ar" ? "rtl" : "ltr");
    const repeatBtn = $(repeatId);
    if (repeatBtn) repeatBtn.style.display = "inline-block";
  } else {
    // Ambient: subtle banner for everyone
    banner.className = "a11y-banner ambient visible";
    const repeatBtn = $(repeatId);
    if (repeatBtn) repeatBtn.style.display = "none";
  }

  // ── Vision flag: speak aloud via Web Speech API ───────────────────────────
  if (session.vision && "speechSynthesis" in window) {
    speakMessage(message, session.language);
  }

  // Set up repeat button if visible
  const repeatBtn = $(repeatId);
  if (repeatBtn) {
    repeatBtn.onclick = () => {
      if (session.vision && "speechSynthesis" in window) {
        speakMessage(session.lastUpdate, session.language);
      }
    };
  }
}

// ─── Speech synthesis ─────────────────────────────────────────────────────────
const LANG_CODES = {
  en: "en-US", es: "es-ES", fr: "fr-FR", pt: "pt-BR",
  ar: "ar-SA", de: "de-DE", zh: "zh-CN",
};

function speakMessage(text, lang) {
  if (!("speechSynthesis" in window)) return; // §8: silent no-op if unsupported
  window.speechSynthesis.cancel();

  // Strip emojis to prevent screen reader from reading emoji descriptions aloud
  const cleanText = text.replace(/[\p{Emoji_Presentation}\p{Extended_Pictographic}]/gu, '');
  
  const utter  = new SpeechSynthesisUtterance(cleanText);
  const bcp47  = LANG_CODES[lang] ?? "en-US";
  const voices = window.speechSynthesis.getVoices();
  const voice  = voices.find(v => v.lang.startsWith(bcp47.split("-")[0]));

  // §8: fall back to browser default voice — wrong-accent read > silent fail
  utter.voice = voice ?? null;
  utter.lang  = bcp47;
  utter.rate  = 0.95;

  window.speechSynthesis.speak(utter);
}

// Voices load async on some browsers
if ("speechSynthesis" in window) {
  window.speechSynthesis.onvoiceschanged = () => {};
}

// ═════════════════════════════════════════════════════════════════════════════
// LOCAL FALLBACK GENERATORS  — §9 (no API key required)
// ═════════════════════════════════════════════════════════════════════════════
const FALLBACK_DIRECTIONS = {
  en: (gate, mob) =>
    `Head to ${gate.label} to exit the stadium. ${mob ? "Step-free ramp access is available at this gate." : "Follow the green exit signs along the concourse."} Staff are positioned along the route to assist you.`,
  es: (gate, mob) =>
    `Dirígete a la ${gate.label} para salir del estadio. ${mob ? "Hay acceso de rampa sin escalones en esta puerta." : "Sigue las señales verdes de salida por el pasillo."} El personal está disponible para ayudarte.`,
  fr: (gate, mob) =>
    `Rendez-vous à ${gate.label} pour quitter le stade. ${mob ? "Accès par rampe sans marches disponible à cette porte." : "Suivez les panneaux de sortie verts dans le couloir."} Le personnel est disponible pour vous aider.`,
  pt: (gate, mob) =>
    `Vá para o ${gate.label} para sair do estádio. ${mob ? "Acesso por rampa sem degraus disponível neste portão." : "Siga as placas de saída verdes no corredor."} A equipe está disponível para ajudá-lo.`,
  ar: (gate, mob) =>
    `توجه إلى ${gate.label} للخروج من الملعب. ${mob ? "يتوفر وصول بمنحدر خالٍ من الدرجات في هذا المدخل." : "اتبع لافتات الخروج الخضراء على طول الممر."} يتواجد الموظفون على طول الطريق لمساعدتك.`,
  de: (gate, mob) =>
    `Begeben Sie sich zu ${gate.label}, um das Stadion zu verlassen. ${mob ? "Stufenfreier Rampenzugang an diesem Eingang verfügbar." : "Folgen Sie den grünen Ausgangsschildern entlang der Konzession."} Personal steht entlang der Route zur Verfügung.`,
  zh: (gate, mob) =>
    `请前往${gate.label}离开体育场。${mob ? "此入口提供无障碍坡道通道。" : "请沿走廊跟随绿色出口标识前行。"}工作人员沿途为您提供协助。`,
};

const FALLBACK_WAIT = {
  en: (pct) => `All exits are currently at high capacity (${pct}% full). Please remain in your seat for a few minutes — congestion clears quickly after the initial surge. You'll be notified automatically when a gate clears.`,
  es: (pct) => `Todas las salidas están al límite (${pct}% de capacidad). Por favor, quédate en tu asiento unos minutos — el tráfico se despeja rápidamente tras la salida masiva. Te notificaremos cuando una puerta esté disponible.`,
  fr: (pct) => `Toutes les sorties sont saturées (${pct}% pleines). Veuillez rester à votre place quelques minutes — la congestion se dissipe rapidement après le pic de sortie. Vous serez notifié dès qu'une porte est libre.`,
  pt: (pct) => `Todas as saídas estão lotadas (${pct}% cheias). Por favor, fique no seu assento por alguns minutos — o congestionamento diminui rapidamente após o pico. Você será notificado assim que um portão estiver livre.`,
  ar: (pct) => `جميع المخارج مزدحمة حالياً (${pct}% ممتلئة). يرجى البقاء في مقعدك لبضع دقائق — سيخف الازدحام بسرعة بعد موجة الخروج الأولى. ستُخطَر تلقائياً فور إخلاء بوابة.`,
  de: (pct) => `Alle Ausgänge sind derzeit überlastet (${pct}% voll). Bitte bleiben Sie noch einige Minuten auf Ihrem Platz — der Stau löst sich nach dem ersten Ansturm schnell auf. Sie werden automatisch benachrichtigt, sobald ein Gate frei ist.`,
  zh: (pct) => `目前所有出口均已满员（${pct}%）。请在座位上稍候片刻——高峰过后人流会迅速疏散。一旦出口畅通，您将自动收到通知。`,
};

function localFallbackDirections(gate, mobility, language) {
  const fn = FALLBACK_DIRECTIONS[language] ?? FALLBACK_DIRECTIONS.en;
  return fn(gate, mobility);
}

function localFallbackWait(maxPct, language) {
  const fn = FALLBACK_WAIT[language] ?? FALLBACK_WAIT.en;
  return fn(maxPct);
}

// ═════════════════════════════════════════════════════════════════════════════
// HELPERS
// ═════════════════════════════════════════════════════════════════════════════
function $(id) { return document.getElementById(id); }

function updateUIForLanguage(lang) {
  const dict = uiTranslations[lang] || uiTranslations["en"];
  if (!dict) return;

  document.querySelectorAll("[data-i18n]").forEach(el => {
    const key = el.getAttribute("data-i18n");
    if (dict[key]) el.textContent = dict[key];
  });
}

function resetSession() {
  session.runId++;
  session.section      = null;
  session.language     = "en";
  session.mobility     = false;
  session.vision       = false;
  session.hearing      = false;
  session.gate         = null;
  session.wasOverridden = false;
  session.matchStatus  = null;
  session.congestion   = {};
  session.drainStep    = 0;
  session.lastUpdate   = "";
}

// ─── Kick off ─────────────────────────────────────────────────────────────────
if (typeof window !== "undefined") {
  boot();
}

// ─── Exports for Automated Jest Testing ───────────────────────────────────────
if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    congestionColor,
    localFallbackDirections,
    localFallbackWait,
    FLOOD_THRESHOLD,
  };
}
