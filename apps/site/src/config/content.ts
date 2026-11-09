export type Language = "en" | "de";
export const content = {
  en: {
    title: "Your data. Clearly connected.",
    description:
      "Connect contacts, projects and your own data objects. An adaptable open-source application with API, MCP and self-hosting.",
    headline: ["Your data.", "Clearly connected."],
    intro:
      "Contacts, projects and your own data objects in one application. Adapt it to your work, keep changes traceable and run it on your infrastructure.",
    start: "Get started",
    github: "View on GitHub",
    eyebrow: "Open source · Self-hosted · API & MCP",
    story: "See the connections. Keep the context.",
    storyText:
      "From a customer to a project, from a case to its tasks. Link devices and service plans too. Open the record and find the information that belongs together.",
    steps: [
      [
        "Start with a contact",
        "Keep organizations and the people you work with in one place.",
      ],
      [
        "Bring the work together",
        "Connect projects, cases and tasks through a clear primary association.",
      ],
      [
        "Add your own context",
        "Link devices, contracts or the data objects that matter to your work.",
      ],
    ],
    features: "Start ready. Make it yours.",
    featuresText:
      "Use the supplied modules and add the structures your work needs.",
    areas: [
      [
        "Contacts & Relations",
        "Organizations, contact people, individual contacts and distribution lists. Structured contact details without losing the relationships.",
      ],
      [
        "Projects & Tasks",
        "Projects, cases and tasks with schedules, progress and shared context. Find the work and the people responsible for it.",
      ],
      [
        "Your own data objects",
        "Model devices, service plans or something completely different. Define fields, relationships and forms without changing application code.",
      ],
    ],
    control: "Keep control. Understand every change.",
    controlText:
      "Separate your work into workspaces. Give users and groups the access they need, follow changes in the journal and recover records from the recycle bin.",
    controlItems: [
      [
        "Access that follows your rules",
        "Object and field permissions, ownership and foreign access work together. Agents have the same effective rights as their user.",
      ],
      [
        "A traceable history",
        "The journal records individual field and relationship changes. See what changed, when and by whom.",
      ],
      [
        "Space for different worlds",
        "Separate definitions, records and teams in workspaces, each with its own appearance.",
      ],
    ],
    automation: "Use the interface. Or let your tools do the work.",
    automationText:
      "The web interface, API and MCP use the same business rules and permissions. Connect your automation or a compatible AI client with a personal, revocable credential.",
    prompt:
      "Create a project, link the customer and add the first three tasks.",
    api: "Explore API & MCP",
    own: "Open source. On your infrastructure.",
    ownText:
      "The entire V1 feature set is Community, under AGPL-3.0-only. Install the prebuilt containers with Docker Compose and stay in control of your data.",
    ownSteps: [
      "Follow the self-hosting guide.",
      "Configure your installation and create the first administrator.",
      "Activate modules and shape your workspace.",
    ],
    release: "Releases & downloads",
    faq: "A few useful answers.",
    questions: [
      [
        "Who is xObject for?",
        "People and teams who want contacts, projects and their own structured information to work together. Start with the supplied modules and extend them as needed.",
      ],
      [
        "Can I create my own objects and forms?",
        "Yes. Designers and administrators can configure data objects, fields, selection lists, relationships and forms. Supplied contact forms have a fixed core and support additional custom fields.",
      ],
      [
        "Where does the application run?",
        "In your browser, backed by your own installation. The supported self-hosting path uses Docker Compose and prebuilt Linux container images.",
      ],
      [
        "Does the AI get administrator access?",
        "An agent works with its user’s effective rights. Personal credentials can be limited, expire and be revoked. MCP support depends on the capabilities of your client.",
      ],
      [
        "What is planned next?",
        "The public roadmap describes later improvements. File uploads, standards-based synchronization, SSO and native clients are later scope.",
      ],
    ],
    screenshots:
      "Real application views from the fictional ITextreme demo workspace.",
    enDocs: "Documentation is currently available in English.",
    captions: {
      project: "A project with its cases and tasks in the shared hierarchy.",
      contact:
        "Contact details, addresses and professional information in context.",
      list: "Search, sort and navigate the records in your workspace.",
      custom:
        "A custom service plan: your fields, your relationships, your form.",
      journal: "Individual changes remain traceable in the record journal.",
    },
    zoom: "Open full-size screenshot",
  },
  de: {
    title: "Deine Daten. Klar verbunden.",
    description:
      "Kontakte, Projekte und eigene Datenobjekte verbinden. Eine anpassbare Open-Source-Anwendung mit API, MCP und Self-Hosting.",
    headline: ["Deine Daten.", "Klar verbunden."],
    intro:
      "Kontakte, Projekte und eigene Datenobjekte in einer gemeinsamen Anwendung. Flexibel anpassbar, nachvollziehbar und auf Deiner Infrastruktur.",
    start: "Jetzt starten",
    github: "Auf GitHub ansehen",
    eyebrow: "Open Source · Selbst hostbar · API & MCP",
    story: "Zusammenhänge sehen. Den Kontext behalten.",
    storyText:
      "Vom Kunden zum Projekt, vom Vorgang zu seinen Aufgaben. Geräte und Servicepläne gehören ebenfalls dazu. Öffne den Datensatz und finde die Informationen, die zusammengehören.",
    steps: [
      [
        "Mit einem Kontakt anfangen",
        "Organisationen und die Menschen, mit denen Du arbeitest, an einem Ort erfassen.",
      ],
      [
        "Die Arbeit zusammenbringen",
        "Projekte, Vorgänge und Aufgaben über eine klare Hauptzuordnung verbinden.",
      ],
      [
        "Eigenen Kontext ergänzen",
        "Geräte, Verträge oder die Datenobjekte verknüpfen, die für Deine Arbeit wichtig sind.",
      ],
    ],
    features: "Fertig anfangen. Passend erweitern.",
    featuresText:
      "Nutze die mitgelieferten Module und ergänze die Strukturen, die Deine Arbeit braucht.",
    areas: [
      [
        "Kontakte & Beziehungen",
        "Organisationen, Ansprechpartner, Einzelkontakte und Verteiler. Strukturierte Kontaktdaten mit ihren Zusammenhängen.",
      ],
      [
        "Projekte & Aufgaben",
        "Projekte, Vorgänge und Aufgaben mit Zeitplanung, Fortschritt und gemeinsamem Kontext. Arbeit und zuständige Menschen im Blick behalten.",
      ],
      [
        "Deine eigenen Datenobjekte",
        "Geräte, Servicepläne oder etwas völlig anderes abbilden. Felder, Verknüpfungen und Formulare ohne Änderungen am Anwendungscode definieren.",
      ],
    ],
    control: "Kontrolle behalten. Änderungen verstehen.",
    controlText:
      "Trenne Deine Arbeit in Arbeitsbereiche. Gib Benutzern und Gruppen passende Rechte, verfolge Änderungen im Journal und hole Datensätze aus dem Papierkorb zurück.",
    controlItems: [
      [
        "Zugriff nach Deinen Regeln",
        "Objekt- und Feldrechte, Besitzrechte und Fremdzugriff greifen ineinander. Agenten haben dieselben effektiven Rechte wie ihr Benutzer.",
      ],
      [
        "Eine nachvollziehbare Historie",
        "Das Journal erfasst einzelne Feld- und Verknüpfungsänderungen. Du siehst, was wann von wem geändert wurde.",
      ],
      [
        "Platz für verschiedene Arbeitswelten",
        "Eigene Definitionen, Datensätze und Teams in getrennten Arbeitsbereichen – jeweils mit eigener Darstellung.",
      ],
    ],
    automation:
      "In der Oberfläche arbeiten. Oder Deine Werkzeuge arbeiten lassen.",
    automationText:
      "Weboberfläche, API und MCP verwenden dieselben Geschäftsregeln und Rechte. Verbinde Automatisierungen oder einen kompatiblen KI-Client über einen persönlichen, widerrufbaren Zugang.",
    prompt:
      "Lege ein Projekt an, verknüpfe den Kunden und erstelle die ersten drei Aufgaben.",
    api: "API & MCP entdecken",
    own: "Open Source. Auf Deiner Infrastruktur.",
    ownText:
      "Der vollständige Funktionsumfang von V1 ist Community, unter AGPL-3.0-only. Installiere die fertigen Container mit Docker Compose und behalte die Kontrolle über Deine Daten.",
    ownSteps: [
      "Der Self-Hosting-Anleitung folgen.",
      "Installation konfigurieren und den ersten Administrator anlegen.",
      "Module aktivieren und Deinen Arbeitsbereich gestalten.",
    ],
    release: "Releases & Downloads",
    faq: "Ein paar hilfreiche Antworten.",
    questions: [
      [
        "Für wen ist xObject gedacht?",
        "Für Menschen und Teams, die Kontakte, Projekte und eigene strukturierte Informationen zusammenbringen möchten. Mit den mitgelieferten Modulen starten und nach Bedarf erweitern.",
      ],
      [
        "Kann ich eigene Objekte und Formulare anlegen?",
        "Ja. Gestalter und Administratoren können Datenobjekte, Felder, Auswahllisten, Verknüpfungen und Formulare konfigurieren. Die gelieferten Kontaktformulare haben einen festen Kern und unterstützen zusätzliche eigene Felder.",
      ],
      [
        "Wo läuft die Anwendung?",
        "Im Browser, mit Deiner eigenen Installation im Hintergrund. Der unterstützte Self-Hosting-Weg verwendet Docker Compose und fertige Linux-Container-Images.",
      ],
      [
        "Bekommt die KI Administratorrechte?",
        "Ein Agent arbeitet mit den effektiven Rechten seines Benutzers. Persönliche Zugänge lassen sich einschränken, befristen und widerrufen. Die MCP-Unterstützung hängt von den Möglichkeiten Deines Clients ab.",
      ],
      [
        "Was kommt später?",
        "Die öffentliche Roadmap beschreibt spätere Erweiterungen. Datei-Uploads, standardbasierte Synchronisation, SSO und native Clients sind für später vorgesehen.",
      ],
    ],
    screenshots:
      "Echte Anwendungsansichten aus dem fiktiven ITextreme-Demoarbeitsbereich.",
    enDocs: "Die Dokumentation ist derzeit auf Englisch verfügbar.",
    captions: {
      project:
        "Ein Projekt mit seinen Vorgängen und Aufgaben im gemeinsamen Baum.",
      contact: "Kontaktdaten, Adressen und berufliche Angaben im Zusammenhang.",
      list: "Datensätze im Arbeitsbereich suchen, sortieren und durchblättern.",
      custom:
        "Ein eigener Serviceplan: Deine Felder, Verknüpfungen und Formulare.",
      journal:
        "Einzelne Änderungen bleiben im Datensatzjournal nachvollziehbar.",
    },
    zoom: "Screenshot in voller Größe öffnen",
  },
} as const;
export const ui = {
  en: {
    overview: "Overview",
    features: "Features",
    control: "Control",
    start: "Get started",
    appearance: "Appearance",
    light: "Light",
    dark: "Dark",
    system: "System",
    menu: "Open navigation",
    navigation: "Main navigation",
    skip: "Skip to content",
    top: "Back to top",
    project: "Project",
    legal: "Legal",
    source: "Source code",
    docs: "Documentation",
    requirements: "Requirements",
    privacy: "Privacy",
    imprint: "Legal notice",
    description:
      "Connect contacts, projects and your own data objects — for a self-determined digital workspace.",
    social: "ITextreme on social media",
    newTab: "opens in a new tab",
    credit: "Created by",
    built: "Built with Astro, Tailwind CSS and shadcn/ui.",
    rights: "All rights reserved.",
  },
  de: {
    overview: "Überblick",
    features: "Funktionen",
    control: "Kontrolle",
    start: "Loslegen",
    appearance: "Darstellung",
    light: "Hell",
    dark: "Dunkel",
    system: "System",
    menu: "Navigation öffnen",
    navigation: "Hauptnavigation",
    skip: "Zum Inhalt",
    top: "Nach oben",
    project: "Projekt",
    legal: "Rechtliches",
    source: "Quellcode",
    docs: "Dokumentation",
    requirements: "Anforderungen",
    privacy: "Datenschutz",
    imprint: "Impressum",
    description:
      "Kontakte, Projekte und eigene Datenobjekte verbinden – für eine selbstbestimmte digitale Arbeitswelt.",
    social: "ITextreme in sozialen Netzwerken",
    newTab: "öffnet in neuem Tab",
    credit: "Entwickelt von",
    built: "Gebaut mit Astro, Tailwind CSS und shadcn/ui.",
    rights: "Alle Rechte vorbehalten.",
  },
} as const;
