import { useEffect, useRef, useState } from "react";
import {
  ArrowLeftRight,
  Check,
  Crown,
  Diamond,
  Plus,
  Search,
  Trash2,
  Undo2,
  X,
} from "lucide-react";
import { slotKindAt, slotNames, cardForForm } from "../../shared/deck-layout";
import {
  createPersonalDeck,
  draftSchema,
  formNames,
  validateDraft,
  type BuilderCard,
  type DraftSlot,
  type PersonalDeck,
  adaptDeck,
  wildSwitchForms,
} from "../../shared/personal-decks";
import { useApi } from "../api";
import { Picture, Notice } from "./Common";
import type { Deck } from "../../shared/schema";
import {
  initialEditorState,
  reduceDeckEditor,
  type EditorAction,
} from "../../shared/deck-editor";

const blank = () => Array<DraftSlot>(8).fill(null);

export function DeckEditor({
  deck,
  source,
  number,
  close,
  save,
}: {
  deck?: PersonalDeck;
  source?: Deck;
  number: number;
  close: () => void;
  save: (deck: PersonalDeck) => void;
}) {
  const draftKey = `royale-deck-draft:${deck?.id ?? (source ? `source:${source.id}` : "new")}`;
  const [initial] = useState(() => {
    try {
      const raw = localStorage.getItem(draftKey);
      if (raw) return { ...draftSchema.parse(JSON.parse(raw)), restored: true };
    } catch {
      /* Invalid/unavailable drafts cannot replace a saved deck. */
    }
    return {
      name:
        deck?.name ??
        (source
          ? `${(source.name ?? source.origins[0]?.title ?? "卡组").slice(0, 44)} · 自配`
          : `主卡组 ${number}`),
      slots: deck ? (deck.slots as Exclude<DraftSlot, null>[]) : blank(),
      restored: false,
    };
  });
  const [name, setName] = useState(initial.name);
  const [editor, setEditor] = useState(() => initialEditorState(initial.slots));
  const { slots, target, candidateId, swapping, message } = editor;
  const [search, setSearch] = useState("");
  const [type, setType] = useState("");
  const [sorting, setSorting] = useState("elixir");
  const [saveError, setSaveError] = useState("");
  const [dragOver, setDragOver] = useState<number | null>(null);
  const [draftStored, setDraftStored] = useState(true);
  const dialog = useRef<HTMLDialogElement>(null);
  const saved = useRef(false);
  const dragged = useRef<{ kind: "slot" | "card"; id: number } | null>(null);
  const suppressClick = useRef(false);
  const seeded = useRef(false);
  const feed = useApi<{ cards: BuilderCard[] }>("/api/deck-builder");
  const cards = Object.fromEntries(
    [...(deck?.cards ?? []), ...(feed.data?.cards ?? [])].map((card) => [
      card.id,
      card,
    ]),
  );
  const candidate = candidateId === null ? undefined : cards[candidateId];
  const selected = slots[target];
  const wildSlot = slots[2];
  const wildCard = wildSlot ? cards[wildSlot.id] : undefined;
  const wildForms = wildCard ? wildSwitchForms(wildCard) : [];
  const occupied = candidate
    ? slots.findIndex((slot) => slot?.id === candidate.id)
    : -1;
  const pending = Boolean(candidate && occupied < 0);
  const dispatch = (action: EditorAction) => {
    setSaveError("");
    setEditor((state) => reduceDeckEditor(state, action, cards));
  };
  const filled = slots.filter(Boolean).length;
  const avg = slots.every((slot) => slot && cards[slot.id])
    ? (
        slots.reduce((sum, slot) => sum + cards[slot!.id].elixir, 0) / 8
      ).toFixed(1)
    : "—";
  const invalid = validateDraft(slots, cards);
  const query = search.trim().toLowerCase();
  const collection = (feed.data?.cards ?? [])
    .filter(
      (card) =>
        (!type || card.type === type) &&
        (!query ||
          `${card.name} ${card.name_en} ${card.key}`
            .toLowerCase()
            .includes(query)),
    )
    .sort((a, b) =>
      sorting === "name"
        ? a.name.localeCompare(b.name, "zh-CN")
        : a.elixir - b.elixir || a.name.localeCompare(b.name, "zh-CN"),
    );

  useEffect(() => {
    if (!feed.data || seeded.current) return;
    seeded.current = true;
    try {
      dispatch({
        type: "seed",
        slots:
          source && !initial.restored
            ? adaptDeck(
                source.slots,
                Object.fromEntries(
                  feed.data.cards.map((card) => [card.id, card]),
                ),
              )
            : editor.slots,
      });
    } catch (error) {
      setSaveError((error as Error).message);
    }
  }, [source, feed.data, initial.restored]);
  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialog.current?.showModal();
    dialog.current
      ?.querySelector<HTMLButtonElement>(".editor-slot-grid button")
      ?.focus();
    return () => {
      document.body.style.overflow = previous;
    };
  }, []);
  useEffect(() => {
    if (saved.current || (source && !initial.restored && !seeded.current))
      return;
    try {
      localStorage.setItem(draftKey, JSON.stringify({ name, slots }));
      setDraftStored(true);
    } catch {
      setDraftStored(false);
    }
  }, [draftKey, name, slots, source, initial.restored]);

  const chooseCandidate = (card: BuilderCard) => {
    if (suppressClick.current) return;
    dispatch({ type: "choose", id: card.id });
  };
  const finishDrag = () => {
    dragged.current = null;
    setDragOver(null);
    // Native drag can produce a trailing click; it must not place twice.
    setTimeout(() => {
      suppressClick.current = false;
    }, 0);
  };
  const submit = () => {
    try {
      const next = createPersonalDeck(name, slots, cards, deck);
      saved.current = true;
      try {
        localStorage.removeItem(draftKey);
      } catch {
        /* Saved deck still goes to the parent. */
      }
      save(next);
    } catch (error) {
      setSaveError(
        invalid ??
          (name.trim()
            ? "卡组无法保存，请检查卡牌与形态。"
            : "请给卡组起个名字。"),
      );
    }
  };

  return (
    <dialog
      ref={dialog}
      className="deck-editor-dialog"
      aria-labelledby="deck-editor-title"
      onCancel={(event) => {
        event.preventDefault();
        close();
      }}
    >
      <header className="editor-header">
        <div>
          <h2 id="deck-editor-title">
            {deck ? "编辑卡组" : "新建卡组"}
          </h2>
        </div>
        <button
          className="icon-button"
          aria-label="关闭配卡，保留草稿"
          onClick={close}
        >
          <X size={22} />
        </button>
      </header>
      <div className="editor-body">
        <section className="editor-board" aria-label="我的卡组槽位">
          <div className="editor-name-row">
            <input
              aria-label="卡组名称"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={50}
            />
            <span>{filled}/8</span>
          </div>
          <div
            className="deck-slot-grid editor-slot-grid"
            role="group"
            aria-label="编辑卡组，两行四列"
          >
            {slots.map((slot, position) => {
              const kind = slotKindAt(position);
              const card = slot ? cards[slot.id] : undefined;
              const active =
                slot &&
                (slot.variant !== "normal" || card?.rarity === "Champion");
              return (
                <button
                  key={position}
                  type="button"
                  className={`deck-slot deck-slot--${kind}${target === position && !pending ? " is-selected" : ""}${active ? " is-active" : ""}${dragOver === position ? " is-drag-over" : ""}${pending ? " is-placement-target" : ""}`}
                  aria-label={`第 ${position + 1} 槽 ${slotNames[kind]} ${card?.name ?? "空槽位"}`}
                  aria-pressed={target === position && !pending}
                  data-position={position + 1}
                  data-card-id={slot?.id ?? ""}
                  data-variant={slot?.variant ?? ""}
                  onClick={() => {
                    if (!suppressClick.current)
                      dispatch({ type: "select", position });
                  }}
                  draggable={Boolean(slot)}
                  onPointerDown={(event) => {
                    if (event.pointerType === "touch")
                      event.currentTarget.draggable = false;
                    else event.currentTarget.draggable = Boolean(slot);
                  }}
                  onDragStart={(event) => {
                    dragged.current = { kind: "slot", id: position };
                    suppressClick.current = true;
                    event.dataTransfer.effectAllowed = "move";
                    event.dataTransfer.setData(
                      "text/plain",
                      `slot:${position}`,
                    );
                  }}
                  onDragOver={(event) => {
                    const item = dragged.current;
                    if (item) {
                      event.preventDefault();
                      event.dataTransfer.dropEffect =
                        item.kind === "card" ? "copy" : "move";
                      setDragOver(position);
                    }
                  }}
                  onDragLeave={() => setDragOver(null)}
                  onDrop={(event) => {
                    event.preventDefault();
                    const item = dragged.current;
                    if (item)
                      dispatch(
                        item.kind === "card"
                          ? { type: "drop", id: item.id, position }
                          : { type: "move", from: item.id, to: position },
                      );
                    finishDrag();
                  }}
                  onDragEnd={finishDrag}
                >
                  <div className="deck-slot-frame">
                    {slot ? (
                      <Picture
                        card={
                          cardForForm(card, slot.variant) ?? {
                            name: String(slot.id),
                            image_url: null,
                          }
                        }
                      />
                    ) : (
                      <div className="editor-empty-slot">
                        <Plus size={23} />
                      </div>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
          {wildCard && wildSlot && wildForms.length > 1 && (
            <div className="editor-wild-form">
              <small>魔法栏位形态 · {wildCard.name}</small>
              <div
                className="editor-forms"
                role="group"
                aria-label="魔法栏位形态"
              >
                {wildForms.map((value) => (
                  <button
                    key={value}
                    type="button"
                    aria-pressed={wildSlot.variant === value}
                    className={wildSlot.variant === value ? "selected" : ""}
                    onClick={() =>
                      dispatch({ type: "form", position: 2, value })
                    }
                  >
                    {value === "evolution" && <Diamond size={12} />}
                    {value === "hero" && <Crown size={12} />}
                    {formNames[value]}
                  </button>
                ))}
              </div>
            </div>
          )}
          <div className="editor-board-actions">
            <span>
              <span className="drop">◆</span> 平均圣水 <b>{avg}</b>
            </span>
            <button
              disabled={!selected || pending}
              className={swapping ? "selected" : ""}
              onClick={() => dispatch({ type: "swap-mode" })}
            >
              <ArrowLeftRight size={14} />
              {swapping ? "取消交换" : "交换位置"}
            </button>
            <button
              disabled={!selected || pending}
              aria-label="移除当前槽位卡牌"
              onClick={() => dispatch({ type: "remove" })}
            >
              <Trash2 size={14} />
              移除
            </button>
            <button
              disabled={!editor.undo}
              onClick={() => dispatch({ type: "undo" })}
            >
              <Undo2 size={14} />
              撤销
            </button>
          </div>
          <p className="editor-target" role="status">
            {saveError ||
              message ||
              (swapping
                ? "选择要交换的槽位"
                : pending
                  ? `点击槽位放入${candidate!.name}。`
                  : editor.slotChosen || !selected
                    ? `点击卡牌填入第 ${target + 1} 槽。`
                    : "选择卡牌替换，或拖动换位")}
          </p>
        </section>
        <section className="editor-collection" aria-label="卡牌收藏册">
          <div className="editor-collection-controls">
            <label className="search">
              <Search size={17} />
              <input
                aria-label="搜索配卡卡牌"
                placeholder="搜索卡牌名称…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              {search && (
                <button aria-label="清除配卡搜索" onClick={() => setSearch("")}>
                  <X size={16} />
                </button>
              )}
            </label>
            <div>
              <select
                aria-label="配卡卡牌类型"
                value={type}
                onChange={(e) => setType(e.target.value)}
              >
                <option value="">全部卡牌</option>
                <option value="Troop">军队</option>
                <option value="Spell">法术</option>
                <option value="Building">建筑</option>
              </select>
              <select
                aria-label="配卡排序"
                value={sorting}
                onChange={(e) => setSorting(e.target.value)}
              >
                <option value="elixir">按圣水</option>
                <option value="name">按名称</option>
              </select>
              <small>{collection.length} 张</small>
            </div>
          </div>
          <div className="editor-collection-scroll">
            {feed.error ? (
              <Notice error={feed.error} retry={feed.retry} />
            ) : feed.loading ? (
              <p className="loading-text" role="status">
                正在打开卡牌收藏册…
              </p>
            ) : collection.length ? (
              <div className="editor-card-grid">
                {collection.map((card) => {
                  const used = slots.findIndex((slot) => slot?.id === card.id);
                  const disabled = used >= 0 && used !== target;
                  return (
                    <button
                      key={card.id}
                      className={`editor-card${candidateId === card.id ? " selected" : ""}`}
                      aria-label={`选择 ${card.name}`}
                      aria-pressed={candidateId === card.id}
                      disabled={disabled}
                      title={used >= 0 ? `已在第 ${used + 1} 槽` : card.name_en}
                      onClick={() => chooseCandidate(card)}
                      draggable={!disabled && used < 0}
                      onPointerDown={(event) => {
                        event.currentTarget.draggable =
                          event.pointerType !== "touch" &&
                          !disabled &&
                          used < 0;
                      }}
                      onDragStart={(event) => {
                        dragged.current = { kind: "card", id: card.id };
                        suppressClick.current = true;
                        event.dataTransfer.effectAllowed = "copy";
                        event.dataTransfer.setData(
                          "text/plain",
                          `card:${card.id}`,
                        );
                      }}
                      onDragEnd={finishDrag}
                    >
                      <Picture card={card} />
                      <span>{card.name}</span>
                      <small>
                        {used >= 0 ? (
                          <>
                            <Check size={10} />第 {used + 1} 槽
                          </>
                        ) : (
                          card.forms
                            .filter((value) => value !== "normal")
                            .map((value) => formNames[value])
                            .join(" / ") || "普通"
                        )}
                      </small>
                    </button>
                  );
                })}
              </div>
            ) : (
              <p className="editor-no-results">
                没有找到这张卡牌，试试其他名称或类型。
              </p>
            )}
          </div>
          {(pending || (candidate && occupied === target)) && (
            <div className="editor-use-bar" aria-label="所选卡牌操作">
              {pending ? (
                <>
                  <div className="editor-candidate">
                    <strong>{candidate!.name}</strong>
                  </div>
                  <button
                    className="editor-cancel-choice"
                    onClick={() => dispatch({ type: "cancel-choice" })}
                  >
                    取消选卡
                  </button>
                </>
              ) : candidate && occupied === target ? (
                <>
                  <div className="editor-candidate">
                    <strong>{candidate.name}</strong>
                  </div>
                  {target === 2 && wildForms.length > 1 ? (
                    <small className="editor-form-hint">
                      在卡组下方切换魔法栏位形态
                    </small>
                  ) : (
                    <small className="editor-form-hint">
                      {candidate.rarity === "Champion"
                        ? "英雄牌已自动安排到合法栏位"
                        : "卡牌形态随栏位自动切换"}
                    </small>
                  )}
                </>
              ) : null}
            </div>
          )}
        </section>
      </div>
      <footer className="editor-footer">
        <div>
          <small>
            {invalid && filled === 8
              ? invalid
              : source
                ? "请确认已解锁草稿中的特殊形态"
                : "特殊形态需在游戏内已解锁"}
          </small>
          <small>
            {draftStored
              ? "草稿已保存在当前浏览器"
              : "浏览器存储不可用，草稿仅本次保留"}
          </small>
        </div>
        <button
          className="primary"
          disabled={
            Boolean(invalid) ||
            !name.trim() ||
            feed.loading ||
            Boolean(feed.error)
          }
          onClick={submit}
        >
          {filled < 8 ? `还差 ${8 - filled} 张` : "保存并查看简报"}
        </button>
      </footer>
    </dialog>
  );
}
