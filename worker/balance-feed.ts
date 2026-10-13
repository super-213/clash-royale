import capture from "../data/royaleapi-web/balance-2026-10.json";
import directory from "../data/community.json";
import { builderCards } from "./builder-feed";
import type { BalanceEdition, BalanceEntry } from "../shared/brief";

// IDs cross-checked against data/community.json; Chinese names against the
// archived card directory. Notes are editorial inferences, not measured results.
const notes: Record<
  string,
  { id: number; name: string; interpretation: string; watch: string }
> = {
  "barbarian-barrel": {
    id: 28000015,
    name: "野蛮人滚桶",
    interpretation:
      "滚桶的滚动伤害降低，原先依靠滚动伤害完成的解场需要重新检查。表格没有说明生成的野蛮人发生变化。",
    watch:
      "按你实际卡牌等级，检查常见目标是否需要补伤害；仅凭这张表不能确认哪些目标不再被一击消灭。",
  },
  skeletons: {
    id: 26000010,
    name: "骷髅兵",
    interpretation:
      "生成范围缩小，落地分布更集中。原有的包围、拉扯摆位可能需要微调，不能把范围变化理解成伤害降低。",
    watch: "复测常用包围和拉扯位置，观察能否维持原先的防守效果。",
  },
  "cannon-ev1": {
    id: 27000000,
    name: "加农炮",
    interpretation:
      "觉醒炮的弹幕伤害降低，依赖弹幕清理单位的防守可能更需要补伤害。这项调整没有直接说明普通加农炮的伤害改变。",
    watch:
      "确认卡组使用觉醒加农炮，再复测弹幕清场；普通形态不能直接套用本条结论。",
  },
  "ice-wizard-hero": {
    id: 26000023,
    name: "寒冰法师",
    interpretation:
      "精英形态的技能伤害降低，依赖技能补伤害的解场可能变得更吃配合。不能据此认定减速效果或普通攻击也被削弱。",
    watch: "确认使用精英形态，检查技能释放后是否需要补一张低费牌。",
  },
  "ram-rider": {
    id: 26000051,
    name: "蛮羊骑士",
    interpretation:
      "公告记录的伤害提高，有利于该伤害对应的输出环节；表格本身不足以推导冲锋、骑手攻击或整套卡组的收益。",
    watch:
      "在相同等级与场景下对比接触目标后的表现，不因单项加强立即更换主卡组。",
  },
  "goblin-barrel": {
    id: 28000004,
    name: "哥布林飞桶",
    interpretation:
      "首次攻击等待时间缩短，对手的解桶时机可能更紧。提前起手不等于每次投桶都能增加伤害。",
    watch: "练习常见解桶手段的响应时机，并区分普通与觉醒形态的实际表现。",
  },
  "lava-hound": {
    id: 26000029,
    name: "熔岩猎犬",
    interpretation:
      "单次伤害上升，同时每秒攻击次数下降，两项需要一起看。攻击次数下降意味着出手更慢，不能将其误读成攻击间隔缩短。",
    watch:
      "观察持续输出与收尾节奏；表格没有提供幼犬变化，不能把本体调整直接套用到幼犬。",
  },
  "x-bow": {
    id: 27000008,
    name: "十字连弩",
    interpretation:
      "单次伤害提高，可能改善连弩持续锁定目标时的输出。实际收益仍取决于锁定时长与对手解法。",
    watch: "复盘能否创造稳定锁定机会，不把单次伤害涨幅当作卡组胜率涨幅。",
  },
  "wall-breakers": {
    id: 26000058,
    name: "攻城炸弹人",
    interpretation:
      "伤害提高，让成功造成伤害的进攻更有价值，但不会自动提高突破对手防守的概率。",
    watch: "继续检查进攻能否接触目标；需要实测后才能判断是否改变斩杀线。",
  },
  "goblin-drill": {
    id: 27000013,
    name: "哥布林钻机",
    interpretation:
      "公告记录的塔伤从零变为非零，为该伤害环节增加了输出。不能据此推导整次钻机进攻的总伤害。",
    watch:
      "按实际等级核对塔伤，观察残局斩杀是否需要调整；原文未标明这组数值的等级。",
  },
  "golden-knight": {
    id: 26000074,
    name: "黄金圣骑",
    interpretation:
      "伤害提高，但冲刺距离缩短，是两项方向不同的调整。原来依靠较远目标衔接的冲刺路线可能需要重练。",
    watch: "先复测常用冲刺衔接距离，再评估伤害提升能否补偿路线变化。",
  },
  "royal-ghost": {
    id: 26000050,
    name: "皇家幽灵",
    interpretation:
      "生命值降低，同时伤害略有提高。公告整体标为削弱，但不能把每一项都描述为降低；生存能力需要重点观察。",
    watch:
      "复测常见防守交换，核对是否更早被消灭；不要仅因伤害微增而判断整体加强。",
  },
  "minion-giant": {
    id: 26000107,
    name: "Minion Giant",
    interpretation:
      "每秒攻击次数下降，出手频率更低。在其他条件相同的前提下，持续输出可能受到影响。",
    watch: "观察连续攻击与防守收尾节奏；这里的单位是次/秒，不是攻击间隔。",
  },
  "elixir-collector": {
    id: 27000007,
    name: "圣水收集器",
    interpretation:
      "存续时间延长，但每秒产水速度降低，回收资源的节奏变慢。仅凭舍入后的两项数值，不能准确计算总产水或净收益。",
    watch:
      "关注回本时间、被法术处理的风险及实际总产水，不把寿命延长单独当作加强。",
  },
  "three-musketeers": {
    id: 26000028,
    name: "三个火枪手",
    interpretation:
      "生命值提高，可能改善承伤能力。能否改变某种法术组合的击杀结果，需要同等级伤害数据或实测。",
    watch: "核对常见法术组合，不直接宣称可以多吃一次攻击或躲过某种法术。",
  },
  monk: {
    id: 26000077,
    name: "盖世武僧",
    interpretation:
      "技能激活等待时间缩短，可能让应对来袭攻击的时机更宽裕。它没有直接说明技能持续时间改变。",
    watch: "练习技能响应时机，复测对常见弹道的操作窗口。",
  },
  "elite-barbarians-ev1": {
    id: 26000043,
    name: "野蛮人精锐",
    interpretation:
      "觉醒形态的视野范围调整，可能影响索敌和拉扯路径。这是公告中的修复项，范围增大不能直接等同于战力提高。",
    watch: "确认觉醒形态，复测分路和拉扯后的目标选择。",
  },
};
const labels: Record<string, string> = {
  damage: "伤害",
  spawn_radius: "生成范围",
  barrage_damage: "弹幕伤害",
  ability_damage: "技能伤害",
  first_hit_time: "首次攻击等待",
  hit_rate: "每秒攻击次数",
  tower_damage: "塔伤",
  dash_distance: "冲刺距离",
  hp: "生命值",
  lifetime: "存续时间",
  elixir_speed: "每秒产水",
  activation_time: "技能激活等待",
  sight_range: "视野范围",
};

function buildEdition(): BalanceEdition {
  const entries = new Map<string, BalanceEntry>();
  for (const row of capture.balance_changes) {
    const note = notes[row.key];
    if (!note)
      throw new Error(`Missing balance editorial/identity: ${row.key}`);
    if (row.before.unit !== row.after.unit)
      throw new Error(`Mismatched units: ${row.key}`);
    let entry = entries.get(row.key);
    if (!entry) {
      const category = /\(Buff\)/.test(row.section_title)
        ? "buff"
        : /\(Nerf\)/.test(row.section_title)
          ? "nerf"
          : /\(Rework\)/.test(row.section_title)
            ? "rework"
            : /\(Bugfix\)/.test(row.section_title)
              ? "bugfix"
              : null;
      if (!category || !["normal", "evolution", "hero"].includes(row.variant)) {
        throw new Error(`Unrecognized balance section/form: ${row.key}`);
      }
      entry = {
        key: row.key,
        cardId: note.id,
        name: note.name,
        variant: row.variant as BalanceEntry["variant"],
        category,
        sourceUrl: row.source_url,
        facts: [],
        interpretation: note.interpretation,
        watch: note.watch,
      };
      entries.set(row.key, entry);
    }
    entry.facts.push({
      metric: row.metric,
      label: labels[row.metric] ?? row.source_label,
      before: row.before.value,
      after: row.after.value,
      unit: row.after.unit,
      sourcePercent: row.source_change_percent,
      level: row.level,
    });
  }
  return {
    id: "2026-10-season-88",
    title: "2026 年 10 月 · 第 88 赛季",
    publishedOn: capture.published_on,
    observedAt: capture.observed_at,
    effectiveAt: capture.effective_at,
    liveVersionVerified: capture.live_version_verified,
    sourceUrl: capture.source_url,
    entries: [...entries.values()],
  };
}

// Most recently published first. Add reviewed editions here; never infer a
// balance patch by comparing unrelated or historical parameter streams.
export const balanceEditions: BalanceEdition[] = [buildEdition()];

// Lightweight identity fallback: brief cards stay readable while a selected
// source's full parameter dictionary loads, or when it omits a newer card.
export const briefCards = directory.cards.map((card) => ({
  id: card.id,
  name:
    Object.values(notes).find((note) => note.id === card.id)?.name ?? card.name,
  image_url: card.image_url,
  rarity: card.rarity,
  elixir: card.elixir,
  form_images: builderCards.find((entry) => entry.id === card.id)?.form_images,
}));
