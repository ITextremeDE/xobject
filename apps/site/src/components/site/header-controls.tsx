import { Menu, Monitor, Moon, Sun } from "lucide-react";
import { useEffect, useState, useSyncExternalStore } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { navigation, repositoryURL } from "@/config/navigation";

import { ui, type Language } from "@/config/content";

export const headerIdentifierPrefix = "xobject-header-";
type Theme = "light" | "dark" | "system";
const options = [
  { value: "light", icon: Sun },
  { value: "dark", icon: Moon },
  { value: "system", icon: Monitor },
] as const;
function subscribeTheme(callback: () => void) {
  document.addEventListener("xobject-theme-change", callback);
  window.addEventListener("storage", callback);
  return () => {
    document.removeEventListener("xobject-theme-change", callback);
    window.removeEventListener("storage", callback);
  };
}
function readTheme(): Theme {
  const value = document.documentElement.dataset.theme;
  return value === "light" || value === "dark" ? value : "system";
}
function subscribeLocation(callback: () => void) {
  window.addEventListener("hashchange", callback);
  return () => window.removeEventListener("hashchange", callback);
}
function readLocation() {
  return window.location.pathname + window.location.hash;
}
function normalizeLocation(location: string) {
  const url = new URL(location, "https://xobject.org");
  const hash = ["", "#seitenanfang", "#inhalt"].includes(url.hash)
    ? "#overview"
    : url.hash;
  return url.pathname + hash;
}

/** Same Base UI controls and interaction model as ITx, hydrated only in the header. */
export function HeaderControls({ lang = "en" }: { lang?: Language }) {
  const t = ui[lang];
  const primaryNavigation = navigation(lang);
  const localizedOptions = options.map((o) => ({ ...o, label: t[o.value] }));
  const theme = useSyncExternalStore(subscribeTheme, readTheme, () => "system");
  const location = useSyncExternalStore(
    subscribeLocation,
    readLocation,
    () => "",
  );
  const [themeOpen, setThemeOpen] = useState(false);
  const [navigationOpen, setNavigationOpen] = useState(false);
  const current =
    localizedOptions.find((option) => option.value === theme) ??
    localizedOptions[2];
  const CurrentIcon = current.icon;
  useEffect(() => {
    const desktop = window.matchMedia("(min-width: 1024px)");
    const closeNavigation = () => {
      if (desktop.matches) setNavigationOpen(false);
    };
    desktop.addEventListener("change", closeNavigation);
    return () => desktop.removeEventListener("change", closeNavigation);
  }, []);
  function selectTheme(value: string) {
    if (!["light", "dark", "system"].includes(value)) return;
    document.documentElement.dataset.theme = value;
    try {
      localStorage.setItem("xobject-theme", value);
    } catch {}
    document.dispatchEvent(new Event("xobject-theme-change"));
    setThemeOpen(false);
  }
  return (
    <>
      <DropdownMenu open={themeOpen} onOpenChange={setThemeOpen}>
        <DropdownMenuTrigger
          render={
            <Button
              size="icon"
              variant="ghost"
              className="xl:border"
              aria-label={`${t.appearance}: ${current.label}`}
              title={`${t.appearance}: ${current.label}`}
            />
          }
        >
          <CurrentIcon aria-hidden="true" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" sideOffset={8} className="w-44">
          <DropdownMenuRadioGroup value={theme} onValueChange={selectTheme}>
            {localizedOptions.map(({ value, label, icon: Icon }) => (
              <DropdownMenuRadioItem
                key={value}
                value={value}
                className="min-h-11 gap-2 px-3"
              >
                <Icon aria-hidden="true" strokeWidth={1.8} />
                {label}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuContent>
      </DropdownMenu>
      <DropdownMenu open={navigationOpen} onOpenChange={setNavigationOpen}>
        <DropdownMenuTrigger
          render={
            <Button
              size="icon"
              variant="outline"
              className="lg:hidden"
              aria-label={t.menu}
              title={t.navigation}
            />
          }
        >
          <Menu aria-hidden="true" />
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="end"
          sideOffset={8}
          className="w-[min(22rem,calc(100vw-2rem))] p-2"
        >
          <DropdownMenuGroup>
            {primaryNavigation.map((link) => (
              <DropdownMenuItem
                key={link.href}
                className="min-h-11 px-3"
                onClick={() => setNavigationOpen(false)}
                render={
                  <a
                    href={link.href}
                    aria-current={
                      normalizeLocation(location) === link.href
                        ? "location"
                        : undefined
                    }
                  />
                }
              >
                {link.label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          <DropdownMenuGroup>
            <DropdownMenuItem
              className="min-h-11 px-3"
              render={<a href={repositoryURL} />}
            >
              GitHub
            </DropdownMenuItem>
            <DropdownMenuItem
              className="min-h-11 px-3"
              render={<a href="https://itextreme.de/" />}
            >
              ITextreme
            </DropdownMenuItem>
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  );
}
