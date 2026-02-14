import { supabase } from "./supabaseClient.js";
// Trucking Made Simple — DEMO app.js (Settings + Scenario clean refresh)

// ---------- Tiny helpers ----------
const $ = (id) => document.getElementById(id);
const qs = (sel) => document.querySelector(sel);
const qsa = (sel) => Array.from(document.querySelectorAll(sel));

const money = (n) => {
  const x = Number(n);
  if (!Number.isFinite(x)) return "$0.00";
  return x.toLocaleString(undefined, { style: "currency", currency: "USD" });
};

const num = (id, fallback = 0) => {
  const el = $(id);
  if (!el) return fallback;
  const v = Number(el.value);
  return Number.isFinite(v) ? v : fallback;
};

const todayISO = () => new Date().toISOString().slice(0, 10);

// ---------- LocalStorage keys ----------
const LS_SETTINGS = "tms_settings_v1";
const LS_LIFETIME_MILES = "lifetimeMiles";
const LS_LIFETIME_GALLONS = "lifetimeGallons";

// ---------- Storage ----------
function getSettings() {
  try {
    return JSON.parse(localStorage.getItem(LS_SETTINGS) || "null");
  } catch {
    return null;
  }
}
function saveSettings(obj) {
  localStorage.setItem(LS_SETTINGS, JSON.stringify(obj));
}

// ---------- Tabs / screens (matches your HTML: data-screen + .screen) ----------
function setActiveScreen(name) {
  qsa(".screen").forEach((s) => s.classList.remove("active"));
  qsa(".tab").forEach((t) => t.classList.remove("active"));

  const screen = $(`screen-${name}`);
  const tab = qs(`.tab[data-screen="${name}"]`);

  if (screen) screen.classList.add("active");
  if (tab) tab.classList.add("active");
}

// ---------- Settings ----------
const SETTINGS_DEFAULTS = {
  household: 5259,
  businessFixed: 1742,
  defaultMpg: 4.6,
  tank: 280,
  fuelStopMin: 15,
  reserves: {
    factoring: 0.02,
    tax: 0.28,
    plates: 0.05,
    ifta: 0.05,
    maint: 0.07,
    highway: 0.05,
    tires: 0.05,
  },
};

function readSettingsFromInputs() {
  return {
    household: num("s_household", 0),
    businessFixed: num("s_businessFixed", 0),
    defaultMpg: num("s_defaultMpg", SETTINGS_DEFAULTS.defaultMpg),
    tank: num("s_tank", SETTINGS_DEFAULTS.tank),
    fuelStopMin: num("s_fuelStopMin", SETTINGS_DEFAULTS.fuelStopMin),
    reserves: {
      factoring: num("r_factoring", SETTINGS_DEFAULTS.reserves.factoring),
      tax: num("r_tax", SETTINGS_DEFAULTS.reserves.tax),
      plates: num("r_plates", SETTINGS_DEFAULTS.reserves.plates),
      ifta: num("r_ifta", SETTINGS_DEFAULTS.reserves.ifta),
      maint: num("r_maint", SETTINGS_DEFAULTS.reserves.maint),
      highway: num("r_highway", SETTINGS_DEFAULTS.reserves.highway),
      tires: num("r_tires", SETTINGS_DEFAULTS.reserves.tires),
    },
  };
}

function applySettingsToInputs(s) {
  if (!s) return;

  $("s_household").value = s.household ?? "";
  $("s_businessFixed").value = s.businessFixed ?? "";
  $("s_defaultMpg").value = s.defaultMpg ?? "";
  $("s_tank").value = s.tank ?? "";
  $("s_fuelStopMin").value = s.fuelStopMin ?? "";

  $("r_factoring").value = s.reserves?.factoring ?? "";
  $("r_tax").value = s.reserves?.tax ?? "";
  $("r_plates").value = s.reserves?.plates ?? "";
  $("r_ifta").value = s.reserves?.ifta ?? "";
  $("r_maint").value = s.reserves?.maint ?? "";
  $("r_highway").value = s.reserves?.highway ?? "";
  $("r_tires").value = s.reserves?.tires ?? "";
}

function saveSettingsPlainLock() {
  const raw = readSettingsFromInputs();

  // Guardrails (preferences only, does NOT change formulas)
  const safe = {
    household: Math.max(0, Number(raw.household) || 0),
    businessFixed: Math.max(0, Number(raw.businessFixed) || 0),
    defaultMpg: Math.max(1, Number(raw.defaultMpg) || SETTINGS_DEFAULTS.defaultMpg),
    tank: Math.max(0, Number(raw.tank) || SETTINGS_DEFAULTS.tank),
    fuelStopMin: Math.max(0, Number(raw.fuelStopMin) || SETTINGS_DEFAULTS.fuelStopMin),
    reserves: {
      factoring: Math.max(0, Number(raw.reserves.factoring) || 0),
      tax: Math.max(0, Number(raw.reserves.tax) || 0),
      plates: Math.max(0, Number(raw.reserves.plates) || 0),
      ifta: Math.max(0, Number(raw.reserves.ifta) || 0),
      maint: Math.max(0, Number(raw.reserves.maint) || 0),
      highway: Math.max(0, Number(raw.reserves.highway) || 0),
      tires: Math.max(0, Number(raw.reserves.tires) || 0),
    },
  };

  saveSettings(safe);
  const hint = $("settingsHint");
  if (hint) hint.textContent = "✅ Settings saved. (Preferences only — formulas are locked.)";
}

function resetSettingsPlainLock() {
  applySettingsToInputs(SETTINGS_DEFAULTS);
  saveSettings(SETTINGS_DEFAULTS);
  const hint = $("settingsHint");
  if (hint) hint.textContent = "♻️ Reset to defaults. (Preferences only — formulas are locked.)";
}

function needSettings() {
  const s = getSettings();
  const hint = $("settingsHint");

  if (!s) {
    if (hint) hint.textContent = "Please enter Settings and tap “Save Settings”.";
    setActiveScreen("settings");
    return null;
  }
  if (hint) hint.textContent = "";
  return s;
}

// ---------- Scenario lock rules ----------
const SCENARIO_LOCK = {
  requiredIds: ["sc_deadhead", "sc_loaded", "sc_gross"],
  warnReturnIfGteLoaded: true,
  lockReturnMilesWhenOff: true,
};

function setScenarioWarn(msg = "", mode = "ok") {
  const el = $("scenarioLockWarn");
  if (!el) return;
  el.classList.remove("ok", "warn", "bad");
  el.classList.add(mode);
  el.textContent = msg;
}

function enforceScenarioReturnLock() {
  const toggle = $("sc_returnToggle");
  const rm = $("sc_returnMiles");
  if (!toggle || !rm) return;

  const returning = !!toggle.checked;

  if (SCENARIO_LOCK.lockReturnMilesWhenOff && !returning) {
    rm.value = "0";
    rm.disabled = true;
    rm.classList.add("locked");
  } else {
    rm.disabled = false;
    rm.classList.remove("locked");
  }
}

function scenarioInputsAreValid() {
  const deadhead = num("sc_deadhead", NaN);
  const loaded = num("sc_loaded", NaN);
  const gross = num("sc_gross", NaN);

  if (![deadhead, loaded, gross].every(Number.isFinite)) return false;
  if (deadhead < 0 || loaded < 0 || gross < 0) return false;

  const returning = $("sc_returnToggle")?.checked;
  const returnMiles = num("sc_returnMiles", 0);
  if (returning && returnMiles < 0) return false;

  return true;
}

function updateScenarioCalcButtonState() {
  const btn = $("btnCalcScenario");
  if (!btn) return;

  const ok = scenarioInputsAreValid();
  btn.disabled = !ok;

  if (!ok) {
    setScenarioWarn("Fill required fields: Deadhead, Loaded, Gross Revenue.", "bad");
  } else {
    setScenarioWarn("Ready. Scenario is estimate-only and will not save to history.", "ok");
  }
}

function scenarioSoftWarnings() {
  const returning = $("sc_returnToggle")?.checked;
  const loaded = num("sc_loaded", 0);
  const returnMiles = num("sc_returnMiles", 0);

  if (SCENARIO_LOCK.warnReturnIfGteLoaded && returning && loaded > 0 && returnMiles >= loaded) {
    setScenarioWarn(
      "⚠️ Return Miles are equal to or greater than Loaded Miles. Confirm this reposition back home/yard is real.",
      "warn"
    );
  }
}

function getScenarioTotalMiles() {
  const deadhead = num("sc_deadhead", 0);
  const loaded = num("sc_loaded", 0);
  const returning = $("sc_returnToggle")?.checked;
  const returnMiles = returning ? num("sc_returnMiles", 0) : 0;
  return deadhead + loaded + returnMiles;
}

// ---------- Lifetime MPG ----------
function getLifetimeMpgUsed(fallbackMpg = 6.8) {
  const miles = Number(localStorage.getItem(LS_LIFETIME_MILES) || 0);
  const gallons = Number(localStorage.getItem(LS_LIFETIME_GALLONS) || 0);
  if (miles > 0 && gallons > 0) return miles / gallons;
  return fallbackMpg;
}

function fix2(n) {
  return Number.isFinite(n) ? n.toFixed(2) : "";
}

// ---------- Scenario fuel UI (read-only boxes) ----------
function updateScenarioFuelUI() {
  const totalMiles = getScenarioTotalMiles();
  const fuelPrice = num("sc_fuelPrice", 0);

  const mpgUsed = getLifetimeMpgUsed(6.8);
  const estGallons = mpgUsed > 0 ? totalMiles / mpgUsed : 0;
  const estFuelCost = estGallons * fuelPrice;

  if ($("sc_mpgUsed")) $("sc_mpgUsed").value = fix2(mpgUsed);
  if ($("sc_estGallons")) $("sc_estGallons").value = fix2(estGallons);
  if ($("sc_estFuelCost")) $("sc_estFuelCost").value = fix2(estFuelCost);

  return { totalMiles, fuelPrice, mpgUsed, estGallons, estFuelCost };
}

// ---------- Scenario hours away (read-only box) ----------
function updateScenarioHoursAwayUI(settings) {
  const out = $("sc_estHoursAway");
  if (!out) return;

  const deadhead = num("sc_deadhead", 0);
  const loaded = num("sc_loaded", 0);
  const returning = $("sc_returnToggle")?.checked;
  const returnMiles = returning ? num("sc_returnMiles", 0) : 0;
  const waitHours = num("sc_wait", 0);

  const totalMiles = deadhead + loaded + returnMiles;

  // speed from settings if you later add it; otherwise 47 mph
  const avgSpeed = Number.isFinite(settings?.avgSpeed) && settings.avgSpeed > 0 ? settings.avgSpeed : 47;
  const driveHours = avgSpeed > 0 ? totalMiles / avgSpeed : 0;

  // DOT 30-min break every 8 driving hours
  const dotBreaks = Math.floor(driveHours / 8);
  const dotBreakHours = dotBreaks * 0.5;

  // Fuel stops (15 minutes each) — simple rule
  const fuelStops = Math.max(0, Math.floor(totalMiles / 500));
  const fuelStopHours = fuelStops * 0.25;

  // 10-hour sleeper breaks (every 11 driving hours)
  const sleeperBreaks = Math.floor(driveHours / 11);
  const sleeperHours = sleeperBreaks * 10;

  const totalHoursAway = driveHours + waitHours + dotBreakHours + fuelStopHours + sleeperHours;

  out.value = totalHoursAway > 0 ? totalHoursAway.toFixed(1) : "";

  return {
    driveHours,
    waitHours,
    dotBreaks,
    dotBreakHours,
    fuelStops,
    fuelStopHours,
    sleeperBreaks,
    sleeperHours,
    totalHoursAway,
  };
}

// ---------- Core math ----------
function calcCore(inputs, settings, fuelPrice = 0, gallons = 0, hoursAway = 0) {
  const deadhead = Number(inputs.deadhead) || 0;
  const loaded = Number(inputs.loaded) || 0;
  const returning = !!inputs.returning;
  const returnMiles = returning ? (Number(inputs.returnMiles) || 0) : 0;
  const gross = Number(inputs.gross) || 0;

  const totalMiles = deadhead + loaded + returnMiles;

  const mpg = Number(settings?.defaultMpg) || 4.6;
  const estGallons = mpg > 0 ? totalMiles / mpg : 0;

  const fuelCost = gallons > 0 ? gallons * fuelPrice : estGallons * fuelPrice;

  const monthlyFixed = (Number(settings?.household) || 0) + (Number(settings?.businessFixed) || 0);
  const dailyFixed = monthlyFixed / 30;

  const tripDays = Math.max(0.25, (hoursAway > 0 ? hoursAway / 24 : 1));
  const fixedTripCost = dailyFixed * tripDays;

  const reservesPct =
    (Number(settings?.reserves?.factoring) || 0) +
    (Number(settings?.reserves?.tax) || 0) +
    (Number(settings?.reserves?.plates) || 0) +
    (Number(settings?.reserves?.ifta) || 0) +
    (Number(settings?.reserves?.maint) || 0) +
    (Number(settings?.reserves?.highway) || 0) +
    (Number(settings?.reserves?.tires) || 0);

  const reserves = gross * reservesPct;

  const net = gross - fuelCost - fixedTripCost - reserves;
  const otrHours = hoursAway > 0 ? hoursAway : 24;
  const otr = otrHours > 0 ? (net / otrHours) : 0;

  return { totalMiles, fuelCost, fixedTripCost, reservesPct, reserves, net, otr };
}

// ---------- Render Scenario ----------
function renderScenario(out, hoursBreakdown) {
  const el = $("scenarioOut");
  if (!el || !out) return;

  const totalMiles = Number.isFinite(out.totalMiles) ? out.totalMiles : 0;
  const fuelCost = Number.isFinite(out.fuelCost) ? out.fuelCost : 0;
  const fixedTripCost = Number.isFinite(out.fixedTripCost) ? out.fixedTripCost : 0;
  const reserves = Number.isFinite(out.reserves) ? out.reserves : 0;
  const reservesPct = Number.isFinite(out.reservesPct) ? out.reservesPct : 0;
  const net = Number.isFinite(out.net) ? out.net : 0;
  const otr = Number.isFinite(out.otr) ? out.otr : 0;

  const hb = hoursBreakdown || {};
  const driveHours = Number.isFinite(hb.driveHours) ? hb.driveHours : 0;
  const waitHours = Number.isFinite(hb.waitHours) ? hb.waitHours : 0;
  const dotBreakHours = Number.isFinite(hb.dotBreakHours) ? hb.dotBreakHours : 0;
  const dotBreaks = Number.isFinite(hb.dotBreaks) ? hb.dotBreaks : 0;
  const fuelStopHours = Number.isFinite(hb.fuelStopHours) ? hb.fuelStopHours : 0;
  const fuelStops = Number.isFinite(hb.fuelStops) ? hb.fuelStops : 0;
  const sleeperHours = Number.isFinite(hb.sleeperHours) ? hb.sleeperHours : 0;
  const sleeperBreaks = Number.isFinite(hb.sleeperBreaks) ? hb.sleeperBreaks : 0;
  const totalHoursAway = Number.isFinite(hb.totalHoursAway) ? hb.totalHoursAway : 0;

  el.textContent =
`Total Miles: ${totalMiles.toFixed(1)}
Fuel Cost: ${money(fuelCost)}
Fixed Trip Cost: ${money(fixedTripCost)}
Reserves (${(reservesPct * 100).toFixed(1)}%): ${money(reserves)}
Net: ${money(net)}
O.T.R.A.F.F: ${money(otr)}/hr

Hours Breakdown:
Drive: ${driveHours.toFixed(1)}
Wait/Unload: ${waitHours.toFixed(1)}
DOT 30-min Breaks: ${dotBreakHours.toFixed(1)} (${dotBreaks})
Fuel Stops: ${fuelStopHours.toFixed(2)} (${fuelStops} @ 15m)
10-hr Sleeper: ${sleeperHours.toFixed(1)} (${sleeperBreaks})
TOTAL Hours Away: ${totalHoursAway.toFixed(1)}
`;
}

// ---------- Calculate Scenario (Plain Lock) ----------
function calculateScenarioLocked() {
  const s = needSettings();
  if (!s) return;

  enforceScenarioReturnLock();
  updateScenarioCalcButtonState();
  if (!scenarioInputsAreValid()) return;

  const deadhead = num("sc_deadhead", 0);
  const loaded = num("sc_loaded", 0);
  const gross = num("sc_gross", 0);

  const returning = $("sc_returnToggle")?.checked;
  const returnMiles = returning ? num("sc_returnMiles", 0) : 0;

  // hours away breakdown
  const hb = updateScenarioHoursAwayUI(s) || { totalHoursAway: 0 };

  // fuel estimate UI (read-only)
  updateScenarioFuelUI();

  // Scenario fuel is estimate-only (no gallons)
  const fuelPrice = num("sc_fuelPrice", 0);
  const gallons = 0;

  const out = calcCore(
    { deadhead, loaded, returning, returnMiles, gross },
    s,
    fuelPrice,
    gallons,
    hb.totalHoursAway || 0
  );

  renderScenario(out, hb);
  scenarioSoftWarnings();
}

// ---------- Wire up ----------
document.addEventListener("DOMContentLoaded", () => {
  // Tabs
  qsa(".tab").forEach((btn) => {
    btn.addEventListener("click", () => setActiveScreen(btn.dataset.screen));
  });

  // Load saved settings into inputs on startup (or defaults)
  const saved = getSettings();
  if (saved) applySettingsToInputs(saved);
  else applySettingsToInputs(SETTINGS_DEFAULTS);

  // Settings buttons
  $("btnLoadTestData")?.addEventListener("click", () => {
    applySettingsToInputs(SETTINGS_DEFAULTS);
    $("settingsHint").textContent = "Test data loaded. Tap “Save Settings”.";
  });

  $("btnSaveSettings")?.addEventListener("click", () => saveSettingsPlainLock());
  $("btnResetSettings")?.addEventListener("click", () => resetSettingsPlainLock());

  // Scenario Calculate
  $("btnCalcScenario")?.addEventListener("click", () => calculateScenarioLocked());

  // Scenario live updates
  ["sc_deadhead", "sc_loaded", "sc_gross", "sc_returnMiles", "sc_fuelPrice", "sc_wait"].forEach((id) => {
    $(id)?.addEventListener("input", () => {
      const s = getSettings() || SETTINGS_DEFAULTS;
      enforceScenarioReturnLock();
      updateScenarioCalcButtonState();
      updateScenarioFuelUI();
      updateScenarioHoursAwayUI(s);
    });
  });

  $("sc_returnToggle")?.addEventListener("change", () => {
    const s = getSettings() || SETTINGS_DEFAULTS;
    enforceScenarioReturnLock();
    updateScenarioCalcButtonState();
    updateScenarioFuelUI();
    updateScenarioHoursAwayUI(s);
  });

  // Initial state
  setActiveScreen("settings");
  enforceScenarioReturnLock();
  updateScenarioCalcButtonState();
  updateScenarioFuelUI();
  updateScenarioHoursAwayUI(getSettings() || SETTINGS_DEFAULTS);
});
