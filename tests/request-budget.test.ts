import { afterEach, describe, expect, it, vi } from "vitest";
import { createDictionaryLoader } from "../web/card-dictionary";
import { scheduleDebounce } from "../web/debounce";
import type { Card } from "../shared/schema";

afterEach(() => vi.useRealTimers());

describe("dictionary request budget", () => {
  it("shares an in-flight request and reuses a loaded immutable version", async () => {
    let resolve!: (data: { cards: Card[] }) => void;
    const request = vi.fn(() => new Promise<{ cards: Card[] }>((done) => { resolve = done; }));
    const load = createDictionaryLoader(request);
    const first = load("archive", "version-a");
    const remount = load("archive", "version-a");
    expect(remount).toBe(first);
    expect(request).toHaveBeenCalledTimes(1);
    resolve({ cards: [{ id: 26000000, name: "Knight" } as Card] });
    expect((await first)[26000000].name).toBe("Knight");
    await load("archive", "version-a");
    expect(request).toHaveBeenCalledTimes(1);
  });

  it("separates streams/versions and permits retry after failure", async () => {
    const request = vi.fn().mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValue({ cards: [] });
    const load = createDictionaryLoader(request);
    await expect(load("a", "one")).rejects.toThrow("offline");
    await load("a", "one");
    await load("a", "two");
    await load("b", "two");
    expect(request).toHaveBeenCalledTimes(4);
  });
});

describe("search request debounce", () => {
  it("commits only the final term after a burst of input", () => {
    vi.useFakeTimers();
    const commit = vi.fn();
    let cancel = scheduleDebounce("k", 300, commit);
    vi.advanceTimersByTime(100);
    cancel();
    cancel = scheduleDebounce("kn", 300, commit);
    vi.advanceTimersByTime(100);
    cancel();
    scheduleDebounce("knight", 300, commit);
    vi.advanceTimersByTime(299);
    expect(commit).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(commit.mock.calls).toEqual([["knight"]]);
  });

  it("cancels pending input when unmounting or clearing", () => {
    vi.useFakeTimers();
    const commit = vi.fn();
    scheduleDebounce("old", 300, commit)();
    vi.runAllTimers();
    expect(commit).not.toHaveBeenCalled();
  });
});
