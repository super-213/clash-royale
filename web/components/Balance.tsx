import { useEffect, useRef, useState } from "react";
import type { CardChange, Release } from "../../shared/schema";
import { api, useApi } from "../api";
import { date, fieldLabel, displayValue } from "../format";
import { Notice, Empty } from "./Common";
import { GitBranch, Download } from "lucide-react";
export function Balance({
  stream,
  notify,
}: {
  stream: string;
  notify: (text: string) => void;
}) {
  const releases = useApi<{ items: Release[] }>(
    "/api/releases?stream=" + stream,
  );
  const [older, setOlder] = useState<Release[]>([]),
    [historyPage, setHistoryPage] = useState(1),
    [historyLoading, setHistoryLoading] = useState(false),
    [historyEnd, setHistoryEnd] = useState(false);
  const allReleases = [...(releases.data?.items ?? []), ...older];
  useEffect(() => {
    setOlder([]);
    setHistoryPage(1);
    setHistoryEnd(false);
  }, [stream]);
  const loadEarlier = async () => {
    setHistoryLoading(true);
    try {
      const r = await api<{ items: Release[] }>(
        "/api/releases?stream=" + stream + "&page=" + (historyPage + 1),
      );
      setOlder((v) => [...v, ...r.items]);
      setHistoryPage((v) => v + 1);
      setHistoryEnd(r.items.length < 30);
    } catch (e) {
      notify((e as Error).message);
    } finally {
      setHistoryLoading(false);
    }
  };
  const [from, setFrom] = useState(""),
    [to, setTo] = useState(""),
    [changes, setChanges] = useState<CardChange[] | null>(null),
    [loading, setLoading] = useState(false),
    [error, setError] = useState("");
  const [expanded, setExpanded] = useState<Record<number, boolean>>({});
  const request = useRef(0);
  useEffect(() => {
    request.current++;
    setLoading(false);
    setChanges(null);
    setError("");
    const list = releases.data?.items ?? [];
    setTo(list[0]?.id ?? "");
    setFrom(list[1]?.id ?? "");
  }, [stream, releases.data]);
  const compare = async () => {
    if (!from || !to) return;
    const n = ++request.current;
    setLoading(true);
    setError("");
    try {
      const r = await api<{ changes: CardChange[] }>(
        `/api/compare?from=${from}&to=${to}`,
      );
      if (n === request.current) {
        setChanges(r.changes);
        setExpanded({});
      }
    } catch (e) {
      if (n === request.current) setError((e as Error).message);
    } finally {
      if (n === request.current) setLoading(false);
    }
  };
  useEffect(() => {
    if (from && to) void compare();
    else setChanges(null);
  }, [from, to]);
  const exportDiff = () => {
    const data = { stream, from, to, changes };
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = `royale-diff-${to.slice(0, 8)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    notify("差异文件已导出");
  };
  return (
    <>
      <div className="balance-intro">
        <div>
          <GitBranch size={23} />
          <div>
            <strong>参数版本记录</strong>
            <p>不可变快照 · 父版本追溯 · 任意两版本比较</p>
          </div>
        </div>
        <span className="tag">检测变化，待核对公告</span>
      </div>
      {releases.error ? (
        <Notice error={releases.error} retry={releases.retry} />
      ) : releases.loading ? (
        <div className="loading-text">正在读取版本…</div>
      ) : !releases.data?.items.length ? (
        <Empty text="尚无参数快照。同步来源后会建立第一条基线。" />
      ) : (
        <>
          <div className="version-layout">
            <aside className="version-history">
              <h3>提交时间线</h3>
              {allReleases.map((r) => (
                <button
                  className={to === r.id ? "current" : ""}
                  key={r.id}
                  onClick={() => {
                    setTo(r.id);
                    setFrom(r.parent_id ?? "");
                  }}
                >
                  <span className="commit-dot" />
                  <span>
                    <strong>{date(r.source_updated_at)}</strong>
                    <small>
                      {r.parent_id
                        ? `${r.change_count} 张卡牌变化`
                        : "初始基线"}
                    </small>
                    <code>{r.id.slice(0, 8)}</code>
                  </span>
                </button>
              ))}
              {(releases.data?.items.length ?? 0) >= 30 && !historyEnd && (
                <button disabled={historyLoading} onClick={loadEarlier}>
                  {historyLoading ? "读取中…" : "加载更早版本"}
                </button>
              )}
            </aside>
            <div className="diff-workspace">
              <div className="compare-bar">
                <label>
                  起始版本
                  <select
                    aria-label="起始版本"
                    value={from}
                    onChange={(e) => setFrom(e.target.value)}
                  >
                    <option value="">选择基线</option>
                    {allReleases.map((r) => (
                      <option key={r.id} value={r.id}>
                        {date(r.source_updated_at)} · {r.id.slice(0, 7)}
                      </option>
                    ))}
                  </select>
                </label>
                <span className="compare-arrow">→</span>
                <label>
                  目标版本
                  <select
                    aria-label="目标版本"
                    value={to}
                    onChange={(e) => setTo(e.target.value)}
                  >
                    {allReleases.map((r) => (
                      <option key={r.id} value={r.id}>
                        {date(r.source_updated_at)} · {r.id.slice(0, 7)}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <div className="diff-summary">
                <span>
                  {loading
                    ? "正在比较…"
                    : changes
                      ? `${changes.length} 张卡牌发生参数变化`
                      : "选择两个版本查看差异"}
                </span>
                <button disabled={!changes} onClick={exportDiff}>
                  <Download size={15} />
                  JSON
                </button>
              </div>
              {error ? (
                <Notice error={error} retry={compare} />
              ) : loading ? (
                <div className="loading-text">正在比较字段…</div>
              ) : changes?.length ? (
                changes.map((c) => (
                  <section className="change-entry" key={c.card_id}>
                    <div className="change-heading">
                      <span>
                        <GitBranch size={17} />
                        <strong>{c.name ?? c.card_id}</strong>
                      </span>
                      <span className="tag">
                        {c.kind === "added"
                          ? "新增卡牌"
                          : c.kind === "removed"
                            ? "移出快照"
                            : `${c.fields.length} 项字段`}
                      </span>
                    </div>
                    {c.fields.length > 0 && (
                      <div className="diff-table">
                        <table>
                          <thead>
                            <tr>
                              <th>字段</th>
                              <th>之前</th>
                              <th>之后</th>
                              <th>变化</th>
                            </tr>
                          </thead>
                          <tbody>
                            {(expanded[c.card_id]
                              ? c.fields
                              : c.fields.slice(0, 8)
                            ).map((f) => (
                              <tr key={f.path}>
                                <td>
                                  {fieldLabel(f.path)}
                                  <small>{f.path}</small>
                                </td>
                                <td className="before">
                                  {displayValue(f.before)}
                                </td>
                                <td className="after">
                                  {displayValue(f.after)}
                                </td>
                                <td>
                                  {f.percent === null
                                    ? "—"
                                    : `${f.percent > 0 ? "+" : ""}${f.percent.toFixed(1)}%`}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                    {c.fields.length > 8 && (
                      <button
                        className="expand-diff"
                        onClick={() =>
                          setExpanded({
                            ...expanded,
                            [c.card_id]: !expanded[c.card_id],
                          })
                        }
                      >
                        {expanded[c.card_id]
                          ? "收起字段"
                          : `展开全部 ${c.fields.length} 项字段`}
                      </button>
                    )}
                  </section>
                ))
              ) : changes ? (
                <Empty text="这两个版本之间没有战斗参数变化。" />
              ) : (
                <Empty text="当前版本是基线；选择其他两个快照即可比较。" />
              )}
            </div>
          </div>
          <p className="scope-note">
            参数差异来自同一来源的快照，并非已经核对的官方平衡公告。数值升降不直接代表增强或削弱；翻译和图片变化不计入此处。
          </p>
        </>
      )}
    </>
  );
}
