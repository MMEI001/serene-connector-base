import { Link } from "@tanstack/react-router";
import { Calendar, Bell, NotebookPen, User } from "lucide-react";
import { useHaptic } from "@/lib/use-haptic";
import { MiniOrb } from "@/components/mini-orb";

const leftItems = [
  { to: "/agenda", label: "Agenda", Icon: Calendar },
  { to: "/reminders", label: "Reminders", Icon: Bell },
] as const;

const rightItems = [
  { to: "/notities", label: "Notities", Icon: NotebookPen },
  { to: "/profiel", label: "Profiel", Icon: User },
] as const;

export function BottomNav() {
  const haptic = useHaptic();
  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 pointer-events-none">
      <div className="surface-nav pointer-events-auto relative overflow-visible pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <ul className="mx-auto grid max-w-2xl grid-cols-5 items-end px-3">
          {leftItems.map(({ to, label, Icon }) => (
            <NavItem key={to} to={to} label={label} Icon={Icon} onTap={haptic.light} />
          ))}
          <li className="flex justify-center pt-7">
            <Link
              to="/laat-los"
              onClick={haptic.light}
              className="text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground transition-colors hover:text-foreground"
              activeProps={{ className: "text-foreground" }}
            >
              Laat los
            </Link>
          </li>
          {rightItems.map(({ to, label, Icon }) => (
            <NavItem key={to} to={to} label={label} Icon={Icon} onTap={haptic.light} />
          ))}
        </ul>
      </div>

      {/* Floating mini-orb — the iridescent orb itself, no gradient ring */}
      <Link
        to="/laat-los"
        aria-label="Laat los"
        onClick={haptic.medium}
        className="pointer-events-auto absolute left-1/2 bottom-[calc(env(safe-area-inset-bottom)+2.25rem)] z-50 flex h-16 w-16 -translate-x-1/2 items-center justify-center rounded-full transition-transform duration-500 ease-[cubic-bezier(0.4,0,0.2,1)] active:scale-95 drop-shadow-[0_10px_24px_rgba(200,182,217,0.5)]"
      >
        <MiniOrb size={56} breathing glow />
      </Link>
    </nav>
  );
}

function NavItem({
  to,
  label,
  Icon,
  onTap,
}: {
  to: string;
  label: string;
  Icon: typeof Calendar;
  onTap?: () => void;
}) {
  return (
    <li className="flex">
      <Link
        to={to}
        onClick={onTap}
        className="flex flex-1 flex-col items-center gap-1 rounded-2xl px-2 py-1 text-muted-foreground transition-colors duration-300 ease-[cubic-bezier(0.4,0,0.2,1)] hover:text-foreground"
        activeProps={{ className: "text-foreground" }}
      >
        <Icon className="h-6 w-6" strokeWidth={1.5} />
        <span className="text-[10px] font-medium tracking-wide">{label}</span>
      </Link>
    </li>
  );
}
