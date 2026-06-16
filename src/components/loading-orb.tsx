import { MiniOrb } from "./mini-orb";

type Props = {
  label?: string;
  size?: number;
  className?: string;
};

export function LoadingOrb({
  label = "Even rustig…",
  size = 48,
  className = "",
}: Props) {
  return (
    <div
      className={`flex flex-col items-center justify-center gap-3 py-10 ${className}`}
    >
      <MiniOrb size={size} breathing glow />
      {label && (
        <p className="text-xs tracking-wide text-muted-foreground">{label}</p>
      )}
    </div>
  );
}
