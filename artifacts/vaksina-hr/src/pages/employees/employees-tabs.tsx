import React from "react";
import { Link, useLocation } from "wouter";
import { cn } from "../../lib/utils";

export function EmployeesTabs() {
  const [loc] = useLocation();
  const items = [
    { href: "/employees", label: "Ro‘yxat" },
    { href: "/employees/duplicates", label: "Dublikatlar" },
  ];
  return (
    <div className="flex flex-wrap gap-1 rounded-xl bg-white/10 p-1">
      {items.map((it) => {
        const active = it.href === "/employees" ? loc === "/employees" : loc.startsWith(it.href);
        return (
          <Link
            key={it.href}
            href={it.href}
            className={cn(
              "rounded-lg px-3 py-1.5 text-xs font-semibold transition",
              active ? "bg-white text-[#0b3a5c]" : "text-white/80 hover:bg-white/10 hover:text-white",
            )}
          >
            {it.label}
          </Link>
        );
      })}
    </div>
  );
}
