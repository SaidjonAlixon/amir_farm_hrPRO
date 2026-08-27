import React, { useMemo, useState } from "react";
import { ChevronDown, Layers } from "lucide-react";
import { cn } from "@/lib/utils";

function chunkArray<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    out.push(arr.slice(i, i + size));
  }
  return out;
}

type CardStackProps<T> = {
  items: T[];
  getKey: (item: T) => string | number;
  renderCard: (
    item: T,
    opts: { inStack: boolean; isTop: boolean },
  ) => React.ReactNode;
  stackSize?: number;
  className?: string;
};

/**
 * 2–3 ta kartani yig'adi: faqat yuqori karta to'liq, orqadagilar yupqa chiziq.
 * Bosilganda ochiladi.
 */
export function CardStack<T>({
  items,
  getKey,
  renderCard,
  stackSize = 3,
  className,
}: CardStackProps<T>) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const groups = useMemo(
    () => chunkArray(items, Math.max(2, stackSize)),
    [items, stackSize],
  );

  if (items.length === 0) return null;

  return (
    <div className={cn("flex flex-col gap-3", className)}>
      {groups.map((group) => {
        const groupKey = group.map(getKey).join("-");
        const isExpanded = !!expanded[groupKey];

        if (group.length === 1) {
          return (
            <div key={groupKey}>
              {renderCard(group[0], { inStack: false, isTop: true })}
            </div>
          );
        }

        if (isExpanded) {
          return (
            <div key={groupKey} className="space-y-2">
              <button
                type="button"
                onClick={() =>
                  setExpanded((prev) => ({ ...prev, [groupKey]: false }))
                }
                className="flex w-full items-center justify-center gap-1 rounded-lg border border-dashed border-slate-300 bg-white/70 py-1 text-[10px] font-semibold text-slate-500 hover:bg-white hover:text-slate-700"
              >
                <Layers className="h-3 w-3" />
                Yig‘ish ({group.length})
              </button>
              {group.map((item) => (
                <div key={getKey(item)}>
                  {renderCard(item, { inStack: false, isTop: true })}
                </div>
              ))}
            </div>
          );
        }

        // Yopiq: faqat birinchi karta to'liq; qolganlari pastida yupqa qatlam
        const behindCount = group.length - 1;
        return (
          <button
            key={groupKey}
            type="button"
            className="group/stack relative w-full text-left outline-none focus-visible:ring-2 focus-visible:ring-sky-400 rounded-xl"
            style={{ paddingBottom: behindCount * 6 }}
            onClick={() =>
              setExpanded((prev) => ({ ...prev, [groupKey]: true }))
            }
            title="Ochish uchun bosing"
          >
            {/* Orqa qatlamlar — faqat oq chiziq / shadow, matnsiz */}
            {Array.from({ length: behindCount }).map((_, i) => {
              const depth = behindCount - i; // 1..n, n eng orqa
              return (
                <div
                  key={`peek-${i}`}
                  aria-hidden
                  className="pointer-events-none absolute left-1 right-1 rounded-xl border border-slate-200 bg-white shadow-sm"
                  style={{
                    top: depth * 6,
                    bottom: 0,
                    zIndex: depth,
                    opacity: 0.85 - i * 0.1,
                    transform: `scale(${1 - depth * 0.02})`,
                  }}
                />
              );
            })}

            {/* Yuqori karta */}
            <div className="relative z-20 pointer-events-none [&_a]:pointer-events-none">
              {renderCard(group[0], { inStack: true, isTop: true })}
            </div>

            <span className="pointer-events-none absolute bottom-0 right-2 z-30 inline-flex items-center gap-0.5 rounded-full bg-slate-900 px-2 py-0.5 text-[10px] font-bold text-white shadow-md">
              <ChevronDown className="h-3 w-3" />
              {group.length}
            </span>
          </button>
        );
      })}
    </div>
  );
}
