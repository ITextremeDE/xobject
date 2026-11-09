import { useEffect, useRef, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { Language } from "@/config/content";

type Selection = {
  src: string;
  caption: string;
  width: number;
  height: number;
};

/** One progressively enhanced viewer; Base UI owns modal focus and dismissal. */
export function ScreenshotLightbox({ lang }: { lang: Language }) {
  const [selection, setSelection] = useState<Selection | null>(null);
  const [open, setOpen] = useState(false);
  const origin = useRef<HTMLAnchorElement | null>(null);
  useEffect(() => {
    const anchors =
      document.querySelectorAll<HTMLAnchorElement>("a[data-screenshot]");
    anchors.forEach((anchor) => anchor.setAttribute("aria-haspopup", "dialog"));
    function onClick(event: MouseEvent) {
      if (
        event.defaultPrevented ||
        event.button !== 0 ||
        event.ctrlKey ||
        event.metaKey ||
        event.shiftKey ||
        event.altKey
      )
        return;
      const anchor =
        event.target instanceof Element
          ? event.target.closest<HTMLAnchorElement>("a[data-screenshot]")
          : null;
      if (!anchor) return;
      event.preventDefault();
      origin.current = anchor;
      setSelection({
        src: anchor.href,
        caption: anchor.dataset.caption ?? "",
        width: Number(anchor.dataset.width),
        height: Number(anchor.dataset.height),
      });
      setOpen(true);
    }
    document.addEventListener("click", onClick);
    return () => {
      document.removeEventListener("click", onClick);
      anchors.forEach((anchor) => anchor.removeAttribute("aria-haspopup"));
    };
  }, []);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent
        size="image"
        closeLabel={lang === "de" ? "Schließen" : "Close"}
        finalFocus={origin}
      >
        <DialogHeader className="pr-12">
          <DialogTitle>Screenshot</DialogTitle>
          <DialogDescription>{selection?.caption}</DialogDescription>
        </DialogHeader>
        {selection && (
          <img
            src={selection.src}
            alt={selection.caption}
            width={selection.width}
            height={selection.height}
            className="mx-auto min-h-0 max-h-[calc(100dvh-9rem)] w-auto max-w-full object-contain"
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
