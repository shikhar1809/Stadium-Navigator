import re

with open('public/app.js', 'r', encoding='utf-8') as f:
    js = f.read()

# Replace ticket screen logic
old_ticket = """// ═════════════════════════════════════════════════════════════════════════════
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

$("select-language").addEventListener("change", (e) => {
  session.language = e.target.value;
  updateUIForLanguage(session.language);
});
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
}"""

new_ticket = """// ═════════════════════════════════════════════════════════════════════════════
// TICKET SCREEN
// ═════════════════════════════════════════════════════════════════════════════
$("select-language").addEventListener("change", (e) => {
  session.language = e.target.value;
  updateUIForLanguage(session.language);
});

$("btn-demo").addEventListener("click", triggerScanFlow);

function triggerScanFlow() {
  const idleUi = $("scan-ui-idle");
  const activeUi = $("scan-ui-active");
  const statusText = $("scan-status-text");

  idleUi.classList.add("hidden");
  activeUi.classList.remove("hidden");

  const dict = uiTranslations[session.language] || uiTranslations["en"];
  statusText.textContent = "Ticket scanned ✅";
  
  setTimeout(() => {
    statusText.textContent = "Fetching seat details...";
    
    setTimeout(() => {
      statusText.textContent = "Mapping out accessibility needs...";
      
      setTimeout(() => {
        statusText.textContent = "All set! ✨";
        
        setTimeout(() => {
          const demo = stadiumSeed?.demoTicket ?? { section: "120", language: "en" };
          session.section = parseInt(demo.section, 10);
          session.mobility = true; // explicitly mock mobility to show rerouting
          session.vision = false;
          session.hearing = false;
          resolveGate();
        }, 1000);
      }, 1500);
    }, 1500);
  }, 1000);
}"""

js = js.replace(old_ticket, new_ticket)

# Replace validation helpers
old_helpers = """// ─── Validation helpers ───────────────────────────────────────────────────────
function showFieldError() {
  $("input-section").classList.add("error");
  $("section-error").classList.add("visible");
  $("input-section").setAttribute("aria-invalid", "true");
}
function clearFieldError() {
  $("input-section").classList.remove("error");
  $("section-error").classList.remove("visible");
  $("input-section").setAttribute("aria-invalid", "false");
}"""

js = js.replace(old_helpers, "")

# Replace restart logic
old_restart = """$("btn-restart").addEventListener("click", () => {
  clearCountdown();
  clearTimeout(matchTimer);
  resetSession();
  showScreen("ticket");
  $("gate-override").classList.add("hidden");
  $("input-section").value  = "";
  $("select-language").value = "en";
  updateUIForLanguage("en");
  $("check-mobility").checked = false;
  $("check-vision").checked   = false;
  $("check-hearing").checked  = false;
});"""

new_restart = """$("btn-restart").addEventListener("click", () => {
  clearCountdown();
  clearTimeout(matchTimer);
  resetSession();
  
  const idleUi = $("scan-ui-idle");
  const activeUi = $("scan-ui-active");
  if (idleUi) idleUi.classList.remove("hidden");
  if (activeUi) activeUi.classList.add("hidden");
  
  showScreen("ticket");
  $("gate-override").classList.add("hidden");
  $("select-language").value = "en";
  updateUIForLanguage("en");
});"""

js = js.replace(old_restart, new_restart)

with open('public/app.js', 'w', encoding='utf-8') as f:
    f.write(js)
print("Done patching app.js")
