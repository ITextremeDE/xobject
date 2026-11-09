import { ArrowUpRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { content, type Language } from "@/config/content";
export function ProjectActions({
  repository,
  lang = "en",
}: {
  repository: string;
  lang?: Language;
}) {
  const t = content[lang];
  return (
    <div className="actions">
      <Button
        size="lg"
        nativeButton={false}
        render={<a href="https://docs.xobject.org/self-hosting/" />}
      >
        {t.start}
        <ArrowUpRight aria-hidden="true" data-icon="inline-end" />
      </Button>
      <Button
        size="lg"
        variant="outline"
        nativeButton={false}
        render={<a href={repository} />}
      >
        {t.github}
      </Button>
    </div>
  );
}
