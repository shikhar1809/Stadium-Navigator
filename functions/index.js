const { onRequest } = require("firebase-functions/v2/https");
const { GoogleGenerativeAI } = require("@google/generative-ai");

// ─── CORS helper ─────────────────────────────────────────────────────────────
function setCors(res) {
  res.set("Access-Control-Allow-Origin", "*");
  res.set("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
}

// ─── Deterministic fallback (no API key required) ────────────────────────────
const FALLBACK = {
  directions: {
    en: (gate, mobility) =>
      `Head to ${gate.label} to exit the stadium. ${mobility ? "Step-free ramp access is available at this gate." : "Follow the signs along the concourse."} Staff are positioned throughout to help you on your way.`,
    es: (gate, mobility) =>
      `Dirígete a la ${gate.label} para salir del estadio. ${mobility ? "Hay acceso de rampa sin escalones disponible en esta puerta." : "Sigue las señales en el pasillo."} El personal está disponible para ayudarte.`,
    fr: (gate, mobility) =>
      `Dirigez-vous vers la ${gate.label} pour quitter le stade. ${mobility ? "Un accès par rampe sans marches est disponible à cette porte." : "Suivez les panneaux dans le couloir."} Le personnel est disponible pour vous aider.`,
    pt: (gate, mobility) =>
      `Vá para o ${gate.label} para sair do estádio. ${mobility ? "Acesso por rampa sem degraus disponível neste portão." : "Siga as placas no corredor."} A equipe está disponível para ajudá-lo.`,
    ar: (gate, mobility) =>
      `توجه إلى ${gate.label} للخروج من الملعب. ${mobility ? "يتوفر وصول بمنحدر خالٍ من الدرجات في هذا المدخل." : "اتبع اللافتات على طول الممر."} يتواجد الموظفون لمساعدتك.`,
    de: (gate, mobility) =>
      `Gehen Sie zu ${gate.label}, um das Stadion zu verlassen. ${mobility ? "Stufenfreier Rampenzugang an diesem Eingang verfügbar." : "Folgen Sie den Schildern entlang der Konzessionen."} Personal steht Ihnen zur Verfügung.`,
    zh: (gate, mobility) =>
      `请前往${gate.label}离开体育场。${mobility ? "此入口提供无障碍坡道通道。" : "请沿走廊标识前行。"}工作人员将随时为您提供帮助。`,
  },
  wait: {
    en: (maxCongestion) =>
      `All exits are currently at high capacity (${maxCongestion}% full). Please remain in your seat for a few minutes — congestion clears quickly and you'll be notified the moment a gate is clear.`,
    es: (maxCongestion) =>
      `Todas las salidas están actualmente con alta ocupación (${maxCongestion}% llenas). Por favor, permanece en tu asiento unos minutos — el tráfico se despeja rápidamente y te notificaremos en cuanto una puerta esté despejada.`,
    fr: (maxCongestion) =>
      `Toutes les sorties sont actuellement très fréquentées (${maxCongestion}% pleines). Veuillez rester à votre place quelques minutes — la congestion se dissipe rapidement et vous serez notifié dès qu'une porte est libre.`,
    pt: (maxCongestion) =>
      `Todas as saídas estão com alta lotação (${maxCongestion}% cheias). Por favor, permaneça no seu assento por alguns minutos — o congestionamento diminui rapidamente e você será notificado assim que um portão estiver livre.`,
    ar: (maxCongestion) =>
      `جميع المخارج مزدحمة حالياً (${maxCongestion}% ممتلئة). يرجى البقاء في مقعدك لبضع دقائق — سيُخف الازدحام بسرعة وستُخطَر فور إخلاء بوابة.`,
    de: (maxCongestion) =>
      `Alle Ausgänge sind derzeit stark frequentiert (${maxCongestion}% voll). Bitte bleiben Sie noch einige Minuten auf Ihrem Platz — der Stau löst sich schnell und Sie werden benachrichtigt, sobald ein Gate frei ist.`,
    zh: (maxCongestion) =>
      `目前所有出口均处于高峰期（${maxCongestion}%满员）。请在座位上稍候片刻——人流会很快疏散，一旦出口畅通，您将立即收到通知。`,
  },
};

// ─── Main Cloud Function ──────────────────────────────────────────────────────
exports.api = onRequest({ region: "us-central1" }, async (req, res) => {
  setCors(res);

  // Pre-flight
  if (req.method === "OPTIONS") return res.status(204).send("");
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { type, gate, language = "en", mobility = false, maxCongestion } = req.body;

  if (!["directions", "wait"].includes(type)) {
    return res.status(400).json({ error: "Invalid type. Must be 'directions' or 'wait'." });
  }

  const apiKey = process.env.GEMINI_API_KEY;

  // ── Fallback path (no key configured) ──────────────────────────────────────
  if (!apiKey || apiKey.trim() === "") {
    const lang = FALLBACK[type][language] ? language : "en";
    const message =
      type === "directions"
        ? FALLBACK.directions[lang](gate, mobility)
        : FALLBACK.wait[lang](maxCongestion);
    return res.json({ message, source: "fallback" });
  }

  // ── Gemini path ─────────────────────────────────────────────────────────────
  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({
      model: "gemini-2.5-flash",
      systemInstruction:
        "You are a calm, warm, and concise stadium navigation assistant for the FIFA World Cup 2026 Final at MetLife Stadium. " +
        "You give short, factual, reassuring guidance — never more than 3 sentences. " +
        "Never invent facts not provided in the prompt. " +
        "Respond ONLY in the language specified. Do not add any preamble or sign-off.",
    });

    let prompt;

    if (type === "directions") {
      prompt =
        `Fan section: ${gate.section}. ` +
        `Assigned exit: ${gate.label} (${gate.quadrant} side of MetLife Stadium). ` +
        `Current congestion at this gate: ${gate.congestion}%. ` +
        `Mobility/step-free access required: ${mobility ? "YES — this gate has a step-free ramp" : "NO"}. ` +
        `Language: ${language}. ` +
        `Task: Write 2–3 sentences telling the fan which gate to head to, why, and (if mobility=YES) confirm step-free ramp access. ` +
        `Be calm and warm. State only the facts given.`;
    } else {
      prompt =
        `All exit gates at MetLife Stadium are currently at high congestion. ` +
        `Highest congestion level: ${maxCongestion}%. ` +
        `Language: ${language}. ` +
        `Task: Write 2–3 sentences recommending the fan wait in their seat, give a one-clause reason (crowd surge post-match), and reassure them they will be automatically notified when a gate clears. ` +
        `Be calm and reassuring. State only the facts given.`;
    }

    const result = await model.generateContent(prompt);
    const message = result.response.text().trim();

    return res.json({ message, source: "gemini" });
  } catch (err) {
    // Graceful fallback if Gemini call fails
    console.error("Gemini API error:", err.message);
    const lang = FALLBACK[type][language] ? language : "en";
    const message =
      type === "directions"
        ? FALLBACK.directions[lang](gate, mobility)
        : FALLBACK.wait[lang](maxCongestion);
    return res.json({ message, source: "fallback", warning: "AI unavailable, using fallback" });
  }
});
