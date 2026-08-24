import React, { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { formatMoney, formatMoneyInput, formatPercentInput, parseMoney } from "@/lib/money-format";

export function MoneyInput({
  value,
  disabled,
  className,
  onCommit,
  onLive,
  percent,
  grouped = true,
  debounceMs = 500,
}: {
  value: number | string;
  disabled?: boolean;
  className?: string;
  onCommit: (n: number) => void;
  onLive?: (n: number) => void;
  percent?: boolean;
  grouped?: boolean;
  debounceMs?: number;
}) {
  const num = Number(value) || 0;
  const toTxt = (n: number) => {
    if (percent) return formatPercentInput(String(n * 100));
    if (!grouped) return formatPercentInput(String(n));
    return formatMoney(n);
  };
  const [txt, setTxt] = useState(toTxt(num));
  const timer = useRef<ReturnType<typeof setTimeout>>();
  const focused = useRef(false);
  const latest = useRef(num);

  useEffect(() => {
    if (focused.current) return;
    const next = Number(value) || 0;
    latest.current = next;
    setTxt(toTxt(next));
  }, [value, percent, grouped]);

  useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  const parse = (formatted: string) => {
    const n = parseMoney(formatted);
    return percent ? n / 100 : n;
  };

  const apply = (raw: string, immediate: boolean) => {
    const formatted = percent || !grouped ? formatPercentInput(raw) : formatMoneyInput(raw);
    setTxt(formatted);
    const n = parse(formatted);
    latest.current = n;
    onLive?.(n);
    if (timer.current) clearTimeout(timer.current);
    if (immediate) onCommit(n);
    else timer.current = setTimeout(() => onCommit(latest.current), debounceMs);
  };

  return (
    <input
      inputMode="decimal"
      disabled={disabled}
      value={txt}
      onFocus={() => {
        focused.current = true;
      }}
      onChange={(e) => apply(e.target.value, false)}
      onBlur={() => {
        focused.current = false;
        apply(txt, true);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur();
      }}
      className={cn(
        "h-8 w-full bg-transparent px-1.5 text-right text-[12px] tabular-nums outline-none focus:bg-white disabled:opacity-70",
        className,
      )}
    />
  );
}
