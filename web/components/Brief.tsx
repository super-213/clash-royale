import { useEffect, useState } from "react";
import {
  ArrowUpRight,
  Bookmark,
  ChevronDown,
  Heart,
  RefreshCw,
  Plus,
  Pencil,
  Trash2,
} from "lucide-react";
import type { Card, Deck } from "../../shared/schema";
import type { DeckCard } from "../../shared/deck-layout";
import {
  balanceCategory,
  balanceUnit,
  balanceVariant,
  summarizeDeck,
  type BalanceEdition,
  type BalanceMatch,
  type BriefCard,
} from "../../shared/brief";
import { api, useApi } from "../api";
import { date } from "../format";
import { Notice } from "./Common";
import { DeckSlots } from "./DeckSlots";
import {
  deckCardDictionary,
  isPersonalDeck,
  MAX_PERSONAL_DECKS,
  type PersonalDeck,
} from "../../shared/personal-decks";

function useSavedDecks(saved: string[]) {
  const key = saved.join(",");
  const [nonce, setNonce] = useState(0);
  const [state, setState] = useState({
    key: "",
    items: [] as Deck[],
    loading: true,
    error: "",
  });
  useEffect(() => {
    const controller = new AbortController();
    setState({ key, items: [], loading: true, error: "" });
    // The existing API caps a page at 48; collections may contain 60 decks.
    const ids = key ? key.split(",") : [];
    const batches = Array.from({ length: Math.ceil(ids.length / 48) }, (_, i) =>
      ids.slice(i * 48, (i + 1) * 48),
    );
    Promise.all(
      batches.map((batch) =>
        api<{ items: Deck[] }>(
          "/api/decks?" +
            new URLSearchParams({ ids: batch.join(","), limit: "48" }),
          controller.signal,
        ),
      ),
    )
      .then((results) => {
        if (!controller.signal.aborted)
          setState({
            key,
            items: results.flatMap((r) => r.items),
            loading: false,
            error: "",
          });
      })
      .catch((error: Error) => {
        if (!controller.signal.aborted)
          setState({ key, items: [], loading: false, error: error.message });
      });
    return () => controller.abort();
  }, [key, nonce]);
  return {
    ...(state.key === key ? state : { items: [], loading: true, error: "" }),
    retry: () => setNonce((n) => n + 1),
  };
}

function Change({ match }: { match: BalanceMatch }) {
  const { entry, certainty } = match;
  return (
    <section
      className="brief-change"
      aria-label={`${entry.name} ${balanceVariant[entry.variant]}调整`}
    >
      <div className="brief-change-heading">
        <h3>
          {entry.name} <small>{balanceVariant[entry.variant]}</small>
        </h3>
        <span className={`brief-category ${entry.category}`}>
          {balanceCategory[entry.category]}
        </span>
        {certainty !== "direct" && (
          <span className="brief-pending">
            {certainty === "variant_unknown"
              ? "形态待确认"
              : "基础调整 · 继承待确认"}
          </span>
        )}
        <a href={entry.sourceUrl} target="_blank" rel="noreferrer">
          公告原文 <ArrowUpRight size={14} />
        </a>
      </div>
      {certainty !== "direct" && (
        <p className="brief-match-note">
          {certainty === "variant_unknown"
            ? `这套卡组未记录卡牌形态。仅当你使用${balanceVariant[entry.variant]}形态，或已确认该调整适用于实际形态时，才参考下面的解读。`
            : "你使用的是特殊形态，公告这一条记录的是普通形态。基础调整是否继承到你的形态，需要在游戏内核对。"}
        </p>
      )}
      <div className="brief-facts">
        <span className="brief-label">公告数值</span>
        <div className="brief-table-wrap">
          <table>
            <thead>
              <tr>
                <th scope="col">调整项</th>
                <th scope="col">调整前</th>
                <th scope="col">调整后</th>
                <th scope="col">原文幅度</th>
              </tr>
            </thead>
            <tbody>
              {entry.facts.map((fact) => (
                <tr key={fact.metric}>
                  <th scope="row">{fact.label}</th>
                  <td>
                    {fact.before}{" "}
                    <small>{balanceUnit[fact.unit] ?? fact.unit}</small>
                  </td>
                  <td>
                    {fact.after}{" "}
                    <small>{balanceUnit[fact.unit] ?? fact.unit}</small>
                  </td>
                  <td>{fact.sourcePercent ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <small>
          {entry.facts.every((f) => f.level === null)
            ? "原文未标明等级；数值不代表你当前卡牌等级。"
            : `原文等级：${[...new Set(entry.facts.map((f) => f.level ?? "未标明"))].join("、")}。`}
        </small>
      </div>
      <div className="brief-reading">
        <div>
          <span className="brief-label">影响解读 · 推断</span>
          <p>{entry.interpretation}</p>
        </div>
        <div>
          <span className="brief-label">建议观察 · 待实测</span>
          <p>{entry.watch}</p>
        </div>
      </div>
    </section>
  );
}

export function Brief({
  personal,
  personalWarning,
  editPersonal,
  deletePersonal,
  deletedPersonal,
  undoDelete,
  saved,
  dictionary,
  save,
  open,
  browse,
}: {
  personal: PersonalDeck[];
  personalWarning: string;
  editPersonal: (deck?: PersonalDeck) => void;
  deletePersonal: (id: string) => void;
  deletedPersonal: PersonalDeck | null;
  undoDelete: () => void;
  saved: string[];
  dictionary: Record<number, DeckCard>;
  save: (id: string) => void;
  open: (deck: Deck) => void;
  browse: (onlySaved?: boolean) => void;
}) {
  const feed = useApi<{ editions: BalanceEdition[]; cards: BriefCard[] }>(
    "/api/balance-briefs",
  );
  const decks = useSavedDecks(saved);
  const [editionId, setEditionId] = useState("");
  const cardFallback = Object.fromEntries(
    (feed.data?.cards ?? []).map((card) => [card.id, card]),
  );
  const deckCards = { ...cardFallback, ...dictionary };
  const edition =
    feed.data?.editions.find((e) => e.id === editionId) ??
    feed.data?.editions[0];
  const reports = edition
    ? [...personal, ...decks.items]
        .map((deck) => summarizeDeck(deck, edition))
        .sort(
          (a, b) =>
            Number(isPersonalDeck(b.deck)) - Number(isPersonalDeck(a.deck)) ||
            (isPersonalDeck(a.deck) && isPersonalDeck(b.deck)
              ? b.deck.last_seen_at.localeCompare(a.deck.last_seen_at)
              : 0) ||
            Number(b.matches.length > 0) - Number(a.matches.length > 0) ||
            saved.indexOf(a.deck.id) - saved.indexOf(b.deck.id),
        )
    : [];
  const missing =
    decks.loading || decks.error
      ? []
      : saved.filter((id) => !decks.items.some((d) => d.id === id));
  return (
    <div className="brief-workspace">
      <div className="brief-toolbar">
        <div>
          <Bookmark size={20} />
          <strong>我的卡组</strong>
        </div>
        <div className="brief-toolbar-actions">
          <button
            className="primary"
            disabled={personal.length >= MAX_PERSONAL_DECKS}
            onClick={() => editPersonal()}
          >
            <Plus size={16} />
            自己配卡组
          </button>
          <button onClick={() => browse(saved.length > 0)}>
            管理收藏 <ArrowUpRight size={15} />
          </button>
        </div>
      </div>
      {personalWarning && (
        <p className="notice" role="status">
          {personalWarning}
        </p>
      )}
      {deletedPersonal && (
        <div className="brief-undo" role="status">
          <span>已删除「{deletedPersonal.name}」</span>
          <button
            disabled={personal.length >= MAX_PERSONAL_DECKS}
            onClick={undoDelete}
          >
            撤销删除
          </button>
        </div>
      )}
      {feed.error ? (
        <Notice error={feed.error} retry={feed.retry} />
      ) : feed.loading ? (
        <p className="loading-text" role="status">
          正在读取调整公告…
        </p>
      ) : !edition ? (
        <div className="empty">
          <Bookmark size={30} />
          <p>还没有已收录的平衡公告。</p>
          <button className="primary" onClick={feed.retry}>
            <RefreshCw size={16} />
            重新加载
          </button>
        </div>
      ) : (
        <>
          <section className="brief-edition" aria-label="简报依据">
            <div className="brief-edition-top">
              <div>
                <span className="brief-label">已收录公告</span>
                <h2>{edition.title}</h2>
              </div>
              {(feed.data?.editions.length ?? 0) > 1 && (
                <select
                  aria-label="选择简报期数"
                  value={edition.id}
                  onChange={(e) => setEditionId(e.target.value)}
                >
                  {feed.data?.editions.map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.title}
                    </option>
                  ))}
                </select>
              )}
              <a href={edition.sourceUrl} target="_blank" rel="noreferrer">
                RoyaleAPI 原文 <ArrowUpRight size={15} />
              </a>
            </div>
            <p className="brief-dates">
              公告发布 {date(edition.publishedOn)} · 采集{" "}
              {date(edition.observedAt)} · {edition.entries.length} 组调整 /{" "}
              {edition.entries.reduce((n, entry) => n + entry.facts.length, 0)}{" "}
              项数值变化
            </p>
            <p className="brief-edition-note">
              {edition.liveVersionVerified
                ? "已核对正式服版本。"
                : "尚未在游戏内核对正式服版本。"}
              {edition.effectiveAt
                ? `生效日期 ${date(edition.effectiveAt)}。`
                : "生效日期未核实。"}
              仅匹配这期公告，不代表完整环境评估。
            </p>
          </section>
          {!saved.length && !personal.length ? (
            <div className="empty brief-empty">
              <Heart size={32} />
              <h2>配好你自己的主卡组</h2>
              <p>
                像游戏里一样选择 8
                张卡牌和特殊形态，保存后就能看到与你相关的调整。
              </p>
              <button className="primary" onClick={() => editPersonal()}>
                <Plus size={16} />
                开始配卡组
              </button>
              <button
                className="brief-empty-secondary"
                onClick={() => browse()}
              >
                也可以去资料库收藏 <ArrowUpRight size={15} />
              </button>
              <small>自配卡组和收藏保存在当前浏览器，无需登录。</small>
            </div>
          ) : decks.error && !personal.length ? (
            <Notice error={decks.error} retry={decks.retry} />
          ) : decks.loading && !personal.length ? (
            <p className="loading-text" role="status">
              正在匹配你的 {saved.length} 套收藏卡组…
            </p>
          ) : (
            <>
              {decks.error && (
                <Notice
                  error={"收藏卡组读取失败：" + decks.error}
                  retry={decks.retry}
                />
              )}
              {decks.loading && saved.length > 0 && (
                <p className="loading-text" role="status">
                  正在读取收藏卡组…
                </p>
              )}
              <div className="brief-overview" role="status">
                <span>
                  <b>{reports.length}</b> 套主卡组已匹配
                </span>
                <span>
                  <b>{reports.filter((r) => r.directCards > 0).length}</b>{" "}
                  套直接相关
                </span>
                <span>
                  <b>{reports.filter((r) => r.possibleCards > 0).length}</b>{" "}
                  套需确认形态
                </span>
              </div>
              <p className="brief-scope">
                仅检查卡组内的直接调整，未计入对手与环境变化。影响解读为推断，建议结合实际对局观察。
              </p>
              {missing.length > 0 && (
                <section className="brief-missing" aria-label="无法读取的收藏">
                  <strong>{missing.length} 套收藏暂时无法读取</strong>
                  <p>
                    卡组可能已下架，当前无法生成简报。可以重试，或移除这些失效收藏。
                  </p>
                  <button onClick={decks.retry}>
                    <RefreshCw size={14} />
                    重试读取
                  </button>
                  {missing.map((id) => (
                    <button
                      key={id}
                      aria-label={`移除失效收藏 ${id.slice(0, 8)}`}
                      onClick={() => save(id)}
                    >
                      移除 {id.slice(0, 8)}
                    </button>
                  ))}
                </section>
              )}
              <div className="brief-reports">
                {reports.map(
                  ({ deck, matches, directCards, possibleCards }, i) => (
                    <details
                      className="brief-deck"
                      key={edition.id + deck.id}
                      open={i === 0 && matches.length > 0}
                    >
                      <summary>
                        <div className="brief-deck-heading">
                          <span className="entry-index">
                            {String(i + 1).padStart(2, "0")}
                          </span>
                          <div>
                            <h2>
                              {deck.name ??
                                deck.origins[0]?.title ??
                                "收藏卡组"}
                            </h2>
                            <p>
                              {isPersonalDeck(deck)
                                ? "自配卡组 · "
                                : "收藏卡组 · "}
                              {matches.length
                                ? [
                                    directCards
                                      ? `${directCards} 张卡牌直接相关`
                                      : "",
                                    possibleCards
                                      ? `${possibleCards} 张卡牌形态待确认`
                                      : "",
                                  ]
                                    .filter(Boolean)
                                    .join(" · ")
                                : "本期公告未发现直接关联"}
                            </p>
                          </div>
                          <ChevronDown size={18} className="brief-chevron" />
                        </div>
                        <DeckSlots
                          slots={deck.slots}
                          cards={deckCardDictionary(deck, deckCards)}
                          preserveOrder={deck.slot_order === "explicit"}
                          context="brief"
                          changed={matches.map((match) => match.entry.cardId)}
                        />
                      </summary>
                      <div className="brief-deck-body">
                        {matches.length ? (
                          matches.map((match) => (
                            <Change key={match.entry.key} match={match} />
                          ))
                        ) : (
                          <p className="brief-no-change">
                            这期公告没有匹配到这套配置的直接调整。它不代表卡组强度不变，也未评估对手卡组变化带来的间接影响。
                          </p>
                        )}
                        <div className="brief-deck-actions">
                          <button onClick={() => open(deck)}>
                            {isPersonalDeck(deck)
                              ? "查看卡组详情"
                              : "查看配置与出处"}{" "}
                            <ArrowUpRight size={15} />
                          </button>
                          {isPersonalDeck(deck) ? (
                            <>
                              <button onClick={() => editPersonal(deck)}>
                                <Pencil size={15} />
                                编辑卡组
                              </button>
                              <button onClick={() => deletePersonal(deck.id)}>
                                <Trash2 size={15} />
                                删除卡组
                              </button>
                            </>
                          ) : (
                            <button onClick={() => save(deck.id)}>
                              <Heart size={15} />
                              取消收藏
                            </button>
                          )}
                        </div>
                      </div>
                    </details>
                  ),
                )}
              </div>
              <p className="scope-note">
                自配卡组和收藏仅保存在当前浏览器，无需登录。已保存{" "}
                {personal.length}/{MAX_PERSONAL_DECKS} 套自配卡组。
              </p>
            </>
          )}
        </>
      )}
    </div>
  );
}
