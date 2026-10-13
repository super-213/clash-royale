import { useEffect, useRef, useState } from "react";
import type { Card } from "../../shared/schema";
import { RefreshCw, Layers, ChevronLeft, ChevronRight, X } from "lucide-react";
export function Picture({
  card,
  small = false,
}: {
  card?: Card;
  small?: boolean;
}) {
  const [broken, setBroken] = useState(false);
  useEffect(() => setBroken(false), [card?.image_url]);
  return (
    <div className={"picture " + (small ? "small" : "")}>
      {card?.image_url && !broken ? (
        <img
          src={card.image_url}
          alt={card.name}
          loading="lazy"
          onError={() => setBroken(true)}
        />
      ) : (
        <span className="image-fallback">{card?.name ?? "未知卡牌"}</span>
      )}
      {card && <span className="elixir">{card.elixir}</span>}
    </div>
  );
}
export function Notice({ error, retry }: { error: string; retry: () => void }) {
  return (
    <div className="notice error" role="alert">
      {error}
      <button onClick={retry}>
        <RefreshCw size={16} />
        重新加载
      </button>
    </div>
  );
}
export function Empty({ text }: { text: string }) {
  return (
    <div className="empty">
      <Layers size={32} />
      <p>{text}</p>
    </div>
  );
}
export function Pager({
  page,
  total,
  size,
  onChange,
}: {
  page: number;
  total: number;
  size: number;
  onChange: (p: number) => void;
}) {
  return total > size ? (
    <div className="pager">
      <span>
        共 {total} 条 · 第 {page} / {Math.ceil(total / size)} 页
      </span>
      <button
        aria-label="上一页"
        disabled={page <= 1}
        onClick={() => onChange(page - 1)}
      >
        <ChevronLeft size={18} />
      </button>
      <button
        aria-label="下一页"
        disabled={page * size >= total}
        onClick={() => onChange(page + 1)}
      >
        <ChevronRight size={18} />
      </button>
    </div>
  ) : null;
}
export function Modal({
  title,
  close,
  children,
}: {
  title: string;
  close: () => void;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current!;
    d.showModal();
    const old = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = old;
    };
  }, []);
  return (
    <dialog
      className="detail-dialog"
      ref={ref}
      onCancel={close}
      onClick={(e) => {
        if (e.target === e.currentTarget) close();
      }}
    >
      <div className="dialog-heading">
        <strong>{title}</strong>
        <button aria-label="关闭详情" onClick={close}>
          <X size={21} />
        </button>
      </div>
      <div className="dialog-body">{children}</div>
    </dialog>
  );
}
