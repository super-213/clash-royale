import { useEffect, useState } from "react";
import { ArrowUpRight, ChevronDown, Heart, RefreshCw, Plus, Pencil, Trash2, Copy } from "lucide-react";
import { fullDeckUrl } from "../../shared/deck-share";
import type { Deck } from "../../shared/schema";
import type { DeckCard } from "../../shared/deck-layout";
import { api } from "../api";
import { Notice } from "./Common";
import { DeckSlots } from "./DeckSlots";
import { TowerTroop } from "./TowerTroop";
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


export function MyDecks({
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
  copy,
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
  copy: (text: string) => void;
}) {
  const decks = useSavedDecks(saved);
  const items = [
    ...[...personal].sort((a, b) => b.last_seen_at.localeCompare(a.last_seen_at)),
    ...saved.flatMap((id) => {
      const deck = decks.items.find((item) => item.id === id);
      return deck ? [deck] : [];
    }),
  ];
  const missing = decks.loading || decks.error
    ? []
    : saved.filter((id) => !decks.items.some((deck) => deck.id === id));
  return (
    <div className="brief-workspace">
      {(personal.length > 0 || saved.length > 0) && (
        <div className="brief-toolbar">
          <div className="brief-toolbar-actions">
            <button className="primary" disabled={personal.length >= MAX_PERSONAL_DECKS}
              onClick={() => editPersonal()}>
              <Plus size={16} /> 新建卡组
            </button>
            <button onClick={() => browse(saved.length > 0)}>
              管理收藏 <ArrowUpRight size={15} />
            </button>
          </div>
        </div>
      )}
      {personalWarning && <p className="notice" role="status">{personalWarning}</p>}
      {deletedPersonal && (
        <div className="brief-undo" role="status">
          <span>已删除「{deletedPersonal.name}」</span>
          <button disabled={personal.length >= MAX_PERSONAL_DECKS} onClick={undoDelete}>
            撤销删除
          </button>
        </div>
      )}
      {!saved.length && !personal.length ? (
        <div className="empty brief-empty">
          <Heart size={32} />
          <h2>还没有主卡组</h2>
          <button className="primary" onClick={() => editPersonal()}>
            <Plus size={16} /> 新建卡组
          </button>
          <button className="brief-empty-secondary" onClick={() => browse()}>
            浏览卡组 <ArrowUpRight size={15} />
          </button>
          <small>卡组保存在当前浏览器</small>
        </div>
      ) : (
        <>
          {decks.error && <Notice error={"收藏卡组读取失败：" + decks.error} retry={decks.retry} />}
          {decks.loading && saved.length > 0 && (
            <p className="loading-text" role="status">正在读取收藏卡组…</p>
          )}
          <div className="brief-overview" role="status">
            <span><b>{personal.length}</b> 套自配卡组</span>
            <span><b>{decks.items.length}</b> 套收藏卡组</span>
          </div>
          {missing.length > 0 && (
            <section className="brief-missing" aria-label="无法读取的收藏">
              <strong>{missing.length} 套收藏暂时无法读取</strong>
              <p>卡组可能已下架。可以重试，或移除这些失效收藏。</p>
              <button onClick={decks.retry}><RefreshCw size={14} /> 重试读取</button>
              {missing.map((id) => (
                <button key={id} aria-label={`移除失效收藏 ${id.slice(0, 8)}`} onClick={() => save(id)}>
                  移除 {id.slice(0, 8)}
                </button>
              ))}
            </section>
          )}
          <div className="brief-reports">
            {items.map((deck, i) => (
              <details className="brief-deck" key={deck.id} open={i === 0}>
                <summary>
                  <div className="brief-deck-heading">
                    <span className="entry-index">{String(i + 1).padStart(2, "0")}</span>
                    <div>
                      <h2>{deck.name ?? deck.origins[0]?.title ?? "收藏卡组"}</h2>
                      <p>{isPersonalDeck(deck) ? "自配卡组" : "收藏卡组"}</p>
                    </div>
                    <ChevronDown size={18} className="brief-chevron" />
                  </div>
                  <DeckSlots slots={deck.slots} cards={deckCardDictionary(deck, dictionary)}
                    preserveOrder={deck.slot_order === "explicit"} context="brief" />
                  {isPersonalDeck(deck) && <TowerTroop value={deck.tower_troop} />}
                </summary>
                <div className="brief-deck-body">
                  <div className="brief-deck-actions">
                    <button onClick={() => open(deck)}>
                      {isPersonalDeck(deck) ? "查看卡组详情" : "查看配置与出处"} <ArrowUpRight size={15} />
                    </button>
                    {isPersonalDeck(deck) ? (
                      <>
                        <button onClick={() => copy(fullDeckUrl(deck, location.href))}><Copy size={15} /> 复制完整配置链接</button>
                        <button onClick={() => editPersonal(deck)}><Pencil size={15} /> 编辑卡组</button>
                        <button onClick={() => deletePersonal(deck.id)}><Trash2 size={15} /> 删除卡组</button>
                      </>
                    ) : (
                      <button onClick={() => save(deck.id)}><Heart size={15} /> 取消收藏</button>
                    )}
                  </div>
                </div>
              </details>
            ))}
          </div>
          <p className="scope-note">
            已保存 {personal.length}/{MAX_PERSONAL_DECKS} 套自配卡组 · 仅保存在当前浏览器
          </p>
        </>
      )}
    </div>
  );
}
