import { Link } from "@tanstack/react-router";
import { Calendar, Bell, NotebookPen, Leaf, User } from "lucide-react";

const items = [
  { to: "/agenda", label: "Agenda", Icon: Calendar },
  { to: "/reminders", label: "Reminders", Icon: Bell },
  { to: "/journal", label: "Notities", Icon: NotebookPen },
  { to: "/laat-los", label: "Laat los", Icon: Leaf },
  { to: "/profiel", label: "Profiel", Icon: User },
] as const;

export function BottomNav() {
  return (
    <nav className="fixed inset-x-0 bottom-0 z-20 border-t border-border/60 bg-background/90 backdrop-blur">
      <ul className="mx-auto flex max-w-2xl items-stretch justify-between px-2 py-2">
        {items.map(({ to, label, Icon }) => (
          <li key={to} className="flex-1">
            <Link
              to={to}
              className="flex flex-col items-center gap-1 rounded-2xl px-2 py-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
              activeProps={{ className: "text-primary" }}
            >
              <Icon className="h-5 w-5" strokeWidth={1.6} />
              <span>{label}</span>
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
