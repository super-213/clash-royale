import { useEffect, useState } from "react";
export async function api<T>(url: string, signal?: AbortSignal): Promise<T> {
  const r = await fetch(url, { signal });
  const data = (await r.json()) as T & { error?: string };
  if (!r.ok) throw new Error(data.error ?? "数据请求失败");
  return data;
}
export function useApi<T>(url: string | null) {
  const [data, setData] = useState<T | null>(null),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true),
    [nonce, setNonce] = useState(0);
  useEffect(() => {
    const ctrl = new AbortController();
    setLoading(true);
    setError("");
    setData(null);
    if (url === null) return;
    api<T>(url, ctrl.signal)
      .then((result) => { if (!ctrl.signal.aborted) setData(result); })
      .catch((e) => {
        if (!ctrl.signal.aborted && e.name !== "AbortError") setError(e.message);
      })
      .finally(() => {
        if (!ctrl.signal.aborted) setLoading(false);
      });
    return () => ctrl.abort();
  }, [url, nonce]);
  return { data, error, loading, retry: () => setNonce((n) => n + 1) };
}
