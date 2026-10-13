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
function App() {
  const initial = new URLSearchParams(location.search);
  const [view, setView] = useState<View>(
    (["decks", "cards", "balance", "sources"].includes(
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
        ? v
            .filter((x) => typeof x === "string" && /^[a-f0-9]{64}$/.test(x))
            .slice(0, 60)
        : [];
    } catch {
      return [];
    }
  });
  const [selectedCard, setSelectedCard] = useState<Card | null>(null),
    [selectedDeck, setSelectedDeck] = useState<Deck | null>(null),
    [toast, setToast] = useState("");
  const status = useApi<Status>("/api/status");
  const activeStream =
    stream ||
    (status.data?.heads.find((x) => x.stream === "supercell-api")?.stream ??
      status.data?.heads.find((x) => x.stream === "cr-data-community")
        ?.stream ??
      status.data?.heads[0]?.stream ??
      "royaleapi-archive");
  const head = status.data?.heads.find((x) => x.stream === activeStream);
  const [dictionary, setDictionary] = useState<Record<number, Card>>({});
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
    }
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
      <aside className="sidebar">
        <a className="brand" href="?view=decks">
          <span className="brand-icon">
            <Crown size={25} />
          </span>
          <span>
            皇室档案<small>ROYALE ATLAS</small>
          </span>
        </a>
        <div className="nav-caption">探索档案</div>
        <nav>
          {(
            [
              ["decks", Layers],
              ["cards", BookOpen],
              ["balance", GitBranch],
              ["sources", Database],
            ] as const
          ).map(([id, Icon]) => (
            <button
              key={id}
              className={view === id ? "active" : ""}
              onClick={() => navigate(id)}
            >
              <Icon size={19} />
              <span>{names[id]}</span>
              {id === "balance" && <span className="nav-dot" />}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="region">
            <span className="status-dot" />
            国际服资料库
          </div>
          <p>
            卡组有出处
            <br />
            参数有历史
          </p>
          <small>独立粉丝项目 · 非 Supercell 官方</small>
        </div>
      </aside>
      <div className="workspace">
        <header className="topbar">
          <span>
            资料库 <span className="slash">/</span> {names[view]}
          </span>
          <div className="top-actions">
            <span className="desktop-only">数据版本</span>
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
        </header>
        <main>
          <div className="page-heading">
            <div>
              <div className="eyebrow">CLASH ROYALE / ARCHIVE</div>
              <h1>
                {names[view]}
                <span className="heading-dot">.</span>
              </h1>
              <p>
                {view === "decks"
                  ? "查看八张卡牌组成，收藏卡组，并打开游戏导入链接。"
                  : view === "cards"
                    ? "查阅卡牌组成参数与历史快照，追踪每一个变化。"
                    : view === "balance"
                      ? "像查看代码提交一样，对比卡牌参数的前后变化。"
                      : "了解数据从哪里来、何时更新，以及当前收录范围。"}
              </p>
            </div>
            <div className="heading-mark">
              <Crown size={66} strokeWidth={1} />
            </div>
          </div>
          {status.error && <Notice error={status.error} retry={status.retry} />}
          {head && (
            <div className={"source-strip " + (stale(head) ? "stale" : "")}>
              <span className="strip-icon">
                <Database size={17} />
              </span>
              <span>
                <strong>{streamName[head.stream] ?? head.stream}</strong>
                <span className="strip-description">
                  {stale(head)
                    ? "来源已过期 · 仅供历史参考"
                    : head.stream === "supercell-api"
                      ? "官方目录不提供战斗参数"
                      : head.stream === "cr-data-community"
                        ? "对局样本 · 非全量目录 / 无战斗参数"
                        : "来源参数快照"}
                </span>
              </span>
              <span className="strip-date">
                {head.stream === "supercell-api" ? "观测日期" : "来源更新"}{" "}
                {date(head.latest_source_updated_at ?? head.source_updated_at)}
              </span>
              <button onClick={() => navigate("sources")}>
                查看来源 <ArrowUpRight size={15} />
              </button>
            </div>
          )}
          {!status.loading && !head && (
            <div className="notice">
              尚未同步数据。请运行 Python 采集器，再通过本地或线上入库接口发布。
            </div>
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
              dictionary={dictionary}
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
            <span>皇室档案 / Royale Atlas</span>
            <span>国际服链接 · 卡组导入未经游戏内验证</span>
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
          <DeckPanel deck={selectedDeck} dictionary={dictionary} copy={copy} />
        </Modal>
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
