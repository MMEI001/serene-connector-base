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
      <div className="surface-nav pointer-events-auto pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
        <ul className="mx-auto grid max-w-2xl grid-cols-5 items-end px-3">
          {leftItems.map(({ to, label, Icon }) => (
            <NavItem key={to} to={to} label={label} Icon={Icon} onTap={haptic.light} />
          ))}
          <li className="flex justify-center">
            <Link
              to="/laat-los"
              aria-label="Laat los"
              onClick={haptic.medium}
              className="flex flex-col items-center gap-1 text-muted-foreground transition-colors hover:text-foreground"
              activeProps={{ className: "text-foreground" }}
            >
              <span className="flex h-6 w-6 items-center justify-center">
                <MiniOrb size={28} breathing glow />
              </span>
              <span className="text-[10px] font-medium tracking-wide">Laat los</span>
            </Link>
          </li>
          {rightItems.map(({ to, label, Icon }) => (
            <NavItem key={to} to={to} label={label} Icon={Icon} onTap={haptic.light} />
          ))}
        </ul>
      </div>
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
