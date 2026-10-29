import { ArrowUpRight } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Build-rendered links; native anchors work without React hydration. */
export function ProjectActions({ repository }: { repository: string }) {
  return (
    <div className="actions">
      <Button size="lg" nativeButton={false} render={<a href={repository} />}>
        Projekt auf GitHub{" "}
        <ArrowUpRight aria-hidden="true" data-icon="inline-end" />
      </Button>
      <Button
        size="lg"
        variant="outline"
        nativeButton={false}
        render={<a href={`${repository}/blob/main/docs/PRD.md`} />}
      >
        Konzept lesen
      </Button>
    </div>
  );
}
