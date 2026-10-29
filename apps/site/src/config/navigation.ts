export const repositoryURL = "https://github.com/ITextremeDE/xobject";

export const primaryNavigation = [
  { label: "Überblick", href: "/#ueberblick" },
  { label: "Objektmodell", href: "/#objektmodell" },
  { label: "Idee", href: "/#idee" },
  { label: "Entwicklung", href: "/#entwicklung" },
] as const;

export const projectResources = [
  { label: "Quellcode", href: repositoryURL },
  { label: "Anforderungen", href: `${repositoryURL}/blob/main/docs/PRD.md` },
  { label: "Roadmap", href: `${repositoryURL}/blob/main/ROADMAP.md` },
] as const;
