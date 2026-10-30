/**
 * API Service — connects the React frontend to the FastAPI backend pipeline.
 *
 * Every function returns a Promise that resolves with the JSON body.
 * All data-mutating calls accept an optional `userId` to enable per-user isolation.
 */

const VITE_API_URL = import.meta.env.VITE_API_URL;
const isDev = import.meta.env.DEV;
const API_BASE = (VITE_API_URL && VITE_API_URL !== "undefined")
  ? VITE_API_URL
  : (isDev ? "http://127.0.0.1:8000" : "");

// ─── helpers ─────────────────────────────────────────────────

async function request(path, options = {}) {
  const res = await fetch(`${API_BASE}${path}`, options);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.detail || `API error ${res.status}`);
  }
  return res.json();
}

// ─── PIPELINE endpoints (auto-persist to Supabase) ──────────

/** Analyze text → returns analysis + energy + saves to Supabase (per-user) */
export async function analyzeText(text, userId = null) {
  const body = { text };
  if (userId) body.user_id = userId;
  return request("/api/analyze/text", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

/** Analyze voice → transcribe + analysis + energy + saves to Supabase (per-user) */
export async function analyzeVoice(audioFile, userId = null) {
  const form = new FormData();
  form.append("audio", audioFile);
  if (userId) form.append("user_id", userId);
  return request("/api/analyze/voice", { method: "POST", body: form });
}

// ─── QUERY endpoints (read from Supabase, filtered by user) ─

/** Recent analysis sessions for the current user */
export async function getSessions(limit = 20, userId = null) {
  const params = new URLSearchParams({ limit });
  if (userId) params.set("user_id", userId);
  return request(`/api/sessions?${params}`);
}

/** Single session detail */
export async function getSession(sessionId) {
  return request(`/api/sessions/${sessionId}`);
}

/** Energy score history for the current user */
export async function getEnergyHistory(limit = 50, userId = null) {
  const params = new URLSearchParams({ limit });
  if (userId) params.set("user_id", userId);
  return request(`/api/energy-history?${params}`);
}

/** Daily average energy for the current user */
export async function getEnergyDaily(userId = null) {
  const params = new URLSearchParams();
  if (userId) params.set("user_id", userId);
  const qs = params.toString();
  return request(`/api/energy-daily${qs ? '?' + qs : ''}`);
}

// ─── STANDALONE endpoints (no persistence) ──────────────────

/** Quick text classification (no save) */
export async function quickTextAnalysis(text) {
  return request("/api/text-analysis", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
  });
}

/** Manual energy calculation (no save) */
export async function calculateEnergy({ stress_level, anxiety_level, depression_level, tone, base_energy = 70 }) {
  return request("/api/energy-calculate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ stress_level, anxiety_level, depression_level, tone, base_energy }),
  });
}

// ─── HEALTH / INFO ──────────────────────────────────────────

export async function healthCheck() {
  return request("/api/health");
}

export async function getModelInfo() {
  return request("/api/model-info");
}

export async function testSupabase() {
  return request("/api/test-supabase");
}

// ─── SUPABASE REALTIME (optional, direct subscription) ──────

import { supabase } from "./supabaseClient";

/**
 * Subscribe to new analysis sessions in realtime (filtered by user_id).
 */
export function subscribeToSessions(callback, userId = null) {
  const filter = userId
    ? { event: "INSERT", schema: "public", table: "analysis_sessions", filter: `user_id=eq.${userId}` }
    : { event: "INSERT", schema: "public", table: "analysis_sessions" };

  const channel = supabase
    .channel("analysis_sessions_changes")
    .on("postgres_changes", filter, (payload) => callback(payload.new))
    .subscribe();

  return () => supabase.removeChannel(channel);
}

/**
 * Subscribe to energy_history inserts for live chart updates (filtered by user_id).
 */
export function subscribeToEnergyHistory(callback, userId = null) {
  const filter = userId
    ? { event: "INSERT", schema: "public", table: "energy_history", filter: `user_id=eq.${userId}` }
    : { event: "INSERT", schema: "public", table: "energy_history" };

  const channel = supabase
    .channel("energy_history_changes")
    .on("postgres_changes", filter, (payload) => callback(payload.new))
    .subscribe();

  return () => supabase.removeChannel(channel);
}

// ─── SPOONSENSE MILESTONE 1 & 2 API CLIENT ──────────────────

/** Get today's real-time energy snapshot & why-factors */
export async function getTodaySnapshot(userId, probeRt = null, baselineRt = null) {
  const params = new URLSearchParams();
  if (probeRt !== null) params.set("probe_rt", probeRt);
  if (baselineRt !== null) params.set("baseline_rt", baselineRt);
  const qs = params.toString();
  return request(`/api/me/snapshot/today/${userId || 'anonymous'}${qs ? '?' + qs : ''}`);
}

/** Get 7-day energy weather forecast */
export async function getForecast(userId, startDate = null) {
  const params = new URLSearchParams();
  if (startDate) params.set("start_date", startDate);
  const qs = params.toString();
  return request(`/api/forecast/${userId || 'anonymous'}${qs ? '?' + qs : ''}`);
}

/** Submit 20-second game probe result (Pulse, Switch, Pop) */
export async function submitGameResult(data) {
  return request("/api/games/result", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
}

/** Fetch user's cognitive game baseline info */
export async function getGameBaseline(userId) {
  return request(`/api/games/baseline/${userId || 'anonymous'}`);
}

/** Manually adjust today's spoons using the slider (FR-SP-04) */
export async function overrideSpoons(userId, spoons, targetDate = null) {
  return request("/api/snapshot/override", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      user_id: userId || 'anonymous',
      spoons: Number(spoons),
      target_date: targetDate,
    }),
  });
}

/** Calibrate energy budget from multi-factor inputs (commute, classes, chores, sleep, sensory) */
export async function calibrateEnergy(data) {
  return request("/api/user/calibrate-energy", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
}

/** Submit first-time student onboarding setup */
export async function submitOnboarding(data) {
  return request("/api/user/onboarding", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
}

/** Parse an ICS calendar string */
export async function parseICS(icsContent) {
  return request("/api/timetable/ics", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ics_content: icsContent }),
  });
}

/** Get VJTI sample timetable ICS */
export async function getSampleICS() {
  return request("/api/timetable/sample-ics");
}

/** Parse manual weekly grid */
export async function parseGrid(gridData) {
  return request("/api/timetable/grid", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ grid: gridData }),
  });
}

/** Save confirmed timetable blocks */
export async function saveTimetable(userId, blocks) {
  return request("/api/timetable", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      user_id: userId || 'anonymous',
      blocks,
    }),
  });
}

/** Get saved timetable blocks */
export async function getTimetable(userId) {
  return request(`/api/timetable/${userId || 'anonymous'}`);
}

/** Save commute profile */
export async function saveCommute(commuteData) {
  return request("/api/commute", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(commuteData),
  });
}

/** Get commute profile */
export async function getCommute(userId) {
  return request(`/api/commute/${userId || 'anonymous'}`);
}


// ─── SPOONSENSE MILESTONE 3 API CLIENT ──────────────────────

/** Add task with auto-computed spoon cost badge (FEAT-C1) */
export async function addTask(userId, taskData) {
  return request("/api/tasks", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      user_id: userId || 'anonymous',
      ...taskData,
    }),
  });
}

/** Get tasks with spoon cost badges (FEAT-C1) */
export async function getTasks(userId, includeCompleted = false) {
  return request(`/api/tasks/${userId || 'anonymous'}?include_completed=${includeCompleted}`);
}

/** Complete a task (FEAT-C1, FEAT-E2) */
export async function completeTask(userId, taskId) {
  return request("/api/tasks/complete", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      user_id: userId || 'anonymous',
      task_id: taskId,
    }),
  });
}

/** Add a rest block that credits spoons back (FEAT-C5) */
export async function addRestBlock(userId, title = "Rest & Recharge", minutes = 20) {
  return request("/api/tasks/rest-block", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      user_id: userId || 'anonymous',
      title,
      minutes,
    }),
  });
}

/** Generate today's capacity-sized day plan (FEAT-C2) */
export async function planToday(userId, targetDate = null) {
  return request("/api/plan/today", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      user_id: userId || 'anonymous',
      target_date: targetDate,
    }),
  });
}

/** Generate 7-day capacity-sized plan (FEAT-C2) */
export async function planWeek(userId, startDate = null) {
  return request("/api/plan/week", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      user_id: userId || 'anonymous',
      start_date: startDate,
    }),
  });
}

/** Auto-reshuffle overloaded tasks to lighter days (FEAT-C3) */
export async function reshufflePlan(userId) {
  return request("/api/plan/reshuffle", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      user_id: userId || 'anonymous',
    }),
  });
}

/** Generate polite, academic-framed extension email draft (FEAT-C4) */
export async function generateExtensionEmail(data) {
  return request("/api/plan/extension-email", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
}

/** Get user's Forgiving Garden state (FEAT-E2) */
export async function getGarden(userId) {
  return request(`/api/garden/${userId || 'anonymous'}`);
}

/** Record garden action (login, micro_step, rest, etc.) (FEAT-E2) */
export async function recordGardenAction(userId, action) {
  return request("/api/garden/action", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      user_id: userId || 'anonymous',
      action,
    }),
  });
}

/** Get evening check-in energy level labels (FEAT-E3) */
export async function getEveningLabels() {
  return request("/api/evening/labels");
}

/** Submit one-tap evening check-in (FEAT-E3) */
export async function submitEveningCheckin(userId, energyLevel, optionalNote = "") {
  return request("/api/evening/checkin", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      user_id: userId || 'anonymous',
      energy_level: energyLevel,
      optional_note: optionalNote,
    }),
  });
}

/** Skip evening check-in with zero penalty (FEAT-E3) */
export async function skipEveningCheckin(userId) {
  return request("/api/evening/skip", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      user_id: userId || 'anonymous',
      action: "skip",
    }),
  });
}

/** Get evening check-in history (FEAT-E3) */
export async function getEveningHistory(userId, limit = 14) {
  return request(`/api/evening/history/${userId || 'anonymous'}?limit=${limit}`);
}

/** Get Dopamine Menu (FEAT-E4) */
export async function getDopamineMenu(userId) {
  return request(`/api/dopamine/menu/${userId || 'anonymous'}`);
}

/** Engage with a dopamine menu item (FEAT-E4) */
export async function engageDopamineItem(userId, itemId) {
  return request("/api/dopamine/engage", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      user_id: userId || 'anonymous',
      item_id: itemId,
    }),
  });
}

/** Add custom item to dopamine menu (FEAT-E4) */
export async function addDopamineItem(userId, itemData) {
  return request("/api/dopamine/add-item", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      user_id: userId || 'anonymous',
      ...itemData,
    }),
  });
}

// ── Milestone 4: Task Shrinker API (FEAT-D1, D2, D3, D4, D5) ────────────────

/** Shrink a task into micro-steps (FEAT-D1) */
export async function shrinkTask({ title, taskType = 'other', liveSpoons = 6.0, userNote = '', userId }) {
  return request("/api/sequence", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      user_id: userId || 'anonymous',
      title,
      task_type: taskType,
      live_spoons: liveSpoons,
      user_note: userNote,
    }),
  });
}

/** "Smaller Please" sub-divider (FEAT-D3) */
export async function shrinkSmaller({ stepText, taskType = 'other', recursionDepth = 0, userId }) {
  return request("/api/sequence/smaller", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      user_id: userId || 'anonymous',
      step_text: stepText,
      task_type: taskType,
      recursion_depth: recursionDepth,
    }),
  });
}

/** Get coping strategies for a task type (FEAT-D2) */
export async function getCopingStrategies(taskType, situation = 'stuck') {
  return request(`/api/sequence/strategies/${taskType}?situation=${situation}`);
}

/** Explicit offline sequence fallback (FEAT-D4) */
export async function getOfflineSequence({ title, taskType = 'other', liveSpoons = 6.0, userId }) {
  return request("/api/sequence/offline", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      user_id: userId || 'anonymous',
      title,
      task_type: taskType,
      live_spoons: liveSpoons,
    }),
  });
}


// ── Milestone 4: Google Calendar Sync API (FEAT-G3) ─────────────────────────

/** Get Google Calendar sync status */
export async function getCalendarStatus(userId) {
  return request(`/api/calendar/status/${userId || 'anonymous'}`);
}

/** Sync planned blocks to Google Calendar tagged [SpoonSense] */
export async function syncCalendar(userId, tasks = null, targetDate = null) {
  return request("/api/calendar/sync", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      user_id: userId || 'anonymous',
      tasks,
      target_date: targetDate,
    }),
  });
}

/** 1-Tap Google Calendar Disconnect */
export async function disconnectCalendar(userId) {
  return request("/api/calendar/disconnect", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      user_id: userId || 'anonymous',
    }),
  });
}

/** Update Google Calendar preferences */
export async function setCalendarPreferences(userId, readOnly = false, autoSync = true) {
  return request("/api/calendar/preferences", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      user_id: userId || 'anonymous',
      read_only: readOnly,
      auto_sync: autoSync,
    }),
  });
}


// ── Milestone 5: Privacy, Export, Delete & Demo Seeds API (FEAT-G4, FEAT-A3) ─

/** Seed instant demonstration profile: 'aarav' or 'meera' (FEAT-A3) */
export async function seedDemoProfile(persona, userId = null) {
  return request(`/api/demo/seed/${persona}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ user_id: userId }),
  });
}

/** Get transparency privacy manifest (FEAT-G4, FR-ST-01) */
export async function getPrivacyManifest() {
  return request("/api/me/privacy-manifest");
}

/** Export all student data archive as JSON (FEAT-G4, FR-ST-02) */
export async function exportUserData(userId) {
  return request(`/api/me/export/${userId || 'anonymous'}`);
}

/** Permanently purge all user records (FEAT-G4, FR-ST-03) */
export async function deleteUserData(userId) {
  return request(`/api/me/${userId || 'anonymous'}`, {
    method: "DELETE",
  });
}
