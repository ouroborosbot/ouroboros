import { Badge } from "../../catalyst/badge"
import { relTime, truncate } from "../../api"
import { useNavigate, type TabId } from "../../navigation"

export function OverviewTab({ view }: { view: Record<string, unknown> }) {
  const nav = useNavigate()
  const agent = view.agent as Record<string, unknown>
  const work = view.work as Record<string, unknown>
  const inner = view.inner as Record<string, unknown>
  const activity = view.activity as {
    freshness: { status: string }
    recent: Array<{ kind: string; at: string; label: string; detail: string }>
  }
  const degraded = agent.degraded as { status: string; issues: Array<{ code: string; detail: string }> }
  const attention = agent.attention as { level: string; label: string }
  const tasks = work.tasks as { liveCount: number; blockedCount: number }
  const obligations = work.obligations as { openCount: number }
  const sessions = work.sessions as { liveCount: number }
  const coding = work.coding as { activeCount: number; blockedCount: number }
  const senses = (agent.senses as string[]) ?? []
  const bridges = (work.bridges as string[]) ?? []

  return (
    <div className="space-y-6">
      {/* Center of gravity — "orient me fast" */}
      <div className="rounded-xl bg-ouro-moss/15 p-4 ring-1 ring-ouro-glow/10 sm:p-5">
        <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-ouro-glow">
          Center of gravity
        </p>
        <p className="mt-1 font-display text-xl italic font-semibold text-ouro-bone sm:text-2xl">
          {attention.label}
        </p>
        <p className="mt-2 text-sm leading-relaxed text-ouro-mist">
          {agent.agentName as string} has{" "}
          <NavLink tab="work">{tasks.liveCount} live tasks</NavLink>,{" "}
          <NavLink tab="work">{obligations.openCount} open obligations</NavLink>,{" "}
          <NavLink tab="work">{coding.activeCount} coding lanes</NavLink>, and{" "}
          <NavLink tab="sessions">{sessions.liveCount} live sessions</NavLink>.
          {" "}Freshness: {activity.freshness.status}.
        </p>

        {/* Degraded issues — inline, not behind a tab */}
        {degraded.status === "degraded" && degraded.issues.length > 0 && (
          <div className="mt-3 space-y-1">
            {degraded.issues.slice(0, 5).map((issue, i) => (
              <button
                key={i}
                onClick={() => nav({ tab: "runtime" })}
                className="flex w-full items-start gap-2 rounded-lg bg-ouro-fang/5 px-3 py-2 text-left text-sm ring-1 ring-ouro-fang/10 hover:ring-ouro-fang/25 transition-colors"
              >
                <span className="mt-0.5 h-2 w-2 shrink-0 rounded-full bg-ouro-fang" />
                <span className="text-ouro-mist">
                  <span className="font-semibold text-ouro-fang">{issue.code}</span>
                  <span className="text-ouro-shadow"> — {truncate(issue.detail, 80)}</span>
                </span>
              </button>
            ))}
            {degraded.issues.length > 5 && (
              <button
                onClick={() => nav({ tab: "runtime" })}
                className="text-xs text-ouro-glow underline underline-offset-2"
              >
                +{degraded.issues.length - 5} more issues
              </button>
            )}
          </div>
        )}
      </div>

      {/* Meters — 2 cols mobile, 4 cols desktop */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Meter label="Tasks" value={tasks.liveCount} sub={`${tasks.blockedCount} blocked`} onClick={() => nav({ tab: "work" })} />
        <Meter label="Obligations" value={obligations.openCount} sub={`${sessions.liveCount} sessions`} onClick={() => nav({ tab: "work" })} />
        <Meter label="Coding" value={coding.activeCount} sub={`${coding.blockedCount} blocked`} onClick={() => nav({ tab: "work" })} />
        <Meter label="Inner" value={inner.status as string} sub={truncate((inner.summary as string) ?? "", 30)} onClick={() => nav({ tab: "inner" })} />
      </div>

      {/* Senses + Bridges — side by side */}
      <div className="grid gap-4 sm:grid-cols-2">
        <Section title="Senses">
          {senses.length > 0
            ? <Pills items={senses} />
            : <Muted>No active senses</Muted>}
        </Section>
        <Section title="Bridges">
          {bridges.length > 0
            ? <div className="flex flex-wrap gap-1.5">
                {bridges.map((b) => (
                  <button key={b} onClick={() => nav({ tab: "connections", focus: b })}>
                    <Badge color="lime">{b}</Badge>
                  </button>
                ))}
              </div>
            : <Muted>No active bridges</Muted>}
        </Section>
      </div>

      {/* Recent activity */}
      <Section title="Recent activity">
        {activity.recent.length > 0 ? (
          <div className="space-y-1">
            {activity.recent.map((item, i) => {
              const tab: TabId = item.kind === "coding" || item.kind === "obligation" ? "work"
                : item.kind === "session" ? "sessions"
                : "inner"
              return (
                <button
                  key={i}
                  onClick={() => nav({ tab })}
                  className="flex w-full flex-col gap-0.5 rounded-lg px-3 py-2.5 text-left hover:bg-ouro-moss/10 transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <Badge>{item.kind}</Badge>
                    <span className="text-xs text-ouro-shadow">{relTime(item.at)}</span>
                  </div>
                  <p className="truncate text-sm font-medium text-ouro-bone">{truncate(item.label, 100)}</p>
                  <p className="truncate text-xs text-ouro-shadow">{truncate(item.detail, 80)}</p>
                </button>
              )
            })}
          </div>
        ) : (
          <Muted>No recent activity yet.</Muted>
        )}
      </Section>
    </div>
  )
}

/* ---------- Shared small components ---------- */

function NavLink({ tab, children }: { tab: TabId; children: React.ReactNode }) {
  const nav = useNavigate()
  return (
    <button
      onClick={() => nav({ tab })}
      className="text-ouro-glow underline decoration-ouro-glow/30 underline-offset-2 hover:decoration-ouro-glow transition-colors"
    >
      {children}
    </button>
  )
}

function Meter({ label, value, sub, onClick }: { label: string; value: string | number; sub: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="rounded-xl bg-ouro-void/50 p-3 text-left ring-1 ring-ouro-moss/20 hover:ring-ouro-glow/20 transition-all"
    >
      <p className="font-mono text-[10px] uppercase tracking-wider text-ouro-shadow">{label}</p>
      <p className="mt-1 text-xl font-semibold tabular-nums text-ouro-bone">{value}</p>
      <p className="mt-0.5 truncate text-xs text-ouro-shadow">{sub}</p>
    </button>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="font-mono text-[10px] uppercase tracking-[0.15em] text-ouro-glow">{title}</p>
      <div className="mt-2">{children}</div>
    </div>
  )
}

function Pills({ items }: { items: string[] }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map((s) => <Badge key={s} color="lime">{s}</Badge>)}
    </div>
  )
}

function Muted({ children }: { children: React.ReactNode }) {
  return <p className="text-sm text-ouro-shadow">{children}</p>
}
