import { MiniOrb } from "./mini-orb";

type Props = { size?: number; withWordmark?: boolean };

export function BrandMark({ size = 32, withWordmark = true }: Props) {
  return (
    <div className="flex items-center gap-2.5">
      <MiniOrb size={size} />
      {withWordmark && (
        <span
          className="text-xl font-medium tracking-tight text-foreground"
          style={{ fontFamily: "var(--font-display)" }}
        >
          HoofdRust
        </span>
      )}
    </div>
  );
}
