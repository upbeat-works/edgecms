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
  type Translation 
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
  
  const [languages, sections, translations] = await Promise.all([
    getLanguages(),
    getSections(),
    getTranslations(sectionFilter || undefined),
  ]);

  // Group translations by key
  const translationsByKey = new Map<string, Map<string, Translation>>();
  for (const translation of translations) {
    if (!translationsByKey.has(translation.key)) {
      translationsByKey.set(translation.key, new Map());
    }
    translationsByKey.get(translation.key)!.set(translation.language, translation);
  }

  return { languages, sections, translations: translationsByKey, sectionFilter };
}

export async function action({ request }: Route.ActionArgs) {
  await requireAuth(request, env);
  
  const formData = await request.formData();
  const intent = formData.get("intent");

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
      for (const language of languages) {
        await upsertTranslation(key, language.locale, "", section || undefined);
      }
      return { success: true };
    }

    case "update-section": {
      const key = formData.get("key") as string;
      const newSection = formData.get("section") as string | null;
      
      // Update section for all translations of this key
      const keyTranslations = await getTranslations();
      const translationsForKey = keyTranslations.filter(t => t.key === key);
      
      for (const translation of translationsForKey) {
        await upsertTranslation(
          translation.key, 
          translation.language, 
          translation.value, 
          newSection || undefined
        );
      }
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

  // Header row
  if (rowIndex === 0) {
    if (columnIndex === 0) {
      return (
        <div style={style} className="p-4 font-medium border-r border-b bg-muted/50 flex items-center">
          Key
        </div>
      );
    } else if (columnIndex === 1) {
      return (
        <div style={style} className="p-4 font-medium border-r border-b bg-muted/50 flex items-center">
          Section
        </div>
      );
    } else {
      const langIndex = columnIndex - 2;
      const lang = sortedLanguages[langIndex];
      return (
        <div style={style} className="p-4 font-medium border-r border-b bg-muted/50 flex items-center">
          {lang.locale}
          {lang.default && " (default)"}
        </div>
      );
    }
  }
  
  // Data rows
  const dataIndex = rowIndex - 1;
  const key = translationKeys[dataIndex];
  const keyTranslations = translations.get(key)!;
  const firstTranslation = Array.from(keyTranslations.values())[0];
  const section = firstTranslation?.section;

  if (columnIndex === 0) {
    // Key column
    return (
      <div style={style} className="p-4 font-mono text-sm border-r border-b bg-background flex items-center">
        {key}
      </div>
    );
  } else if (columnIndex === 1) {
    // Section column
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
    const langIndex = columnIndex - 2;
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
  const { languages, sections, translations, sectionFilter } = useLoaderData<typeof loader>();
  const [showAddLanguage, setShowAddLanguage] = useState(false);
  const [showAddTranslation, setShowAddTranslation] = useState(false);
  const addLanguageFetcher = useFetcher();
  const addTranslationFetcher = useFetcher();
  const defaultLanguageFetcher = useFetcher();
  const wrapperRef = useRef<HTMLDivElement>(null);
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

  return (
    <main className="flex flex-col h-[calc(100vh-70px)]">
      <div className="flex flex-col flex-1 container mx-auto py-8">
        <div className="flex flex-col">
        <h1 className="text-3xl font-bold mb-8">Translations Management</h1>
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
        <div ref={wrapperRef} className="flex-1" style={{ overscrollBehavior: 'contain' }}>
          {wrapperBounds.height > 0 && (
            <FixedSizeGrid
              height={wrapperBounds.height}
              columnCount={languages.length + 2} // +2 for key and section
              rowCount={translationKeys.length + 1} // +1 for header
              columnWidth={200}
              rowHeight={60}
              width={wrapperBounds.width}
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
    </main>
  );
} 