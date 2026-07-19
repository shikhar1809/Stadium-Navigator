/**
 * Stadium Navigator — app.js
 * Gate & Access Assistant · MetLife Stadium · FIFA World Cup 2026 Final
 *
 * State machine: login → ticket → match → exit → result
 * Accessibility layer runs cross-cutting on every state.
 */

// ─── Cloud Function URL ───────────────────────────────────────────────────────
// Swap to emulator URL during local development:
// const API_URL = "http://127.0.0.1:5001/stadium-navigator-31cda/us-central1/api";
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
};

// ─── Loaded mock data ─────────────────────────────────────────────────────────
let stadiumSeed   = null;
let matchStatuses = null;
let congestionMap = null;

// ─── Timers ───────────────────────────────────────────────────────────────────
let matchTimer    = null;
let recheckTimer  = null;
let countdownInterval = null;

// ═════════════════════════════════════════════════════════════════════════════
// BOOT — wait for Firebase module to initialise
// ═════════════════════════════════════════════════════════════════════════════
async function boot() {
  await loadMockData();

  // Wait for Firebase to expose auth
  if (window._firebaseAuth) {
    initAuth();
  } else {
    window.addEventListener("firebase-ready", initAuth, { once: true });
  }
}

// ─── Load all mock JSON files ─────────────────────────────────────────────────
async function loadMockData() {
  try {
    const [seed, statuses, congestion] = await Promise.all([
      fetch("data/stadium-seed.json").then(r => r.json()),
      fetch("data/match-status-mock.json").then(r => r.json()),
      fetch("data/congestion-mock.json").then(r => r.json()),
    ]);
    stadiumSeed   = seed;
    matchStatuses = statuses;
    congestionMap = congestion;
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
      showScreen("login");
    }
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
$("btn-demo").addEventListener("click", () => {
  const demo = stadiumSeed?.demoTicket ?? { section: "120", language: "es" };
  $("input-section").value      = demo.section;
  $("select-language").value    = demo.language;
  $("check-mobility").checked   = demo.mobility ?? false;
  $("check-vision").checked     = demo.vision   ?? false;
  $("check-hearing").checked    = demo.hearing  ?? false;
  clearFieldError();
});

$("btn-submit-ticket").addEventListener("click", submitTicket);
$("input-section").addEventListener("keydown", (e) => { if (e.key === "Enter") submitTicket(); });

function submitTicket() {
  const rawSection = $("input-section").value.trim();
  const sectionNum = parseInt(rawSection, 10);

  // Validate
  if (!rawSection || isNaN(sectionNum) || !stadiumSeed?.sectionToGate[String(sectionNum)]) {
    showFieldError();
    return;
  }
  clearFieldError();

  // Store session data
  session.section  = sectionNum;
  session.language = $("select-language").value;
  session.mobility = $("check-mobility").checked;
  session.vision   = $("check-vision").checked;
  session.hearing  = $("check-hearing").checked;

  resolveGate();
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
  }

  $("gate-result").classList.remove("hidden");
}

$("btn-continue-match").addEventListener("click", () => {
  showScreen("match");
  setupMatchScreen();
  startMatchSequence();
});

// ─── Validation helpers ───────────────────────────────────────────────────────
function showFieldError() {
  $("input-section").classList.add("error");
  $("section-error").classList.add("visible");
  $("input-section").setAttribute("aria-invalid", "true");
}
function clearFieldError() {
  $("input-section").classList.remove("error");
  $("section-error").classList.remove("visible");
  $("input-section").setAttribute("aria-invalid", "false");
}

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

  // Update status bar
  $("status-text").textContent   = step.label;
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
  pushA11yUpdate(step.message, "match");

  if (step.status === "full_time") {
    clearTimeout(matchTimer);
    // §6.4: Auto-trigger exit screen — hard requirement, no user action needed
    setTimeout(triggerExitScreen, 1200);
  }
}

$("btn-skip-fulltime").addEventListener("click", () => {
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
  const msg = "The match has ended. Please choose how you'd like to exit the stadium.";
  pushA11yUpdate(msg, "exit");
}

$("btn-need-help").addEventListener("click", () => {
  showScreen("result");
  showHelpConnect();
});

$("btn-give-directions").addEventListener("click", () => {
  showScreen("result");
  fetchDirections();
});

// ─── Staff connect — §6.5 ────────────────────────────────────────────────────
function showHelpConnect() {
  showResultLoading("Connecting to stadium staff…");

  setTimeout(() => {
    const escortNote = session.mobility
      ? ` Mobility escort requested — please bring a wheelchair or companion to ${session.gate.label}.`
      : "";
    const msg = `✅ Connected! Staff near ${session.gate.label} have been notified.${escortNote}`;

    showResultCard(
      "🤝",
      "Staff Notified",
      msg,
      "help-card",
      null
    );
    pushA11yUpdate(msg, "result");
  }, 2000);
}

// ─── Directions flow — §6.6 ──────────────────────────────────────────────────
async function fetchDirections() {
  showResultLoading("Getting your personalised exit directions…");

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

  try {
    const payload = {
      type: "directions",
      gate: {
        section:   session.section,
        label:     session.gate.label,
        quadrant:  session.gate.quadrant,
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
    // Network fallback — deterministic local generator
    message = localFallbackDirections(session.gate, session.mobility, session.language);
    source  = "fallback";
  }

  showResultCard("🧭", "Your Exit Route", message, "", source);
  pushA11yUpdate(message, "result");
}

async function handleWaitState(maxPct) {
  let message, source;

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

  showResultCard("⏳", "Please Wait", message, "wait-card", source);
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
function showResultLoading(text) {
  $("result-loading").querySelector("p").textContent = text;
  $("result-loading").classList.remove("hidden");
  $("result-card").classList.add("hidden");
  $("recheck-block").classList.add("hidden");
}

function showResultCard(icon, heading, message, cardClass, source) {
  $("result-loading").classList.add("hidden");

  const card = $("result-card");
  card.className = `result-card${cardClass ? " " + cardClass : ""}`;
  $("result-icon").textContent    = icon;
  $("result-heading").textContent = heading;
  $("result-message").textContent = message;

  if (source) {
    const src = $("result-source");
    src.classList.remove("hidden", "fallback");
    if (source === "fallback") src.classList.add("fallback");
    src.textContent = source === "gemini"
      ? "Powered by Gemini 2.5 Flash"
      : source === "fallback"
        ? "Local fallback (no API key)"
        : "Staff notification system";
  }

  card.classList.remove("hidden");
}

// ─── Back / restart ───────────────────────────────────────────────────────────
$("btn-back-exit").addEventListener("click", () => {
  clearCountdown();
  $("recheck-block").classList.add("hidden");
  showScreen("exit");
});

$("btn-restart").addEventListener("click", () => {
  clearCountdown();
  clearTimeout(matchTimer);
  resetSession();
  showScreen("ticket");
  $("gate-result").classList.add("hidden");
  $("gate-override").classList.add("hidden");
  $("input-section").value  = "";
  $("select-language").value = "en";
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

  const utter  = new SpeechSynthesisUtterance(text);
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

function resetSession() {
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
boot();
