import { MiniOrb } from "./mini-orb";

type Props = {
  children?: React.ReactNode;
  /** Show a mini orb above the message (default true). */
  orb?: boolean;
  size?: number;
};

export function EmptyState({ children = "Nog niets om te tonen", orb = true, size = 44 }: Props) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-3xl border border-border/40 bg-white/40 px-6 py-10 text-center text-sm text-muted-foreground backdrop-blur-sm">
      {orb && <MiniOrb size={size} glow />}
      <p className="max-w-xs leading-relaxed">{children}</p>
    </div>
  );
}
