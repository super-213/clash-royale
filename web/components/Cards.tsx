import { useState } from "react";
import type { Card, Release } from "../../shared/schema";
import { useApi } from "../api";
import { useDebouncedValue } from "../debounce";
import {
  date,
  stale,
  typeName,
  rarityName,
  streamName,
  fieldName,
  displayValue,
} from "../format";
import { Picture, Notice, Empty, Pager, Modal } from "./Common";
import { Search, GitBranch } from "lucide-react";
export function Cards({
  q,
  setQ,
  page,
  setPage,
  filter,
  setFilter,
  stream,
  open,
}: {
  q: string;
  setQ: (v: string) => void;
  page: number;
  setPage: (v: number) => void;
  filter: string;
  setFilter: (v: string) => void;
  stream: string;
  open: (c: Card) => void;
}) {
  const [rarity, setRarity] = useState("");
  const search = useDebouncedValue(q);
  const r = useApi<{ items: Card[]; total: number }>(
    q !== search ? null : "/api/cards?" +
      new URLSearchParams({
        stream,
        q: search.trim(),
        type: filter,
        rarity,
        page: String(page),
        limit: "24",
      }),
  );
  return (
    <>
      <div className="filters card-filters">
        <label className="search">
          <Search size={18} />
          <input
            aria-label="搜索卡牌"
            placeholder="搜索中文名称、英文名称…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </label>
        <select
          aria-label="卡牌类型"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        >
          <option value="">全部类型</option>
          {Object.entries(typeName).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
        <select
          aria-label="稀有度"
          value={rarity}
          onChange={(e) => {
            setRarity(e.target.value);
            setPage(1);
          }}
        >
          <option value="">全部稀有度</option>
          {Object.entries(rarityName).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
      </div>
      <div className="results-label">
        <span>
          {r.loading ? "正在读取卡牌…" : `${r.data?.total ?? 0} 张卡牌`}
        </span>
        <span>按圣水消耗排序</span>
      </div>
      {r.error ? (
        <Notice error={r.error} retry={r.retry} />
      ) : r.loading ? (
        <div className="skeleton-grid">
          <div />
          <div />
        </div>
      ) : r.data?.items.length ? (
        <div className="card-grid">
          {r.data.items.map((c, i) => (
            <button
              className="card-entry"
              key={c.id}
              style={{ animationDelay: `${i * 16}ms` }}
              onClick={() => open(c)}
            >
              <Picture card={c} />
              <strong>{c.name}</strong>
              <small>
                {rarityName[c.rarity] ?? c.rarity} ·{" "}
                {typeName[c.type] ?? c.type}
              </small>
            </button>
          ))}
        </div>
      ) : (
        <Empty text="没有符合条件的卡牌。" />
      )}
      <Pager
        page={page}
        total={r.data?.total ?? 0}
        size={24}
        onChange={setPage}
      />
    </>
  );
}
export function CardDialog({
  card,
  release,
  stream,
  close,
}: {
  card: Card;
  release?: Release;
  stream: string;
  close: () => void;
}) {
  const [showZero, setShowZero] = useState(false),
    [query, setQuery] = useState(""),
    [level, setLevel] = useState(0);
  const r = useApi<{
    history: {
      id: string;
      title: string;
      source_updated_at: string;
      fields_count: number;
    }[];
  }>(`/api/cards/${card.id}?stream=${stream}`);
  const fields = Object.entries(card.stats)
    .flatMap(([component, stats]) =>
      Object.entries(stats).map(([field, value]) => ({
        component,
        field,
        value,
      })),
    )
    .filter(
      (x) =>
        (showZero ||
          (x.value !== 0 && x.value !== null && x.value !== false)) &&
        `${x.field} ${fieldName[x.field] ?? ""} ${x.component}`
          .toLowerCase()
          .includes(query.toLowerCase()),
    );
  const arrays = fields.filter((x) => Array.isArray(x.value));
  const maxLevel = Math.max(
    1,
    ...arrays.map((x) => (x.value as unknown[]).length),
  );
  return (
    <Modal title="卡牌档案" close={close}>
      <div className="card-detail-heading">
        <Picture card={card} />
        <div>
          <h2>{card.name}</h2>
          {card.name_en !== card.name && <p>{card.name_en}</p>}
          <span className="detail-meta">
            {rarityName[card.rarity] ?? card.rarity} /{" "}
            {typeName[card.type] ?? card.type} / {card.elixir} 圣水
          </span>
        </div>
      </div>
      <p className="scope-note">
        {streamName[stream] ?? stream} · 版本时间{" "}
        {date(release?.source_updated_at)}
        {stale(release) ? " · 已过期，仅供历史参考" : ""}
      </p>
      {card.description && <p className="description">{card.description}</p>}
      <h3>战斗参数</h3>
      {Object.keys(card.stats).length ? (
        <>
          <div className="stat-controls">
            <input
              aria-label="筛选参数"
              placeholder="搜索参数名称…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <label>
              <input
                type="checkbox"
                checked={showZero}
                onChange={(e) => setShowZero(e.target.checked)}
              />
              显示空值 / 零值
            </label>
          </div>
          {arrays.length > 0 && (
            <label className="level-select">
              来源等级索引{" "}
              <select
                value={level}
                onChange={(e) => setLevel(Number(e.target.value))}
              >
                {Array.from({ length: maxLevel }, (_, i) => (
                  <option key={i} value={i}>
                    {i + 1}
                  </option>
                ))}
              </select>
              <small>数组索引不等于所有稀有度的游戏等级</small>
            </label>
          )}
          <p className="scope-note">
            内部原始单位：时间一般为毫秒、距离一般为千分之一格；以来源字段定义为准，未自行换算。
          </p>
          <div className="stats-table">
            <table>
              <thead>
                <tr>
                  <th>参数 / 组件</th>
                  <th>来源值</th>
                </tr>
              </thead>
              <tbody>
                {fields.map((x) => (
                  <tr key={x.component + x.field}>
                    <td>
                      {fieldName[x.field] ?? x.field}
                      <small>
                        {x.component} · {x.field}
                      </small>
                    </td>
                    <td>
                      <code>
                        {Array.isArray(x.value)
                          ? displayValue(x.value[level] ?? null)
                          : displayValue(x.value)}
                      </code>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : (
        <Empty text="此来源仅提供卡牌目录，不提供生命值、伤害等参数。" />
      )}
      <h3>检测到的历史变化</h3>
      {r.error ? (
        <Notice error={r.error} retry={r.retry} />
      ) : r.data?.history.length ? (
        <div className="history-list">
          {r.data.history.map((h) => (
            <div key={h.id}>
              <GitBranch size={15} />
              <span>{h.title}</span>
              <small>{h.fields_count} 项字段</small>
            </div>
          ))}
        </div>
      ) : (
        <p className="muted">目前没有这张卡牌的变化记录。首个快照是基线。</p>
      )}
    </Modal>
  );
}
