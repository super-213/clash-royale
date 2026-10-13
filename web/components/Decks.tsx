import { useEffect, useState } from "react";
import type { Card, Deck } from "../../shared/schema";
import { copyDeckUrl } from "../../shared/versioning";
import { fullDeckUrl } from "../../shared/deck-share";
import {
  layoutDeck,
  type DeckCard,
  type DisplayCard,
} from "../../shared/deck-layout";
import { useApi } from "../api";
import { useDebouncedValue } from "../debounce";
import { date } from "../format";
import { Notice, Empty, Pager } from "./Common";
import { DeckSlots } from "./DeckSlots";
import { TowerTroop } from "./TowerTroop";
import { isPersonalDeck } from "../../shared/personal-decks";
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
  showMyDecks,
  buildFrom,
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
  showMyDecks: () => void;
  buildFrom: (deck: Deck) => void;
  dictionary: Record<number, DisplayCard>;
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
  const search = useDebouncedValue(q);
  const params = new URLSearchParams({ q: search.trim(), page: String(page), limit: "12" });
  if (filter) params.set("kind", filter);
  if (card) params.set("card", card);
  if (onlySaved) params.set("ids", saved.join(","));
  const r = useApi<{ items: Deck[]; total: number }>(q !== search ? null : "/api/decks?" + params);
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
      </div>
      {saved.length > 0 && (
        <div className="brief-library-link">
          <span>
            <Heart size={16} />
            {saved.length} 套收藏
          </span>
          <button onClick={showMyDecks}>
            我的卡组 <ArrowUpRight size={15} />
          </button>
        </div>
      )}
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
                          : "社区收录"}
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
                  <DeckSlots slots={d.slots} cards={dictionary} />
                </button>
                <div className="deck-metrics">
                  <span>
                    <span className="drop">◆</span>圣水 <b>{avg}</b>
                  </span>
                  <span>采集于 {date(d.last_seen_at)}</span>
                </div>
                <div className="deck-actions">
                  <button onClick={() => open(d)}>
                    详情 <ArrowUpRight size={15} />
                  </button>
                  <button
                    onClick={() =>
                      copy(copyDeckUrl(layoutDeck(d.slots, dictionary).slots))
                    }
                  >
                    <Copy size={14} />
                    复制
                    {d.slots.some((s) => s.variant !== "normal") ? "基础" : ""}
                    链接
                  </button>
                  <button onClick={() => buildFrom(d)}>
                    用此配卡 <ArrowUpRight size={15} />
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
      <details className="scope-details">
        <summary>收录说明</summary>
        <p>历史预设不代表当前热门卡组。卡牌按已记录形态展示，特殊形态与解锁状态请在游戏内确认。</p>
      </details>
    </>
  );
}
export function DeckPanel({
  deck,
  dictionary,
  copy,
}: {
  deck: Deck;
  dictionary: Record<number, DeckCard>;
  copy: (text: string) => void;
}) {
  const personal = isPersonalDeck(deck) ? deck : null;
  const shareUrl = personal ? fullDeckUrl(personal, location.href) : null;
  const url = copyDeckUrl(
    layoutDeck(deck.slots, dictionary, {
      preserveOrder: deck.slot_order === "explicit",
    }).slots,
  );
  return (
    <>
      <h2>{deck.name ?? deck.origins[0]?.title}</h2>
      <DeckSlots
        slots={deck.slots}
        cards={dictionary}
        context="detail"
        preserveOrder={deck.slot_order === "explicit"}
      />
      {isPersonalDeck(deck) && <TowerTroop value={deck.tower_troop} />}
      <div className="detail-actions">
        <button className="primary" onClick={() => copy(shareUrl ?? url)}>
          <Copy size={16} />
          {shareUrl ? "复制完整配置链接" : "复制基础卡组链接"}
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
      <p className="scope-note">{shareUrl
        ? "完整配置链接可在皇室档案还原卡牌顺序、觉醒、精英形态和塔兵。打开游戏使用基础链接，特殊形态和塔兵需在游戏内配置。"
        : "基础链接按展示顺序生成，不含特殊形态或塔兵。形态、塔兵与解锁状态请在游戏内确认；导入尚未经过游戏内验证。"}</p>
      {deck.slot_order === "explicit" ? (
        <p className="scope-note">
          自配卡组 · 保存在当前浏览器
        </p>
      ) : (
        <h3>收录出处</h3>
      )}
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
        {shareUrl ? "完整配置链接" : "游戏链接"}
        <input readOnly value={shareUrl ?? url} onFocus={(e) => e.target.select()} />
      </label>
    </>
  );
}
