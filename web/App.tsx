import { useEffect, useState } from "react";
import {
  Layers,
  Database,
  ArrowUpRight,
  Check,
  Crown,
  Bookmark,
} from "lucide-react";
import type { Card, Deck } from "../shared/schema";
import { useApi } from "./api";
import { loadCardDictionary } from "./card-dictionary";
import { names } from "./format";
import type { View, Status } from "./types";
import { Notice, Modal } from "./components/Common";
import { Decks, DeckPanel } from "./components/Decks";
import { Sources } from "./components/Sources";
import { MyDecks } from "./components/MyDecks";
import { DeckEditor } from "./components/DeckEditor";
import { SharedDeckPreview } from "./components/SharedDeckPreview";
import { readSharedDeck } from "../shared/deck-share";
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
  const readShare = () => {
    try { return { deck: readSharedDeck(location.hash), error: "" }; }
    catch (error) { return { deck: null, error: (error as Error).message }; }
  };
  const [shared, setShared] = useState(readShare);
  const closeShare = () => {
    history.replaceState(null, "", location.pathname + location.search);
    setShared({ deck: null, error: "" });
  };
  useEffect(() => {
    const update = () => setShared(readShare());
    window.addEventListener("hashchange", update);
    return () => window.removeEventListener("hashchange", update);
  }, []);
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
    (["brief", "decks", "sources"].includes(
      initial.get("view") ?? "",
    )
      ? initial.get("view")
      : "decks") as View,
  );
  const [q, setQ] = useState(initial.get("q") ?? ""),
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
  const [selectedDeck, setSelectedDeck] = useState<Deck | null>(null),
    [toast, setToast] = useState("");
  const status = useApi<Status>("/api/status");
  const formCatalog = useApi<{ cards: BuilderCard[] }>("/api/deck-builder");
  const activeStream =
    (status.data?.heads.find((x) => x.stream === "supercell-api")?.stream ??
      status.data?.heads.find((x) => x.stream === "cr-data-community")
        ?.stream ??
      "cr-data-community");
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
    // Do not load the fallback stream before status chooses the actual source.
    if (!head?.id) return;
    loadCardDictionary(activeStream, head.id)
      .then((cards) => { if (!cancelled) setDictionary(cards); })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [activeStream, head?.id]);
  useEffect(() => {
    const params = new URLSearchParams();
    params.set("view", view);
    if (q) params.set("q", q);
    history.replaceState(null, "", "?" + params + location.hash);
  }, [view, q]);
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
    closeShare();
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
      notify("复制失败，请在卡组详情中手动复制链接");
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
          </div>
          {status.error && <Notice error={status.error} retry={status.retry} />}
          {view === "brief" && (
            <MyDecks
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
              copy={copy}
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
              showMyDecks={() => navigate("brief")}
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
      {(shared.deck || shared.error) && <SharedDeckPreview
        deck={shared.deck}
        error={shared.error}
        cards={formCatalog.data?.cards}
        loading={formCatalog.loading}
        retry={formCatalog.retry}
        full={personalState.decks.length >= MAX_PERSONAL_DECKS}
        close={closeShare}
        save={savePersonal}
      />}
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
