import { OUTLOOK_PRODUCT_NAME, type OutlookMachineState, type OutlookMachineView } from "./outlook-types"

interface RenderOutlookAppInput {
  origin: string
  machine: OutlookMachineState
  machineView?: OutlookMachineView
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;")
}

function escapeJsonForHtml(value: unknown): string {
  return JSON.stringify(value)
    .replaceAll("&", "\\u0026")
    .replaceAll("<", "\\u003c")
    .replaceAll(">", "\\u003e")
}

function firstAgentName(machineView: OutlookMachineView | undefined): string {
  return machineView?.agents[0]?.agentName ?? ""
}

function renderAgentButtons(machineView: OutlookMachineView | undefined): string {
  const agents = machineView?.agents ?? []
  if (agents.length === 0) {
    return [
      "<div class=\"outlook-empty-agent-list\">",
      "  <p>No agents are visible yet.</p>",
      "  <p>When the daemon sees enabled bundles on this machine, they will gather here.</p>",
      "</div>",
    ].join("\n")
  }

  return agents.map((agent, index) => [
    `<button class="outlook-agent-chip${index === 0 ? " is-selected" : ""}" type="button" data-agent-name="${escapeHtml(agent.agentName)}">`,
    `  <span class="outlook-agent-chip__name">${escapeHtml(agent.agentName)}</span>`,
    `  <span class="outlook-agent-chip__attention attention-${escapeHtml(agent.attention.level)}">${escapeHtml(agent.attention.label)}</span>`,
    `  <span class="outlook-agent-chip__meta">${agent.tasks.liveCount} live tasks · ${agent.coding.activeCount} coding lanes</span>`,
    "</button>",
  ].join("\n")).join("\n")
}

function renderOverviewCards(machineView: OutlookMachineView | undefined, machine: OutlookMachineState): string {
  const agents = Array.isArray(machine.agents) ? machine.agents : []
  const totals = machineView?.overview.totals ?? {
    agents: machine.agentCount,
    enabledAgents: agents.filter((agent) => agent.enabled).length,
    degradedAgents: agents.filter((agent) => agent.degraded?.status === "degraded").length,
    staleAgents: agents.filter((agent) => agent.freshness?.status === "stale").length,
    liveTasks: agents.reduce((sum, agent) => sum + (agent.tasks?.liveCount ?? 0), 0),
    blockedTasks: agents.reduce((sum, agent) => sum + (agent.tasks?.blockedCount ?? 0), 0),
    openObligations: agents.reduce((sum, agent) => sum + (agent.obligations?.openCount ?? 0), 0),
    activeCodingAgents: agents.reduce((sum, agent) => sum + (agent.coding?.activeCount ?? 0), 0),
    blockedCodingAgents: agents.reduce((sum, agent) => sum + (agent.coding?.blockedCount ?? 0), 0),
  }

  const cards = [
    { label: "Visible agents", value: totals.agents.toString() },
    { label: "Live tasks", value: totals.liveTasks.toString() },
    { label: "Open obligations", value: totals.openObligations.toString() },
    { label: "Active coding", value: totals.activeCodingAgents.toString() },
    { label: "Blocked tasks", value: totals.blockedTasks.toString() },
    { label: "Stale agents", value: totals.staleAgents.toString() },
  ]

  return cards.map((card) => [
    "<article class=\"outlook-stat-card\">",
    `  <span class="outlook-kicker">${escapeHtml(card.label)}</span>`,
    `  <strong class="outlook-stat-card__value">${escapeHtml(card.value)}</strong>`,
    "</article>",
  ].join("\n")).join("\n")
}

function renderEntrypoints(machineView: OutlookMachineView | undefined, origin: string): string {
  const entrypoints = machineView?.overview.entrypoints ?? [
    { kind: "web", label: "Open Outlook", target: `${origin}/outlook` },
    { kind: "cli", label: "CLI JSON", target: "ouro outlook --json" },
  ]

  return entrypoints.map((entrypoint) => [
    "<div class=\"outlook-entrypoint\">",
    `  <span class="outlook-kicker">${escapeHtml(entrypoint.label)}</span>`,
    `  <code>${escapeHtml(entrypoint.target)}</code>`,
    "</div>",
  ].join("\n")).join("\n")
}

function renderRuntimeFacts(machineView: OutlookMachineView | undefined, machine: OutlookMachineState): string {
  const runtime = machineView?.overview.runtime ?? machine.runtime
  const daemon = machineView?.overview.daemon
  const freshness = machineView?.overview.freshness ?? machine.freshness
  const mood = machineView?.overview.mood ?? "watchful"
  const degraded = machineView?.overview.degraded ?? machine.degraded
  const latestActivity = freshness?.latestActivityAt ?? "unknown"

  return [
    `<div class="outlook-fact"><span class="outlook-kicker">Runtime</span><strong>${escapeHtml(runtime?.version ?? "unknown")}</strong></div>`,
    `<div class="outlook-fact"><span class="outlook-kicker">Mode</span><strong>${escapeHtml(daemon?.mode ?? "production")}</strong></div>`,
    `<div class="outlook-fact"><span class="outlook-kicker">Mood</span><strong>${escapeHtml(mood)}</strong></div>`,
    `<div class="outlook-fact"><span class="outlook-kicker">Freshness</span><strong>${escapeHtml(freshness?.status ?? "unknown")}</strong></div>`,
    `<div class="outlook-fact"><span class="outlook-kicker">Latest activity</span><strong>${escapeHtml(latestActivity)}</strong></div>`,
    `<div class="outlook-fact"><span class="outlook-kicker">Degraded</span><strong>${escapeHtml(degraded?.status ?? "ok")}</strong></div>`,
  ].join("\n")
}

const APP_CSS = `
:root {
  --outlook-void: #07110d;
  --outlook-deep: #102116;
  --outlook-moss: #183325;
  --outlook-scale: #2f8f4e;
  --outlook-glow: #74e08f;
  --outlook-bone: #eef2ea;
  --outlook-mist: #a5b8a8;
  --outlook-shadow: #708373;
  --outlook-fang: #d35f47;
  --outlook-line: rgba(110, 160, 117, 0.22);
  --outlook-panel: rgba(10, 22, 16, 0.74);
  --outlook-panel-strong: rgba(13, 29, 21, 0.9);
  --outlook-glass: rgba(21, 44, 32, 0.4);
  --outlook-ring: rgba(116, 224, 143, 0.14);
  --outlook-gold: #d6b56f;
  --outlook-font-display: "Cormorant Garamond", "Iowan Old Style", "Palatino Linotype", serif;
  --outlook-font-body: "Outfit", "Avenir Next", "Segoe UI Variable Text", sans-serif;
  --outlook-font-mono: "JetBrains Mono", "SFMono-Regular", monospace;
  --outlook-radius-lg: 28px;
  --outlook-radius-md: 18px;
  --outlook-radius-sm: 12px;
  --outlook-shadow-lg: 0 30px 80px rgba(0, 0, 0, 0.38);
}
* { box-sizing: border-box; }
html { color-scheme: dark; }
body {
  margin: 0;
  min-height: 100vh;
  font-family: var(--outlook-font-body);
  color: var(--outlook-bone);
  background:
    radial-gradient(circle at top left, rgba(116, 224, 143, 0.12), transparent 28%),
    radial-gradient(circle at 85% 15%, rgba(214, 181, 111, 0.08), transparent 24%),
    linear-gradient(180deg, #08110d 0%, #0c1a12 42%, #07110d 100%);
}
body::before {
  content: "";
  position: fixed;
  inset: 0;
  pointer-events: none;
  background-image:
    linear-gradient(rgba(255,255,255,0.02) 1px, transparent 1px),
    linear-gradient(90deg, rgba(255,255,255,0.02) 1px, transparent 1px);
  background-size: 34px 34px;
  mask-image: radial-gradient(circle at center, black 30%, transparent 82%);
  opacity: 0.35;
}
body::after {
  content: "";
  position: fixed;
  inset: 0;
  pointer-events: none;
  background:
    radial-gradient(circle at 20% 20%, rgba(116, 224, 143, 0.09), transparent 22%),
    radial-gradient(circle at 70% 78%, rgba(47, 143, 78, 0.08), transparent 25%);
  filter: blur(40px);
  opacity: 0.75;
}
.outlook-shell {
  position: relative;
  z-index: 1;
  max-width: 1480px;
  margin: 0 auto;
  padding: 32px 22px 48px;
}
.outlook-sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}
.outlook-nav {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 22px;
  padding: 16px 18px;
  border: 1px solid var(--outlook-line);
  border-radius: 999px;
  background: rgba(8, 18, 13, 0.58);
  backdrop-filter: blur(20px);
  box-shadow: 0 14px 40px rgba(0, 0, 0, 0.22);
}
.outlook-wordmark {
  display: flex;
  align-items: center;
  gap: 12px;
}
.outlook-orb {
  width: 14px;
  height: 14px;
  border-radius: 999px;
  background: radial-gradient(circle at 30% 30%, #c9ffd7 0%, var(--outlook-glow) 30%, var(--outlook-scale) 70%, #173725 100%);
  box-shadow: 0 0 24px rgba(116, 224, 143, 0.45);
}
.outlook-product {
  margin: 0;
  font-family: var(--outlook-font-display);
  font-size: clamp(1.7rem, 2vw, 2.4rem);
  font-style: italic;
  font-weight: 600;
  letter-spacing: 0.01em;
}
.outlook-subtitle {
  margin: 4px 0 0;
  color: var(--outlook-mist);
  font-size: 0.95rem;
}
.outlook-nav-meta {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
  justify-content: flex-end;
}
.outlook-badge {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  border-radius: 999px;
  border: 1px solid var(--outlook-line);
  background: rgba(12, 29, 20, 0.7);
  color: var(--outlook-bone);
  font-family: var(--outlook-font-mono);
  font-size: 0.74rem;
  letter-spacing: 0.05em;
  text-transform: uppercase;
}
.outlook-badge::before {
  content: "";
  width: 8px;
  height: 8px;
  border-radius: 999px;
  background: var(--outlook-glow);
  box-shadow: 0 0 18px rgba(116, 224, 143, 0.45);
}
.outlook-hero {
  position: relative;
  overflow: hidden;
  padding: clamp(28px, 4vw, 52px);
  border-radius: calc(var(--outlook-radius-lg) + 10px);
  border: 1px solid rgba(116, 224, 143, 0.14);
  background:
    linear-gradient(135deg, rgba(9, 18, 14, 0.97) 0%, rgba(13, 30, 21, 0.94) 52%, rgba(11, 21, 16, 0.95) 100%);
  box-shadow: var(--outlook-shadow-lg);
}
.outlook-hero::before {
  content: "";
  position: absolute;
  inset: auto -8% -42% 36%;
  height: 420px;
  background: radial-gradient(circle, rgba(116, 224, 143, 0.2) 0%, rgba(116, 224, 143, 0.05) 35%, transparent 70%);
  filter: blur(10px);
}
.outlook-hero__grid {
  position: relative;
  display: grid;
  gap: 22px;
  grid-template-columns: minmax(0, 1.45fr) minmax(300px, 0.9fr);
}
.outlook-kicker {
  display: inline-block;
  font-family: var(--outlook-font-mono);
  font-size: 0.72rem;
  letter-spacing: 0.22em;
  text-transform: uppercase;
  color: var(--outlook-glow);
}
.outlook-hero h1,
.outlook-section h2,
.outlook-panel h2,
.outlook-agent-panel__empty strong,
.outlook-agent-card h3 {
  margin: 0;
  font-family: var(--outlook-font-display);
  font-style: italic;
  font-weight: 600;
  letter-spacing: 0.01em;
}
.outlook-hero h1 {
  margin-top: 18px;
  font-size: clamp(3rem, 6vw, 5.6rem);
  line-height: 0.94;
  max-width: 8.3ch;
}
.outlook-hero p {
  max-width: 62ch;
  margin: 18px 0 0;
  color: var(--outlook-mist);
  font-size: 1.06rem;
  line-height: 1.8;
}
.outlook-stat-grid {
  display: grid;
  gap: 14px;
  grid-template-columns: repeat(2, minmax(0, 1fr));
}
.outlook-stat-card,
.outlook-facts,
.outlook-entrypoints-panel,
.outlook-agent-panel,
.outlook-agents-rail {
  border: 1px solid var(--outlook-line);
  border-radius: var(--outlook-radius-lg);
  background: var(--outlook-panel);
  backdrop-filter: blur(18px);
}
.outlook-stat-card {
  min-height: 128px;
  padding: 18px;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.02);
}
.outlook-stat-card__value {
  font-size: clamp(2.1rem, 4vw, 3rem);
  letter-spacing: -0.05em;
}
.outlook-layout {
  display: grid;
  gap: 22px;
  margin-top: 22px;
  grid-template-columns: minmax(280px, 0.95fr) minmax(0, 1.65fr);
}
.outlook-agents-rail,
.outlook-agent-panel,
.outlook-facts,
.outlook-entrypoints-panel {
  padding: 20px;
}
.outlook-section,
.outlook-panel {
  display: grid;
  gap: 16px;
}
.outlook-section h2,
.outlook-panel h2 {
  font-size: clamp(1.9rem, 2.4vw, 2.6rem);
}
.outlook-agent-list {
  display: grid;
  gap: 12px;
}
.outlook-agent-chip {
  width: 100%;
  display: grid;
  gap: 6px;
  padding: 16px;
  border-radius: var(--outlook-radius-md);
  border: 1px solid rgba(116, 224, 143, 0.08);
  background: rgba(14, 31, 22, 0.72);
  color: inherit;
  text-align: left;
  cursor: pointer;
  transition: transform 180ms ease, border-color 180ms ease, background 180ms ease;
}
.outlook-agent-chip:hover,
.outlook-agent-chip.is-selected {
  transform: translateY(-2px);
  border-color: rgba(116, 224, 143, 0.28);
  background: rgba(17, 39, 28, 0.88);
}
.outlook-agent-chip__name {
  font-family: var(--outlook-font-display);
  font-size: 1.5rem;
  font-style: italic;
}
.outlook-agent-chip__attention,
.outlook-agent-chip__meta {
  color: var(--outlook-mist);
  font-size: 0.92rem;
}
.outlook-agent-chip__attention.attention-degraded,
.outlook-agent-chip__attention.attention-blocked { color: #ff8d79; }
.outlook-agent-chip__attention.attention-stale { color: var(--outlook-gold); }
.outlook-agent-chip__attention.attention-active { color: var(--outlook-glow); }
.outlook-empty-agent-list,
.outlook-agent-panel__empty {
  padding: 22px;
  border-radius: var(--outlook-radius-md);
  border: 1px dashed rgba(116, 224, 143, 0.2);
  background: rgba(10, 22, 16, 0.6);
  color: var(--outlook-mist);
}
.outlook-empty-agent-list p,
.outlook-agent-panel__empty p { margin: 0; line-height: 1.7; }
.outlook-empty-agent-list p + p,
.outlook-agent-panel__empty p + p { margin-top: 10px; }
.outlook-facts {
  display: grid;
  gap: 16px;
  grid-template-columns: repeat(3, minmax(0, 1fr));
}
.outlook-fact {
  min-height: 92px;
  padding: 16px;
  border-radius: var(--outlook-radius-md);
  background: rgba(12, 26, 18, 0.74);
  border: 1px solid rgba(116, 224, 143, 0.08);
}
.outlook-fact strong {
  display: block;
  margin-top: 10px;
  font-size: 1rem;
  line-height: 1.5;
}
.outlook-entrypoints-panel {
  display: grid;
  gap: 14px;
}
.outlook-entrypoint {
  padding: 14px 16px;
  border-radius: var(--outlook-radius-md);
  background: rgba(12, 27, 19, 0.7);
  border: 1px solid rgba(116, 224, 143, 0.08);
}
.outlook-entrypoint code,
.outlook-agent-panel code {
  display: block;
  margin-top: 8px;
  font-family: var(--outlook-font-mono);
  font-size: 0.84rem;
  color: var(--outlook-bone);
  white-space: pre-wrap;
  word-break: break-word;
}
.outlook-agent-card {
  display: grid;
  gap: 18px;
}
.outlook-agent-card h3 {
  font-size: clamp(2rem, 3vw, 3rem);
}
.outlook-agent-card__lede {
  margin: 0;
  color: var(--outlook-mist);
  line-height: 1.8;
}
.outlook-agent-meta,
.outlook-agent-senses,
.outlook-agent-recent {
  display: grid;
  gap: 10px;
}
.outlook-agent-meta {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}
.outlook-agent-meter {
  padding: 14px;
  border-radius: var(--outlook-radius-md);
  background: rgba(11, 23, 17, 0.75);
  border: 1px solid rgba(116, 224, 143, 0.08);
}
.outlook-agent-meter strong {
  display: block;
  margin-top: 8px;
  font-size: 1.6rem;
}
.outlook-pills {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.outlook-pill {
  display: inline-flex;
  align-items: center;
  padding: 7px 11px;
  border-radius: 999px;
  background: rgba(15, 39, 27, 0.7);
  border: 1px solid rgba(116, 224, 143, 0.1);
  color: var(--outlook-bone);
  font-size: 0.86rem;
}
.outlook-recent-list {
  display: grid;
  gap: 10px;
}
.outlook-recent-item {
  display: grid;
  gap: 4px;
  padding: 14px;
  border-radius: var(--outlook-radius-md);
  background: rgba(11, 23, 17, 0.72);
  border: 1px solid rgba(116, 224, 143, 0.08);
}
.outlook-recent-item small {
  color: var(--outlook-shadow);
  font-family: var(--outlook-font-mono);
  font-size: 0.74rem;
}
.outlook-recent-item strong {
  font-size: 0.96rem;
}
.outlook-recent-item span {
  color: var(--outlook-mist);
  font-size: 0.9rem;
}
.outlook-footer-note {
  margin-top: 14px;
  color: var(--outlook-shadow);
  font-family: var(--outlook-font-mono);
  font-size: 0.78rem;
  letter-spacing: 0.04em;
}
@media (max-width: 1080px) {
  .outlook-hero__grid,
  .outlook-layout {
    grid-template-columns: 1fr;
  }
}
@media (max-width: 760px) {
  .outlook-shell { padding-inline: 14px; }
  .outlook-nav {
    border-radius: 28px;
    align-items: flex-start;
    flex-direction: column;
  }
  .outlook-nav-meta,
  .outlook-facts,
  .outlook-stat-grid,
  .outlook-agent-meta {
    grid-template-columns: 1fr;
  }
}
`

const APP_SCRIPT = `
(function () {
  var root = document.querySelector('[data-outlook-app]');
  if (!root) return;

  var machineScript = document.getElementById('outlook-machine-view');
  var panel = document.querySelector('[data-outlook-agent-panel]');
  var list = document.querySelector('[data-outlook-agent-list]');
  var title = document.querySelector('[data-outlook-agent-title]');
  var subtitle = document.querySelector('[data-outlook-agent-subtitle]');
  var machineEndpoint = root.getAttribute('data-machine-endpoint');
  var agentEndpointBase = root.getAttribute('data-agent-endpoint-base');
  var selectedAgent = root.getAttribute('data-initial-agent') || '';
  var machineView = machineScript ? JSON.parse(machineScript.textContent || '{}') : null;

  function setSelected(name) {
    selectedAgent = name || '';
    root.setAttribute('data-selected-agent', selectedAgent);
    if (!list) return;
    list.querySelectorAll('[data-agent-name]').forEach(function (button) {
      var isSelected = button.getAttribute('data-agent-name') === selectedAgent;
      button.classList.toggle('is-selected', isSelected);
    });
  }

  function renderAgentPanel(view) {
    if (!panel || !title || !subtitle) return;
    if (!view) {
      title.textContent = 'Choose an agent';
      subtitle.textContent = 'Per-agent detail appears here as soon as you focus on one thread of the organism.';
      panel.innerHTML = '<div class="outlook-agent-panel__empty"><strong>Choose an agent</strong><p>Select a visible agent from the left rail to inspect current work, obligations, senses, bridges, and inward pressure.</p></div>';
      return;
    }

    title.textContent = view.agent.agentName;
    subtitle.textContent = view.agent.attention.label + ' · ' + view.activity.freshness.status + ' freshness';
    var senses = view.agent.senses.length
      ? view.agent.senses.map(function (sense) { return '<span class="outlook-pill">' + escapeHtml(sense) + '</span>'; }).join('')
      : '<span class="outlook-pill">No active senses</span>';
    var bridges = view.work.bridges.length
      ? view.work.bridges.map(function (bridge) { return '<span class="outlook-pill">' + escapeHtml(bridge) + '</span>'; }).join('')
      : '<span class="outlook-pill">No active bridges</span>';
    var recent = view.activity.recent.length
      ? '<div class="outlook-recent-list">' + view.activity.recent.map(function (item) {
          return '<article class="outlook-recent-item"><small>' + escapeHtml(item.kind) + ' · ' + escapeHtml(item.at) + '</small><strong>' + escapeHtml(item.label) + '</strong><span>' + escapeHtml(item.detail) + '</span></article>';
        }).join('') + '</div>'
      : '<div class="outlook-agent-panel__empty"><p>No recent activity is visible for this agent yet.</p></div>';

    var innerSummary = view.inner.summary || view.inner.status;
    var innerDetail = view.inner.mode === 'deep'
      ? '<code>origin: ' + escapeHtml(JSON.stringify(view.inner.origin)) + '\\nobligation: ' + escapeHtml(String(view.inner.obligationStatus)) + '</code>'
      : '<p class="outlook-agent-card__lede">Default human view keeps inward work summary-only unless deeper inspection is explicitly requested.</p>';

    panel.innerHTML = [
      '<article class="outlook-agent-card">',
      '  <p class="outlook-agent-card__lede">A truthful view of current posture, collaborative edges, and recent movement for ' + escapeHtml(view.agent.agentName) + '.</p>',
      '  <div class="outlook-agent-meta">',
      '    <div class="outlook-agent-meter"><span class="outlook-kicker">Tasks</span><strong>' + escapeHtml(String(view.work.tasks.liveCount)) + '</strong><span>' + escapeHtml(String(view.work.tasks.blockedCount)) + ' blocked</span></div>',
      '    <div class="outlook-agent-meter"><span class="outlook-kicker">Obligations</span><strong>' + escapeHtml(String(view.work.obligations.openCount)) + '</strong><span>' + escapeHtml(String(view.work.sessions.liveCount)) + ' live sessions</span></div>',
      '    <div class="outlook-agent-meter"><span class="outlook-kicker">Coding lanes</span><strong>' + escapeHtml(String(view.work.coding.activeCount)) + '</strong><span>' + escapeHtml(String(view.work.coding.blockedCount)) + ' blocked or stalled</span></div>',
      '    <div class="outlook-agent-meter"><span class="outlook-kicker">Inner work</span><strong>' + escapeHtml(view.inner.status) + '</strong><span>' + escapeHtml(innerSummary || 'No surfaced summary yet') + '</span></div>',
      '  </div>',
      '  <section class="outlook-agent-senses"><span class="outlook-kicker">Senses</span><div class="outlook-pills">' + senses + '</div></section>',
      '  <section class="outlook-agent-senses"><span class="outlook-kicker">Bridges</span><div class="outlook-pills">' + bridges + '</div></section>',
      '  <section><span class="outlook-kicker">Inward summary</span><p class="outlook-agent-card__lede">' + escapeHtml(innerSummary || 'No surfaced inner summary yet.') + '</p>' + innerDetail + '</section>',
      '  <section class="outlook-agent-recent"><span class="outlook-kicker">Recent activity</span>' + recent + '</section>',
      '</article>',
    ].join('');
  }

  function refreshMachine() {
    if (!machineEndpoint) return Promise.resolve();
    return fetch(machineEndpoint, { headers: { accept: 'application/json' } })
      .then(function (response) { return response.ok ? response.json() : null; })
      .then(function (nextMachineView) {
        if (!nextMachineView) return;
        machineView = nextMachineView;
        if (!selectedAgent && nextMachineView.agents && nextMachineView.agents[0]) {
          setSelected(nextMachineView.agents[0].agentName);
        }
      })
      .catch(function () {});
  }

  function refreshAgent() {
    if (!selectedAgent || !agentEndpointBase) {
      renderAgentPanel(null);
      return Promise.resolve();
    }
    return fetch(agentEndpointBase + encodeURIComponent(selectedAgent), { headers: { accept: 'application/json' } })
      .then(function (response) { return response.ok ? response.json() : null; })
      .then(function (view) { renderAgentPanel(view); })
      .catch(function () {
        renderAgentPanel(null);
      });
  }

  function escapeHtml(value) {
    return String(value)
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;');
  }

  if (list) {
    list.addEventListener('click', function (event) {
      var target = event.target;
      if (!(target instanceof Element)) return;
      var button = target.closest('[data-agent-name]');
      if (!(button instanceof HTMLElement)) return;
      var name = button.getAttribute('data-agent-name') || '';
      setSelected(name);
      refreshAgent();
    });
  }

  if (!selectedAgent && machineView && machineView.agents && machineView.agents[0]) {
    setSelected(machineView.agents[0].agentName);
  }

  refreshAgent();
  window.setInterval(refreshMachine, 20000);
  window.setInterval(refreshAgent, 15000);
})();
`

export function renderOutlookApp(input: RenderOutlookAppInput): string {
  const machineView = input.machineView
  const initialAgent = firstAgentName(machineView)
  const productName = machineView?.overview.productName ?? input.machine.productName ?? OUTLOOK_PRODUCT_NAME
  const daemonMode = machineView?.overview.daemon?.mode ?? "production"
  const freshnessStatus = machineView?.overview.freshness?.status ?? input.machine.freshness?.status ?? "unknown"
  const mood = machineView?.overview.mood ?? "watchful"

  return [
    "<!doctype html>",
    "<html lang=\"en\">",
    "<head>",
    "  <meta charset=\"utf-8\" />",
    "  <meta name=\"viewport\" content=\"width=device-width, initial-scale=1\" />",
    `  <title>${escapeHtml(productName)}</title>`,
    "  <meta name=\"color-scheme\" content=\"dark\" />",
    "  <meta name=\"description\" content=\"Ouro Outlook is the daemon-hosted shared orientation surface for the agents alive on this machine.\" />",
    `  <style>${APP_CSS}</style>`,
    "</head>",
    `<body data-outlook-app="${escapeHtml(productName)}" data-machine-endpoint="${escapeHtml(`${input.origin}/outlook/api/machine`)}" data-agent-endpoint-base="${escapeHtml(`${input.origin}/outlook/api/agents/`)}" data-initial-agent="${escapeHtml(initialAgent)}">`,
    "  <div class=\"outlook-shell\">",
    `    <h1 class="outlook-sr-only">${escapeHtml(productName)}</h1>`,
    "    <header class=\"outlook-nav\">",
    "      <div class=\"outlook-wordmark\">",
    "        <span class=\"outlook-orb\" aria-hidden=\"true\"></span>",
    "        <div>",
    `          <p class="outlook-product">${escapeHtml(productName)}</p>`,
    "          <p class=\"outlook-subtitle\">Regain the plot together.</p>",
    "        </div>",
    "      </div>",
    "      <div class=\"outlook-nav-meta\">",
    `        <span class="outlook-badge">${escapeHtml(daemonMode)}</span>`,
    `        <span class="outlook-badge">${escapeHtml(freshnessStatus)}</span>`,
    `        <span class="outlook-badge">${escapeHtml(mood)}</span>`,
    "      </div>",
    "    </header>",
    "    <section class=\"outlook-hero\">",
    "      <div class=\"outlook-hero__grid\">",
    "        <div>",
    "          <span class=\"outlook-kicker\">Machine Overview</span>",
    `          <h1>${escapeHtml(productName)}</h1>`,
    "          <p>Where agents regain the plot together. The daemon is already keeping watch, and Outlook makes the body legible: runtime truth, active obligations, coding lanes, senses, bridges, and inward pressure, all on the same living field.</p>",
    "          <div class=\"outlook-footer-note\">Daemon-hosted, loopback-only, direct-read, and read-only by design.</div>",
    "        </div>",
    `        <div class="outlook-stat-grid">${renderOverviewCards(machineView, input.machine)}</div>`,
    "      </div>",
    "    </section>",
    "    <section class=\"outlook-layout\">",
    "      <aside class=\"outlook-agents-rail\">",
    "        <div class=\"outlook-section\">",
    "          <span class=\"outlook-kicker\">Visible agents</span>",
    "          <h2>Choose a thread</h2>",
    "          <div class=\"outlook-agent-list\" data-outlook-agent-list>",
    renderAgentButtons(machineView),
    "          </div>",
    "        </div>",
    "      </aside>",
    "      <main class=\"outlook-panel\">",
    "        <div class=\"outlook-section\">",
    "          <span class=\"outlook-kicker\">Machine facts</span>",
    "          <h2>Current posture</h2>",
    `          <div class="outlook-facts">${renderRuntimeFacts(machineView, input.machine)}</div>`,
    "        </div>",
    "        <div class=\"outlook-entrypoints-panel\">",
    "          <span class=\"outlook-kicker\">Entrypoints</span>",
    renderEntrypoints(machineView, input.origin),
    "        </div>",
    "        <section class=\"outlook-agent-panel\">",
    "          <span class=\"outlook-kicker\">Agent detail</span>",
    "          <h2 data-outlook-agent-title>Choose an agent</h2>",
    "          <p class=\"outlook-agent-card__lede\" data-outlook-agent-subtitle>Per-agent detail appears here as soon as you focus on one thread of the organism.</p>",
    "          <div data-outlook-agent-panel>",
    "            <div class=\"outlook-agent-panel__empty\">",
    "              <strong>Choose an agent</strong>",
    "              <p>Select a visible agent from the left rail to inspect current work, obligations, senses, bridges, and inward pressure.</p>",
    "            </div>",
    "          </div>",
    "        </section>",
    "      </main>",
    "    </section>",
    "  </div>",
    `  <script id="outlook-machine-view" type="application/json">${escapeJsonForHtml(machineView ?? null)}</script>`,
    `  <script>${APP_SCRIPT}</script>`,
    "</body>",
    "</html>",
  ].join("\n")
}
