import { Card } from "@/components/ui/card";

export function EmptyState({ children = "Nog niets om te tonen" }: { children?: React.ReactNode }) {
  return (
    <Card className="rounded-3xl border-border/60 bg-card/60 p-6 text-center text-sm text-muted-foreground shadow-sm">
      {children}
    </Card>
  );
}
