import { useEffect, useState } from "react";
import type { Card, Deck } from "../../shared/schema";
import { copyDeckUrl } from "../../shared/versioning";
import { useApi } from "../api";
import { date } from "../format";
import { Picture, Notice, Empty, Pager } from "./Common";
import {
  Search,
  X,
  SlidersHorizontal,
  ArrowUpRight,
  Heart,
  Copy,
  ExternalLink,
} from "lucide-react";
export function Decks({
  q,
  setQ,
  page,
  setPage,
  filter,
  setFilter,
  onlySaved,
  setOnlySaved,
  saved,
  save,
  dictionary,
  copy,
  open,
  total,
}: {
  q: string;
  setQ: (v: string) => void;
  page: number;
  setPage: (p: number) => void;
  filter: string;
  setFilter: (v: string) => void;
  onlySaved: boolean;
  setOnlySaved: (v: boolean) => void;
  saved: string[];
  save: (id: string) => void;
  dictionary: Record<number, Card>;
  copy: (t: string) => void;
  open: (d: Deck) => void;
  total: number;
}) {
  const [card, setCard] = useState("");
  useEffect(() => {
    if (card && !dictionary[Number(card)]) {
      setCard("");
      setPage(1);
    }
  }, [dictionary]);
  const params = new URLSearchParams({ q, page: String(page), limit: "12" });
  if (filter) params.set("kind", filter);
  if (card) params.set("card", card);
  if (onlySaved) params.set("ids", saved.join(","));
  const r = useApi<{ items: Deck[]; total: number }>("/api/decks?" + params);
  return (
    <>
      <div className="section-tabs">
        <button
          className={!onlySaved ? "selected" : ""}
          onClick={() => setOnlySaved(false)}
        >
          全部卡组 <span>{total}</span>
        </button>
        <button
          className={onlySaved ? "selected" : ""}
          onClick={() => setOnlySaved(true)}
        >
          <Heart size={15} />
          我的收藏 <span>{saved.length}</span>
        </button>
        <span className="tabs-note">8 张卡牌 · 一套配置</span>
      </div>
      <div className="filters">
        <label className="search">
          <Search size={18} />
          <input
            placeholder="搜索卡组名称…"
            aria-label="搜索卡组"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          {q && (
            <button aria-label="清除搜索" onClick={() => setQ("")}>
              <X size={16} />
            </button>
          )}
        </label>
        <select
          aria-label="卡组来源类型"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        >
          <option value="">全部类型</option>
          <option value="preset">历史预设卡组</option>
          <option value="player">玩家当前卡组</option>
          <option value="community">社区卡组</option>
        </select>
        <select
          aria-label="包含卡牌"
          value={card}
          onChange={(e) => {
            setCard(e.target.value);
            setPage(1);
          }}
        >
          <option value="">包含卡牌</option>
          {Object.values(dictionary)
            .sort((a, b) => a.elixir - b.elixir)
            .map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
        </select>
      </div>
      <div className="results-label">
        <span>
          {r.loading ? "正在读取卡组…" : `${r.data?.total ?? 0} 套卡组`}
        </span>
        <span>
          按最近采集排序 <SlidersHorizontal size={14} />
        </span>
      </div>
      {r.error ? (
        <Notice error={r.error} retry={r.retry} />
      ) : r.loading ? (
        <div className="skeleton-grid">
          <div />
          <div />
        </div>
      ) : r.data?.items.length ? (
        <div className="deck-grid">
          {r.data.items.map((d, i) => {
            const known = d.slots.map((s) => dictionary[s.id]);
            const avg = known.every(Boolean)
              ? (known.reduce((a, c) => a + c.elixir, 0) / 8).toFixed(1)
              : "—";
            return (
              <article
                className="deck-entry"
                key={d.id}
                style={{ animationDelay: `${i * 35}ms` }}
              >
                <div className="deck-top">
                  <span className="entry-index">
                    {String((page - 1) * 12 + i + 1).padStart(2, "0")}
                  </span>
                  <div>
                    <button className="deck-title" onClick={() => open(d)}>
                      {d.origins[0]?.title ?? "卡组"}
                    </button>
                    <span className="deck-category">
                      {d.origins[0]?.kind === "preset"
                        ? "历史预设"
                        : d.origins[0]?.kind === "player"
                          ? "玩家卡组"
                          : "社区收录"}{" "}
                      ·{" "}
                      {d.slots.some((s) => s.variant !== "normal")
                        ? "形态需在游戏内核对"
                        : "普通卡牌配置"}
                    </span>
                  </div>
                  <button
                    aria-label={saved.includes(d.id) ? "取消收藏" : "收藏卡组"}
                    className={
                      "save-button " + (saved.includes(d.id) ? "saved" : "")
                    }
                    onClick={() => save(d.id)}
                  >
                    <Heart
                      size={18}
                      fill={saved.includes(d.id) ? "currentColor" : "none"}
                    />
                  </button>
                </div>
                <button
                  className="deck-images"
                  onClick={() => open(d)}
                  aria-label={`查看 ${d.origins[0]?.title} 的卡牌组成`}
                >
                  {d.slots.map((s) => (
                    <div key={s.id}>
                      <Picture card={dictionary[s.id]} />
                      {s.variant !== "normal" && s.variant !== "unknown" && (
                        <span className="variant">
                          {s.variant === "evolution"
                            ? "觉醒"
                            : s.variant === "hero"
                              ? "英雄"
                              : "未记录"}
                        </span>
                      )}
                    </div>
                  ))}
                </button>
                <div className="deck-metrics">
                  <span>
                    <span className="drop">◆</span>平均圣水 <b>{avg}</b>
                  </span>
                  <span>采集于 {date(d.last_seen_at)}</span>
                </div>
                <div className="deck-actions">
                  <button onClick={() => open(d)}>
                    配置与出处 <ArrowUpRight size={15} />
                  </button>
                  <button onClick={() => copy(copyDeckUrl(d.slots))}>
                    <Copy size={14} />
                    复制
                    {d.slots.some((s) => s.variant !== "normal") ? "基础" : ""}
                    链接
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <Empty
          text={
            onlySaved
              ? "这里还没有符合条件的收藏卡组。"
              : "没有符合条件的卡组，试试其他筛选条件。"
          }
        />
      )}
      <Pager
        page={page}
        total={r.data?.total ?? 0}
        size={12}
        onChange={setPage}
      />
      <p className="scope-note">
        收录范围由已接入来源决定；历史预设不代表当前热门卡组。卡牌图片仅用于识别组成。
      </p>
    </>
  );
}
export function DeckPanel({
  deck,
  dictionary,
  copy,
}: {
  deck: Deck;
  dictionary: Record<number, Card>;
  copy: (text: string) => void;
}) {
  const url = copyDeckUrl(deck.slots);
  return (
    <>
      <h2>{deck.origins[0]?.title}</h2>
      <div className="detail-deck-grid">
        {deck.slots.map((s) => (
          <div key={s.id}>
            <Picture card={dictionary[s.id]} />
            <span>{dictionary[s.id]?.name ?? s.id}</span>
            <small>
              {s.variant === "normal"
                ? "普通"
                : s.variant === "evolution"
                  ? "觉醒"
                  : s.variant === "hero"
                    ? "英雄"
                    : "未记录"}
            </small>
          </div>
        ))}
      </div>
      <div className="detail-actions">
        <button className="primary" onClick={() => copy(url)}>
          <Copy size={16} />
          复制基础卡组链接
        </button>
        <a
          className="button primary"
          href={url}
          target="_blank"
          rel="noreferrer"
        >
          打开游戏 <ExternalLink size={16} />
        </a>
      </div>
      <p className="scope-note">
        链接根据 8 张卡牌 ID
        生成，仅导入基础卡牌。觉醒/英雄形态和槽位请在游戏内确认。社区样本合并了不同形态，只能确认基础卡牌组成。尚未经过游戏内导入验证。
      </p>
      <h3>收录出处</h3>
      <div className="origin-list">
        {deck.origins.map((o, i) => (
          <div key={i}>
            <a href={o.source_url} target="_blank" rel="noreferrer">
              {o.source} <ArrowUpRight size={14} />
            </a>
            <span>{o.title}</span>
            <small>最近采集 {date(o.observed_at)}</small>
          </div>
        ))}
      </div>
      <label className="link-field">
        游戏链接
        <input readOnly value={url} onFocus={(e) => e.target.select()} />
      </label>
    </>
  );
}
