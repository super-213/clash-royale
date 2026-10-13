import type { Status } from "../types";
import { date, stale, streamName } from "../format";
import { ArrowUpRight } from "lucide-react";
export function Sources({
  status,
  loading,
}: {
  status: Status | null;
  loading: boolean;
}) {
  return (
    <>
      <div className="source-section">
        <h2>已接入来源</h2>
        <p className="muted">
          参数以来源更新日期为准，采集时间不代表游戏版本。
        </p>
        {loading ? (
          <p>读取中…</p>
        ) : (
          status?.heads.map((r) => (
            <article className="source-row" key={r.id}>
              <div>
                <span className={"source-state " + (stale(r) ? "old" : "")}>
                  {stale(r) ? "历史归档" : "已接入"}
                </span>
                <h3>{streamName[r.stream] ?? r.stream}</h3>
                <a href={r.source_url} target="_blank" rel="noreferrer">
                  查看原始来源 <ArrowUpRight size={15} />
                </a>
              </div>
              <dl>
                <div>
                  <dt>卡牌覆盖</dt>
                  <dd>{r.card_count} 张</dd>
                </div>
                <div>
                  <dt>
                    {r.stream === "supercell-api"
                      ? "目录观测时间"
                      : "来源更新时间"}
                  </dt>
                  <dd>
                    {date(r.latest_source_updated_at ?? r.source_updated_at)}
                  </dd>
                </div>
                <div>
                  <dt>本站采集时间</dt>
                  <dd>{date(r.last_observed_at ?? r.observed_at)}</dd>
                </div>
                <div>
                  <dt>当前快照</dt>
                  <dd>
                    <code>{r.id.slice(0, 10)}</code>
                  </dd>
                </div>
              </dl>
            </article>
          ))
        )}
      </div>
      <div className="source-section">
        <h2>最近采集运行</h2>
        {status?.runs.length ? (
          <div className="runs-table">
            {status.runs.map((r) => (
              <div key={r.source}>
                <strong>{r.source}</strong>
                <span
                  className={r.status === "success" ? "run-ok" : "run-failed"}
                >
                  {r.status === "success"
                    ? "成功"
                    : r.status === "blocked"
                      ? "来源拒绝访问"
                      : "失败"}
                </span>
                <span>{date(r.finished_at)}</span>
                <p>{r.message || `处理 ${r.count} 条数据`}</p>
              </div>
            ))}
          </div>
        ) : (
          <p className="muted">尚无采集运行记录。</p>
        )}
      </div>
      <div className="source-section scope">
        <h2>收录范围</h2>
        <p>
          历史归档提供旧版参数与预设卡组，不代表当前环境。官方目录不提供生命值、伤害等完整战斗参数。
        </p>
        <p>
          CR Data 提供采样对局的卡牌与卡组，未区分全部特殊形态，不代表热门排名。当前仅支持国际服。
        </p>
        <p>
          本站是独立粉丝项目，与 Supercell
          无隶属、赞助或认证关系。游戏内容及素材归权利人所有。
          <a
            href="https://supercell.com/en/fan-content-policy/"
            target="_blank"
            rel="noreferrer"
          >
            Supercell 粉丝内容政策
          </a>
        </p>
      </div>
    </>
  );
}
