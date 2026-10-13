import { useEffect, useState } from "react";
import {
  BookOpen,
  Layers,
  GitBranch,
  Database,
  ArrowUpRight,
  Check,
  Crown,
  RefreshCw,
  Bookmark,
} from "lucide-react";
import type { Card, Deck } from "../shared/schema";
import { api, useApi } from "./api";
import { names, date, stale, streamName } from "./format";
import type { View, Status } from "./types";
import { Notice, Modal } from "./components/Common";
import { Decks, DeckPanel } from "./components/Decks";
import { Cards, CardDialog } from "./components/Cards";
import { Balance } from "./components/Balance";
import { Sources } from "./components/Sources";
import { Brief } from "./components/Brief";
import { DeckEditor } from "./components/DeckEditor";
import {
  PERSONAL_KEY,
  MAX_PERSONAL_DECKS,
  parsePersonalDecks,
  serializePersonalDecks,
  deckCardDictionary,
  type PersonalDeck,
  type BuilderCard,
} from "../shared/personal-decks";
import type { DisplayCard } from "../shared/deck-layout";
function App() {
  const [personalState, setPersonalState] = useState(() => {
    try {
      return {
        decks: parsePersonalDecks(localStorage.getItem(PERSONAL_KEY)),
        warning: "",
      };
    } catch {
      return {
        decks: [] as PersonalDeck[],
        warning: "本地自配卡组暂时无法读取。收藏卡组仍可正常使用。",
      };
    }
  });
  const [editor, setEditor] = useState<{
    deck?: PersonalDeck;
    source?: Deck;
  } | null>(null);
  const [deletedPersonal, setDeletedPersonal] = useState<PersonalDeck | null>(
    null,
  );
  const initial = new URLSearchParams(location.search);
  const [view, setView] = useState<View>(
    (["brief", "decks", "cards", "balance", "sources"].includes(
      initial.get("view") ?? "",
    )
      ? initial.get("view")
      : "decks") as View,
  );
  const [stream, setStream] = useState(initial.get("stream") ?? ""),
    [q, setQ] = useState(initial.get("q") ?? ""),
    [page, setPage] = useState(1),
    [filter, setFilter] = useState(""),
    [onlySaved, setOnlySaved] = useState(false);
  const [saved, setSaved] = useState<string[]>(() => {
    try {
      const v = JSON.parse(localStorage.getItem("royale-saved") ?? "[]");
      return Array.isArray(v)
        ? [
            ...new Set(
              v.filter(
                (x) => typeof x === "string" && /^[a-f0-9]{64}$/.test(x),
              ),
            ),
          ].slice(0, 60)
        : [];
    } catch {
      return [];
    }
  });
  const [selectedCard, setSelectedCard] = useState<Card | null>(null),
    [selectedDeck, setSelectedDeck] = useState<Deck | null>(null),
    [toast, setToast] = useState("");
  const status = useApi<Status>("/api/status");
  const formCatalog = useApi<{ cards: BuilderCard[] }>("/api/deck-builder");
  const activeStream =
    stream ||
    (status.data?.heads.find((x) => x.stream === "supercell-api")?.stream ??
      status.data?.heads.find((x) => x.stream === "cr-data-community")
        ?.stream ??
      status.data?.heads[0]?.stream ??
      "royaleapi-archive");
  const head = status.data?.heads.find((x) => x.stream === activeStream);
  const [dictionary, setDictionary] = useState<Record<number, Card>>({});
  const displayCards: Record<number, DisplayCard> = Object.fromEntries(
    (formCatalog.data?.cards ?? []).map((card) => [card.id, card]),
  );
  for (const card of Object.values(dictionary))
    displayCards[card.id] = {
      ...displayCards[card.id],
      ...card,
      form_images: displayCards[card.id]?.form_images,
    };
  useEffect(() => {
    let cancelled = false;
    setDictionary({});
    async function load() {
      let p = 1;
      let total = 1;
      const all: Card[] = [];
      while ((p - 1) * 48 < total) {
        const r = await api<{ items: Card[]; total: number }>(
          `/api/cards?stream=${activeStream}&limit=48&page=${p}`,
        );
        all.push(...r.items);
        total = r.total;
        p++;
      }
      if (!cancelled)
        setDictionary(Object.fromEntries(all.map((c) => [c.id, c])));
    }
    load().catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [activeStream, head?.id]);
  useEffect(() => {
    const params = new URLSearchParams();
    params.set("view", view);
    params.set("stream", activeStream);
    if (q) params.set("q", q);
    history.replaceState(null, "", "?" + params);
  }, [view, activeStream, q]);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(""), 2600);
    return () => clearTimeout(timer);
  }, [toast]);
  const navigate = (next: View) => {
    setView(next);
    setQ("");
    setFilter("");
    setPage(1);
    setOnlySaved(false);
  };
  const notify = (text: string) => setToast(text);
  const persistPersonal = (decks: PersonalDeck[]) => {
    try {
      localStorage.setItem(PERSONAL_KEY, serializePersonalDecks(decks));
      setPersonalState({ decks, warning: "" });
      return true;
    } catch {
      setPersonalState({
        decks,
        warning: "浏览器存储不可用，自配卡组仅本次会话保留；刷新后可能丢失。",
      });
      return false;
    }
  };
  const savePersonal = (deck: PersonalDeck) => {
    const exists = personalState.decks.some((value) => value.id === deck.id);
    if (!exists && personalState.decks.length >= MAX_PERSONAL_DECKS) {
      notify(`最多保存 ${MAX_PERSONAL_DECKS} 套自配卡组`);
      return;
    }
    const decks = exists
      ? personalState.decks.map((value) =>
          value.id === deck.id ? deck : value,
        )
      : [...personalState.decks, deck];
    const stored = persistPersonal(decks);
    setEditor(null);
    navigate("brief");
    notify(
      stored
        ? "卡组已保存"
        : "卡组仅保存到本次会话，刷新后可能丢失",
    );
  };
  const deletePersonal = (id: string) => {
    setDeletedPersonal(
      personalState.decks.find((deck) => deck.id === id) ?? null,
    );
    persistPersonal(personalState.decks.filter((deck) => deck.id !== id));
  };
  const save = (id: string) => {
    if (!saved.includes(id) && saved.length >= 60) {
      notify("最多收藏 60 个卡组，请先移除部分收藏");
      return;
    }
    const next = saved.includes(id)
      ? saved.filter((x) => x !== id)
      : [...saved, id];
    setSaved(next);
    try {
      localStorage.setItem("royale-saved", JSON.stringify(next));
    } catch {
      notify("浏览器存储不可用，收藏仅在本次浏览中保留");
      return;
    }
    notify(
      saved.includes(id) ? "已取消收藏" : "已收藏",
    );
  };
  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      notify("链接已复制");
    } catch {
      notify("复制失败，请使用「打开游戏」或手动复制地址");
    }
  };
  return (
    <div className="app-shell">
      <header className="sidebar">
        <a className="brand" href="?view=decks">
          <span className="brand-icon">
            <Crown size={25} />
          </span>
          <span>皇室档案</span>
        </a>
        <nav aria-label="主导航">
          {(
            [
              ["decks", Layers],
              ["brief", Bookmark],
              ["cards", BookOpen],
              ["balance", GitBranch],
              ["sources", Database],
            ] as const
          ).map(([id, Icon]) => (
            <button
              key={id}
              className={view === id ? "active" : ""}
              aria-current={view === id ? "page" : undefined}
              onClick={() => navigate(id)}
            >
              <Icon size={19} />
              <span>{names[id]}</span>
              {id === "brief" &&
                saved.length + personalState.decks.length > 0 && (
                  <span className="brief-nav-count">
                    {saved.length + personalState.decks.length}
                  </span>
                )}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="region">
            <span className="status-dot" />
            国际服
          </div>
        </div>
      </header>
      <div className="workspace">
        <main>
          <div className="page-heading">
            <h1>{names[view]}</h1>
            {(view === "cards" || view === "balance") && (
              <div className="top-actions">
                <select
                  aria-label="选择数据来源"
                  value={activeStream}
                  onChange={(e) => {
                    setStream(e.target.value);
                    setPage(1);
                    setFilter("");
                  }}
                >
                  {status.data?.heads.length ? (
                    status.data.heads.map((r) => (
                      <option key={r.stream} value={r.stream}>
                        {streamName[r.stream] ?? r.stream}
                      </option>
                    ))
                  ) : (
                    <option value="royaleapi-archive">等待数据同步</option>
                  )}
                </select>
                <button
                  className="icon-button"
                  aria-label="刷新来源状态"
                  onClick={status.retry}
                >
                  <RefreshCw size={16} />
                </button>
              </div>
            )}
          </div>
          {status.error && <Notice error={status.error} retry={status.retry} />}
          {(view === "cards" || view === "balance") && head && (
            <div className={"source-strip " + (stale(head) ? "stale" : "")}>
              <span className="strip-icon">
                <Database size={17} />
              </span>
              <span>
                <span className="strip-description">
                  {stale(head)
                    ? "历史参数"
                    : head.stream === "supercell-api"
                      ? "官方目录不提供战斗参数"
                      : head.stream === "cr-data-community"
                        ? "社区样本 · 无战斗参数"
                        : "来源参数快照"}
                </span>
              </span>
              <span className="strip-date">
                {head.stream === "supercell-api" ? "观测日期" : "来源更新"}{" "}
                {date(head.latest_source_updated_at ?? head.source_updated_at)}
              </span>
              <button onClick={() => navigate("sources")}>
                来源详情 <ArrowUpRight size={15} />
              </button>
            </div>
          )}
          {view !== "brief" && !status.loading && !head && (
            <div className="notice">
              暂无可用数据，请稍后刷新。
            </div>
          )}
          {view === "brief" && (
            <Brief
              personal={personalState.decks}
              personalWarning={personalState.warning}
              editPersonal={(deck) => setEditor({ deck })}
              deletePersonal={deletePersonal}
              deletedPersonal={deletedPersonal}
              undoDelete={() => {
                if (
                  deletedPersonal &&
                  personalState.decks.length < MAX_PERSONAL_DECKS
                ) {
                  persistPersonal([...personalState.decks, deletedPersonal]);
                  setDeletedPersonal(null);
                }
              }}
              saved={saved}
              dictionary={displayCards}
              save={save}
              open={setSelectedDeck}
              browse={(onlySaved = false) => {
                navigate("decks");
                setOnlySaved(onlySaved);
              }}
            />
          )}
          {view === "decks" && (
            <Decks
              q={q}
              setQ={(v) => {
                setQ(v);
                setPage(1);
              }}
              page={page}
              setPage={setPage}
              filter={filter}
              setFilter={(v) => {
                setFilter(v);
                setPage(1);
              }}
              onlySaved={onlySaved}
              setOnlySaved={(v) => {
                setOnlySaved(v);
                setPage(1);
              }}
              saved={saved}
              save={save}
              showBrief={() => navigate("brief")}
              buildFrom={(source) => {
                if (personalState.decks.length >= MAX_PERSONAL_DECKS)
                  notify(
                    `最多保存 ${MAX_PERSONAL_DECKS} 套自配卡组，请先移除一套`,
                  );
                else setEditor({ source });
              }}
              dictionary={displayCards}
              copy={copy}
              open={setSelectedDeck}
              total={status.data?.decks ?? 0}
            />
          )}
          {view === "cards" && (
            <Cards
              q={q}
              setQ={(v) => {
                setQ(v);
                setPage(1);
              }}
              page={page}
              setPage={setPage}
              filter={filter}
              setFilter={(v) => {
                setFilter(v);
                setPage(1);
              }}
              stream={activeStream}
              open={setSelectedCard}
            />
          )}
          {view === "balance" && (
            <Balance stream={activeStream} notify={notify} />
          )}
          {view === "sources" && (
            <Sources status={status.data} loading={status.loading} />
          )}
          <footer>
            <span>皇室档案 · 独立粉丝项目，非 Supercell 官方</span>
            <button onClick={() => navigate("sources")}>
              数据来源与说明 <ArrowUpRight size={13} />
            </button>
          </footer>
        </main>
      </div>
      {selectedCard && (
        <CardDialog
          card={selectedCard}
          release={head}
          stream={activeStream}
          close={() => setSelectedCard(null)}
        />
      )}
      {selectedDeck && (
        <Modal title="卡组详情" close={() => setSelectedDeck(null)}>
          <DeckPanel
            deck={selectedDeck}
            dictionary={deckCardDictionary(selectedDeck, displayCards)}
            copy={copy}
          />
        </Modal>
      )}
      {editor && (
        <DeckEditor
          deck={editor.deck}
          source={editor.source}
          number={personalState.decks.length + 1}
          close={() => setEditor(null)}
          save={savePersonal}
        />
      )}
      {toast && (
        <div className="toast" role="status">
          <Check size={16} />
          {toast}
        </div>
      )}
    </div>
  );
}

export default App;
