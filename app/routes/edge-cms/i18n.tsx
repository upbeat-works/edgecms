import { useLoaderData, useFetcher, Form, Link } from "react-router";
import { useState, useEffect, useRef, useCallback } from "react";
import { FixedSizeGrid, type GridChildComponentProps } from 'react-window';
import { requireAuth } from "~/lib/auth.middleware";
import { 
  getLanguages, 
  getSections, 
  getTranslations, 
  upsertTranslation,
  createLanguage,
  setDefaultLanguage,
  type Language,
  type Section,
  type Translation, 
  getLatestVersion,
  createVersion
} from "~/lib/db.server";
import { Input } from "~/components/ui/input";
import { Button } from "~/components/ui/button";
import { Label } from "~/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "~/components/ui/dialog";
import { env } from "cloudflare:workers";
import type { Route } from "./+types/i18n";

export async function loader({ request }: Route.LoaderArgs) {
  await requireAuth(request, env);
  
  const url = new URL(request.url);
  const sectionFilter = url.searchParams.get("section");
  
  const [languages, sections, translations, activeVersion] = await Promise.all([
    getLanguages(),
    getSections(),
    getTranslations(sectionFilter || undefined),
    getLatestVersion('live'),
  ]);

  // Group translations by key
  const translationsByKey = new Map<string, Map<string, Translation>>();
  for (const translation of translations) {
    if (!translationsByKey.has(translation.key)) {
      translationsByKey.set(translation.key, new Map());
    }
    translationsByKey.get(translation.key)!.set(translation.language, translation);
  }

  return { languages, sections, translations: translationsByKey, sectionFilter, activeVersion };
}

export async function action({ request }: Route.ActionArgs) {
  const auth = await requireAuth(request, env);
  
  const formData = await request.formData();
  const intent = formData.get("intent");

  // Before any change we need to create a new draft version if none exists
  const [draftVersion, liveVersion] = await Promise.all([
    getLatestVersion('draft'),
    getLatestVersion('live')
  ]);

  if (draftVersion == null) {
    const description = liveVersion ? `v${liveVersion.id + 1}` : new Date().toLocaleDateString();
    await createVersion(description, auth.user.id);
  }

  switch (intent) {
    case "update-translation": {
      const key = formData.get("key") as string;
      const language = formData.get("language") as string;
      const value = formData.get("value") as string;
      const section = formData.get("section") as string | null;

      await upsertTranslation(key, language, value, section || undefined);
      return { success: true };
    }

    case "add-language": {
      const locale = formData.get("locale") as string;
      await createLanguage(locale);
      return { success: true };
    }

    case "set-default-language": {
      const locale = formData.get("locale") as string;
      await setDefaultLanguage(locale);
      return { success: true };
    }

    case "add-translation": {
      const key = formData.get("key") as string;
      const section = formData.get("section") as string | null;
      
      // Add empty translations for all languages
      const languages = await getLanguages();
      await Promise.all(languages.map(async (language) => {
        await upsertTranslation(key, language.locale, "", section || undefined);
      }));
      return { success: true };
    }

    case "update-section": {
      const key = formData.get("key") as string;
      const newSection = formData.get("section") as string | null;
      
      // Update section for all translations of this key
      const keyTranslations = await getTranslations();
      const translationsForKey = keyTranslations.filter(t => t.key === key);
      
      await Promise.all(translationsForKey.map(async (translation) => {
        upsertTranslation(
          translation.key, 
          translation.language, 
          translation.value, 
          newSection || undefined
        )
      }));
      return { success: true };
    }

    default:
      return { error: "Invalid action" };
  }
}

function SectionCell({
  translationKey,
  currentSection,
  sections,
}: {
  translationKey: string;
  currentSection?: string | null;
  sections: Section[];
}) {
  const fetcher = useFetcher();

  const handleSectionChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newSection = e.target.value || null;
    if (newSection !== currentSection) {
      fetcher.submit(
        {
          intent: "update-section",
          key: translationKey,
          section: newSection || "",
        },
        { method: "post" }
      );
    }
  };

  return (
    <select
      value={currentSection || ""}
      onChange={handleSectionChange}
      className="w-full border-0 bg-transparent text-sm focus:ring-1 focus:ring-ring rounded-md p-1 cursor-pointer hover:bg-muted/50"
      disabled={fetcher.state === "submitting"}
    >
      <option value="">-</option>
      {sections.map((section) => (
        <option key={section.name} value={section.name}>
          {section.name}
        </option>
      ))}
    </select>
  );
}

function TranslationCell({ 
  translationKey, 
  language, 
  translation,
  section,
}: { 
  translationKey: string; 
  language: string; 
  translation?: Translation;
  section?: string | null;
}) {
  const fetcher = useFetcher();
  const [value, setValue] = useState(translation?.value || "");
  const [isDirty, setIsDirty] = useState(false);

  useEffect(() => {
    setValue(translation?.value || "");
    setIsDirty(false);
  }, [translation?.value]);

  const handleBlur = (e: React.FocusEvent<HTMLTextAreaElement>) => {
    if (isDirty && value !== translation?.value) {
      fetcher.submit(
        {
          intent: "update-translation",
          key: translationKey,
          language,
          value,
          section: section || "",
        },
        { method: "post" }
      );
    }
    const textarea = e.target;
    textarea.style.height = 'auto';
    textarea.rows = 1;
  };

  const handleFocus = (e: React.FocusEvent<HTMLTextAreaElement>) => {
    // Auto-resize on focus
    const textarea = e.target;
    textarea.style.height = 'auto';
    textarea.style.height = Math.max(textarea.scrollHeight, 40) + 'px';
  };

  const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const textarea = e.target;
    setValue(textarea.value);
    setIsDirty(true);
    
    // Auto-resize as user types
    textarea.style.height = 'auto';
    textarea.style.height = Math.max(textarea.scrollHeight, 40) + 'px';
  };

  return (
    <textarea
      value={value}
      onChange={handleInput}
      onFocus={handleFocus}
      onBlur={handleBlur}
      rows={1}
      className="w-full border-0 p-1 resize-none overflow-hidden focus:ring-1 focus:ring-ring rounded-md bg-transparent text-sm min-h-[40px] focus:bg-background relative focus:z-50"
      placeholder="Enter translation..."
      style={{ height: '40px' }}
    />
  );
}

function VirtualizedCell({ columnIndex, rowIndex, style, data }: GridChildComponentProps<{
  translationKeys: string[];
  translations: Map<string, Map<string, Translation>>;
  sortedLanguages: Language[];
  sections: Section[];
}>) {
  const { translationKeys, translations, sortedLanguages, sections } = data;
  
  // Data rows only (header is rendered separately)
  const dataIndex = rowIndex;
  const key = translationKeys[dataIndex];
  const keyTranslations = translations.get(key)!;
  const firstTranslation = Array.from(keyTranslations.values())[0];
  const section = firstTranslation?.section;

  // Section column (now at index 0)
  if (columnIndex === 0) {
    return (
      <div style={style} className="p-2 border-r border-b flex items-center">
        <SectionCell
          translationKey={key}
          currentSection={section}
          sections={sections}
        />
      </div>
    );
  } else {
    // Language columns
    const langIndex = columnIndex - 1;
    const lang = sortedLanguages[langIndex];
    return (
      <div style={style} className="p-2 border-r border-b flex items-center">
        <TranslationCell
          translationKey={key}
          language={lang.locale}
          translation={keyTranslations.get(lang.locale)}
          section={section}
        />
      </div>
    );
  }
}

export default function I18n() {
  const { languages, sections, translations, sectionFilter, activeVersion } = useLoaderData<typeof loader>();
  const [showAddLanguage, setShowAddLanguage] = useState(false);
  const [showAddTranslation, setShowAddTranslation] = useState(false);
  const addLanguageFetcher = useFetcher();
  const addTranslationFetcher = useFetcher();
  const defaultLanguageFetcher = useFetcher();
  const wrapperRef = useRef<HTMLDivElement>(null);
  const headerRef = useRef<HTMLDivElement>(null);
  const gridRef = useRef<any>(null);
  const keyColumnRef = useRef<HTMLDivElement>(null);
  const [wrapperBounds, setWrapperBounds] = useState({ width: 0, height: 0 });
  
  // Hide the form after successful submission
  useEffect(() => {
    if (addLanguageFetcher.data?.success) {
      setShowAddLanguage(false);
    }
  }, [addLanguageFetcher.data]);

  useEffect(() => {
    if (addTranslationFetcher.data?.success) {
      setShowAddTranslation(false);
    }
  }, [addTranslationFetcher.data]);

  const translationKeys = Array.from(translations.keys()).sort();
  const currentDefaultLanguage = languages.find(lang => lang.default)?.locale || "";

  // Sort languages to show default first, then others alphabetically
  const sortedLanguages = [...languages].sort((a, b) => {
    if (a.default && !b.default) return -1;
    if (!a.default && b.default) return 1;
    return a.locale.localeCompare(b.locale);
  });

  useEffect(() => {
    if (wrapperRef.current) {
      const { height, width } = wrapperRef.current.getBoundingClientRect();
      setWrapperBounds({ width, height });
    }
  }, [wrapperRef.current]);

  // Sync scroll between header, key column and grid
  const handleGridScroll = ({ scrollLeft, scrollTop }: { scrollLeft: number; scrollTop: number }) => {
    if (headerRef.current) {
      headerRef.current.scrollLeft = scrollLeft;
    }
    if (keyColumnRef.current) {
      keyColumnRef.current.scrollTop = scrollTop;
    }
  };

  return (
    <main className="flex flex-col h-[calc(100vh-70px)]">
      <div className="flex flex-col flex-1 container mx-auto py-8">
        <div className="flex flex-col">
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-3xl font-bold">Translations Management</h1>
          <div className="flex items-center gap-4">
            {activeVersion && (
              <div className="text-sm text-muted-foreground">
                Active Version:
                <span className="ml-2 text-xs">
                  {activeVersion.description ?? `v${activeVersion.id}`}
                </span>
              </div>
            )}
            <Button asChild variant="outline" size="sm">
              <Link to="/edge-cms/i18n/versions">
                Manage Versions
              </Link>
            </Button>
          </div>
        </div>
        <div className="mb-6 flex gap-4 flex-wrap">
        <Form method="get" className="flex gap-2">
          <select
            name="section"
            defaultValue={sectionFilter || ""}
            className="rounded-md border border-input bg-background px-3 py-2 text-sm"
            onChange={(e) => e.target.form?.submit()}
          >
            <option value="">All sections</option>
            {sections.map((section) => (
              <option key={section.name} value={section.name}>
                {section.name}
              </option>
            ))}
          </select>
        </Form>

        <defaultLanguageFetcher.Form method="post" className="flex gap-2 items-center">
          <input type="hidden" name="intent" value="set-default-language" />
          <Label htmlFor="defaultLanguage" className="text-sm font-medium whitespace-nowrap">
            Default Language:
          </Label>
          <select
            id="defaultLanguage"
            name="locale"
            value={currentDefaultLanguage}
            onChange={(e) => e.target.form?.submit()}
            className="rounded-md border border-input bg-background px-3 py-2 text-sm"
          >
            <option value="">No default</option>
            {languages.map((language) => (
              <option key={language.locale} value={language.locale}>
                {language.locale}
              </option>
            ))}
          </select>
        </defaultLanguageFetcher.Form>

        <div className="flex gap-2 ml-auto">
          <Button onClick={() => setShowAddLanguage(true)} variant="outline">
            Add Language
          </Button>
          <Button asChild variant="outline">
            <Link to="/edge-cms/sections">
              Manage Sections
            </Link>
          </Button>
          <Button onClick={() => setShowAddTranslation(true)}>
            Add Translation
          </Button>
        </div>
      </div>
        </div>

      {/* Add Language Dialog */}
      <Dialog open={showAddLanguage} onOpenChange={setShowAddLanguage}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add New Language</DialogTitle>
          </DialogHeader>
          <addLanguageFetcher.Form method="post">
            <input type="hidden" name="intent" value="add-language" />
            <div className="grid gap-4 py-4">
              <div>
                <Label htmlFor="locale">Language Code</Label>
                <Input
                  id="locale"
                  name="locale"
                  placeholder="e.g., en, es, fr"
                  required
                />
              </div>
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setShowAddLanguage(false)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={addLanguageFetcher.state === "submitting"}>
                {addLanguageFetcher.state === "submitting" ? "Adding..." : "Add Language"}
              </Button>
            </DialogFooter>
          </addLanguageFetcher.Form>
        </DialogContent>
      </Dialog>

      {/* Add Translation Dialog */}
      <Dialog open={showAddTranslation} onOpenChange={setShowAddTranslation}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add New Translation</DialogTitle>
          </DialogHeader>
          <addTranslationFetcher.Form method="post">
            <input type="hidden" name="intent" value="add-translation" />
            <div className="grid gap-4 py-4">
              <div>
                <Label htmlFor="key">Translation Key</Label>
                <Input
                  id="key"
                  name="key"
                  placeholder="e.g., welcome.title"
                  required
                />
              </div>
              <div>
                <Label htmlFor="section">Section (optional)</Label>
                <select
                  id="section"
                  name="section"
                  className="rounded-md border border-input bg-background px-3 py-2 text-sm h-10"
                >
                  <option value="">-</option>
                  {sections.map((section) => (
                    <option key={section.name} value={section.name}>
                      {section.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setShowAddTranslation(false)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={addTranslationFetcher.state === "submitting"}>
                {addTranslationFetcher.state === "submitting" ? "Adding..." : "Add Translation"}
              </Button>
            </DialogFooter>
          </addTranslationFetcher.Form>
        </DialogContent>
      </Dialog>

      <div className="border rounded-lg overflow-hidden flex flex-col flex-1">
        {/* Sticky header */}
        <div className="flex sticky top-0 z-20 bg-background border-b">
          {/* Top-left corner cell */}
          <div className="min-w-[200px] w-[200px] p-4 font-medium border-r bg-muted/50 flex-shrink-0 z-30">
            Key
          </div>
          
          {/* Scrollable header */}
          <div 
            ref={headerRef} 
            className="flex-1 overflow-x-auto overflow-y-hidden [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]"
            onScroll={(e) => {
              // If header is scrolled manually, sync back to grid
              if (gridRef.current) {
                gridRef.current.scrollTo({ scrollLeft: e.currentTarget.scrollLeft });
              }
            }}
          >
            <div className="flex" style={{ width: `${200 + (sortedLanguages.length * 200)}px` }}>
              <div className="min-w-[200px] w-[200px] p-4 font-medium border-r bg-muted/50 flex-shrink-0">
                Section
              </div>
              {sortedLanguages.map((lang) => (
                <div key={lang.locale} className="min-w-[200px] w-[200px] p-4 font-medium border-r bg-muted/50 flex-shrink-0">
                  {lang.locale}
                  {lang.default && " (default)"}
                </div>
              ))}
            </div>
          </div>
        </div>
        
        {/* Main content area */}
        <div ref={wrapperRef} className="flex flex-1 overflow-hidden" style={{ overscrollBehavior: 'contain' }}>
          {/* Sticky key column */}
          <div className="flex-shrink-0 bg-background border-r w-[200px]">
            <div 
              ref={keyColumnRef}
              className="overflow-y-auto overflow-x-hidden [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]"
              style={{ height: wrapperBounds.height }}
              onScroll={(e) => {
                // If key column is scrolled manually, sync back to grid
                if (gridRef.current) {
                  gridRef.current.scrollTo({ scrollTop: e.currentTarget.scrollTop });
                }
              }}
            >
              {translationKeys.map((key) => (
                <div key={key} className="w-[200px] p-4 font-mono text-sm border-b h-[60px] flex items-center">
                  {key}
                </div>
              ))}
            </div>
          </div>
          
          {/* Grid content (without key column) */}
          <div className="flex-1 overflow-hidden">
            {wrapperBounds.height > 0 && (
              <FixedSizeGrid
                ref={gridRef}
                height={wrapperBounds.height}
                columnCount={languages.length + 1} // +1 for section only
                rowCount={translationKeys.length} // No header row
                columnWidth={200}
                rowHeight={60}
                width={wrapperBounds.width - 200} // Subtract key column width
                onScroll={handleGridScroll}
                itemData={{
                  translationKeys,
                  translations,
                  sortedLanguages,
                  sections,
                }}
              >
                {VirtualizedCell}
              </FixedSizeGrid> 
            )}
          </div>
        </div>
      </div>
    </div>
    </main>
  );
} 