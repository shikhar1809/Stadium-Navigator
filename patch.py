import sys

with open('public/app.js', 'r', encoding='utf-8') as f:
    js = f.read()

# 1. Add uiTranslations
js = js.replace('let congestionMap = null;', 'let congestionMap = null;\nlet uiTranslations = {};')

# 2. Add translations to loadMockData
js = js.replace('fetch("data/congestion-mock.json").then(r => r.json()),', 'fetch("data/congestion-mock.json").then(r => r.json()),\n      fetch("data/translations.json").then(r => r.json()),')
js = js.replace('congestionMap = congestion;', 'congestionMap = congestion;\n    uiTranslations = translations;')

# 3. Add updateUIForLanguage to HELPERS
helpers = '''function $(id) { return document.getElementById(id); }

function updateUIForLanguage(lang) {
  const dict = uiTranslations[lang] || uiTranslations["en"];
  if (!dict) return;

  document.querySelectorAll("[data-i18n]").forEach(el => {
    const key = el.getAttribute("data-i18n");
    if (dict[key]) el.textContent = dict[key];
  });
}'''
js = js.replace('function $(id) { return document.getElementById(id); }', helpers)

# 4. Call in boot()
js = js.replace('await loadMockData();', 'await loadMockData();\n  updateUIForLanguage(session.language);')

# 5. Add select listener
submit_listener = '$("btn-submit-ticket").addEventListener("click", submitTicket);'
new_submit_listener = submit_listener + '\n\n$("select-language").addEventListener("change", (e) => {\n  session.language = e.target.value;\n  updateUIForLanguage(session.language);\n});'
js = js.replace(submit_listener, new_submit_listener)

# 6. Add to btn-restart
js = js.replace('$("select-language").value = "en";', '$("select-language").value = "en";\n  updateUIForLanguage("en");')

# 7. update showHelpConnect
old_help = '''function showHelpConnect() {
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
}'''

new_help = '''function showHelpConnect() {
  showResultLoading("loading_staff");

  setTimeout(() => {
    const dict = uiTranslations[session.language] || uiTranslations["en"];
    const escortNote = session.mobility
      ? dict.staff_escort.replace("${gate}", session.gate.label)
      : "";
    const msg = dict.staff_success.replace("${gate}", session.gate.label).replace("${escort}", escortNote);

    showResultCard(
      "🤝",
      dict.staff_notified,
      msg,
      "help-card",
      null
    );
    pushA11yUpdate(msg, "result");
  }, 2000);
}'''
js = js.replace(old_help, new_help)

# 8. update fetchDirections
js = js.replace('showResultLoading("Getting your personalised exit directions…");', 'showResultLoading("loading_directions");')

# 9. update handleDirectionsState
js = js.replace('showResultCard("🧭", "Your Exit Route", message, "", source);', 'const dict = uiTranslations[session.language] || uiTranslations["en"];\n  showResultCard("🧭", dict.your_exit_route, message, "", source);')

# 10. update handleWaitState
js = js.replace('showResultCard("⏳", "Please Wait", message, "wait-card", source);', 'const dict = uiTranslations[session.language] || uiTranslations["en"];\n  showResultCard("⏳", dict.please_wait, message, "wait-card", source);')

# 11. update showResultLoading
old_loading = '''function showResultLoading(text) {
  $("result-loading").querySelector("p").textContent = text;'''
new_loading = '''function showResultLoading(textKey) {
  const dict = uiTranslations[session.language] || uiTranslations["en"];
  $("result-loading").querySelector("p").textContent = dict ? dict[textKey] : textKey;'''
js = js.replace(old_loading, new_loading)

# 12. update showResultCard source text
old_src = '''    src.textContent = source === "gemini"
      ? "Powered by Gemini 2.5 Flash"
      : source === "fallback"
        ? "Local fallback (no API key)"
        : "Staff notification system";'''
new_src = '''    const dict = uiTranslations[session.language] || uiTranslations["en"];
    src.textContent = source === "gemini"
      ? dict.src_gemini
      : source === "fallback"
        ? dict.src_fallback
        : dict.src_staff;'''
js = js.replace(old_src, new_src)

with open('public/app.js', 'w', encoding='utf-8') as f:
    f.write(js)
print('Done!')
