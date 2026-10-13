import {
  defaultForm,
  formNames,
  putCard,
  swapCards,
  placeEditorCard,
  championDestination,
  normalizeEditorSlots,
  wildSwitchForms,
  type BuilderCard,
  type CardForm,
  type DraftSlot,
} from "./personal-decks";
import { DEFAULT_TOWER_TROOP, towerTroopSchema, towerTroopInfo, type TowerTroopKey } from "./tower-troops";

export type EditorState = {
  slots: DraftSlot[];
  towerTroop: TowerTroopKey;
  target: number;
  slotChosen: boolean;
  candidateId: number | null;
  swapping: boolean;
  message: string;
  undo: { slots: DraftSlot[]; target: number; towerTroop: TowerTroopKey } | null;
};
export type EditorAction =
  | { type: "choose"; id: number }
  | { type: "select"; position: number }
  | { type: "drop"; id: number; position: number }
  | { type: "move"; from: number; to: number }
  | { type: "form"; position: number; value: CardForm }
  | { type: "seed"; slots: DraftSlot[] }
  | { type: "tower"; value: TowerTroopKey }
  | { type: "remove" | "swap-mode" | "undo" | "cancel-choice" };

export function initialEditorState(
  slots: DraftSlot[],
  towerTroop: TowerTroopKey = DEFAULT_TOWER_TROOP,
): EditorState {
  return {
    slots,
    towerTroop,
    target: Math.max(
      0,
      slots.findIndex((slot) => !slot),
    ),
    slotChosen: false,
    candidateId: null,
    swapping: false,
    message: "",
    undo: null,
  };
}

// Cards and the independent tower selection share one undo snapshot.
export function reduceDeckEditor(
  state: EditorState,
  action: EditorAction,
  cards: Record<number, BuilderCard>,
): EditorState {
  const commit = (
    slots: DraftSlot[],
    patch: Partial<EditorState> = {},
  ): EditorState => {
    if (
      (patch.towerTroop ?? state.towerTroop) === state.towerTroop && slots.every(
        (slot, i) =>
          slot?.id === state.slots[i]?.id &&
          slot?.variant === state.slots[i]?.variant,
      )
    )
      return { ...state, ...patch };
    return {
      ...state,
      slots,
      candidateId: null,
      slotChosen: false,
      swapping: false,
      message: "",
      undo: { slots: state.slots, target: state.target, towerTroop: state.towerTroop },
      ...patch,
    };
  };
  const place = (id: number, position: number) => {
    const card = cards[id];
    if (!card) throw new Error("卡牌资料暂不可用。");
    const placed = placeEditorCard(state.slots, position, card, cards);
    const slots = placed.slots;
    const empty = !state.slots[position]
      ? Array.from({ length: 8 }, (_, i) => (position + i + 1) % 8).find(
          (i) => !slots[i],
        )
      : undefined;
    return commit(slots, {
      target: empty ?? placed.position,
      message: placed.message,
    });
  };
  const move = (from: number, to: number) =>
    commit(swapCards(state.slots, from, to, cards), {
      target: to,
      message: [state.slots[from], state.slots[to]].some(
        (slot) => slot && cards[slot.id]?.rarity === "Champion",
      )
        ? "已自动安排英雄牌并调整栏位形态。"
        : "已交换位置并按栏位切换形态。",
    });
  try {
    switch (action.type) {
      case "seed": {
        const normalized = normalizeEditorSlots(action.slots, cards);
        return {
          ...initialEditorState(normalized, state.towerTroop),
          message: normalized.some(
            (slot, i) =>
              slot?.id !== action.slots[i]?.id ||
              slot?.variant !== action.slots[i]?.variant,
          )
            ? "已按当前栏位整理卡牌形态。"
            : "",
        };
      }
      case "tower": {
        const towerTroop = towerTroopSchema.parse(action.value);
        return commit(state.slots, {
          towerTroop,
          candidateId: state.candidateId,
          slotChosen: state.slotChosen,
          message: `塔兵已设为${towerTroopInfo(towerTroop).name}。`,
        });
      }
      case "choose": {
        const used = state.slots.findIndex((slot) => slot?.id === action.id);
        if (used >= 0)
          return {
            ...state,
            target: used,
            candidateId: action.id,
            slotChosen: true,
            swapping: false,
            message: "",
          };
        if (state.slotChosen) return place(action.id, state.target);
        if (cards[action.id]?.rarity === "Champion")
          return place(action.id, championDestination(state.slots, cards));
        if (!state.slots[state.target]) {
          const card = cards[action.id];
          const empty = Array.from(
            { length: 8 },
            (_, i) => (state.target + i) % 8,
          ).find((i) => !state.slots[i] && card && defaultForm(card, i));
          if (empty !== undefined) return place(action.id, empty);
        }
        return {
          ...state,
          candidateId: state.candidateId === action.id ? null : action.id,
          swapping: false,
          message: "",
        };
      }
      case "select":
        if (state.swapping) return move(state.target, action.position);
        if (
          state.candidateId !== null &&
          !state.slots.some((slot) => slot?.id === state.candidateId)
        )
          return place(state.candidateId, action.position);
        return {
          ...state,
          target: action.position,
          slotChosen: true,
          candidateId: state.slots[action.position]?.id ?? null,
          message: "",
        };
      case "drop":
        return place(action.id, action.position);
      case "move":
        return move(action.from, action.to);
      case "remove":
        return commit(
          state.slots.map((slot, i) => (i === state.target ? null : slot)),
        );
      case "form": {
        const slot = state.slots[action.position];
        if (!slot || !cards[slot.id]) return state;
        if (
          action.position !== 2 ||
          !wildSwitchForms(cards[slot.id]).includes(action.value)
        )
          return state;
        return commit(
          putCard(state.slots, action.position, cards[slot.id], action.value),
          {
            candidateId: state.candidateId,
            slotChosen: state.slotChosen,
            message: `已切换为${formNames[action.value]}。`,
          },
        );
      }
      case "swap-mode":
        return {
          ...state,
          swapping: !state.swapping,
          candidateId: null,
          message: "",
        };
      case "cancel-choice":
        return {
          ...state,
          candidateId: null,
          slotChosen: false,
          swapping: false,
          message: "",
        };
      case "undo":
        return state.undo
          ? {
              ...initialEditorState(state.undo.slots, state.undo.towerTroop),
              target: state.undo.target,
              message: "已撤销上一步。",
            }
          : state;
    }
  } catch (error) {
    return { ...state, message: (error as Error).message };
  }
}
