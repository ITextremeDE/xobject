import { ui, type Language } from "./content";
export const repositoryURL = "https://github.com/ITextremeDE/xobject";
export function navigation(lang: Language) {
  const t = ui[lang];
  return [
    { label: t.overview, href: `/${lang}/#overview` },
    { label: t.features, href: `/${lang}/#features` },
    { label: t.control, href: `/${lang}/#control` },
    { label: t.start, href: `/${lang}/#start` },
  ];
}
export function resources(lang: Language) {
  const t = ui[lang];
  return [
    { label: t.docs, href: "https://docs.xobject.org/" },
    { label: "Changelog", href: "/changelog/" },
    { label: "Roadmap", href: "/roadmap/" },
    { label: t.requirements, href: "https://docs.xobject.org/prd/" },
    { label: t.source, href: repositoryURL },
  ];
}
