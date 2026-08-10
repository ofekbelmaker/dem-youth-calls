"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/", glyph: "☰", label: "השיחות שלי" },
  { href: "/event", glyph: "◑", label: "הפעולה" },
];

export default function TabBar() {
  const pathname = usePathname();

  return (
    <nav className="tabs" aria-label="ניווט ראשי">
      {TABS.map((tab) => (
        <Link
          key={tab.href}
          href={tab.href}
          aria-current={pathname === tab.href ? "page" : undefined}
        >
          <span className="glyph" aria-hidden="true">
            {tab.glyph}
          </span>
          {tab.label}
        </Link>
      ))}
    </nav>
  );
}
