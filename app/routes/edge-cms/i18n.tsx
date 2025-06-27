import { useLoaderData, useFetcher, Form, Link } from "react-router";
import { useState, useEffect } from "react";
import { requireAuth } from "~/lib/auth.middleware";
import { 
  getLanguages, 
  getSections, 
  getTranslations, 
  upsertTranslation,
  createLanguage,
  type Language,
  type Section,
  type Translation 
} from "~/lib/db.server";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "~/components/ui/table";
import { Input } from "~/components/ui/input";
import { Button } from "~/components/ui/button";
import { Label } from "~/components/ui/label";
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
      const isDefault = formData.get("default") === "on";
      await createLanguage(locale, isDefault);
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

    default:
      return { error: "Invalid action" };
  }
}

function TranslationCell({ 
  translationKey, 
  language, 
  translation,
  section 
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

  const handleBlur = () => {
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
  };

  return (
    <Input
      value={value}
      onChange={(e) => {
        setValue(e.target.value);
        setIsDirty(true);
      }}
      onBlur={handleBlur}
      className="border-0 p-1 h-auto focus:ring-1"
      placeholder="Enter translation..."
    />
  );
}

export default function I18n() {
  const { languages, sections, translations, sectionFilter } = useLoaderData<typeof loader>();
  const [showAddLanguage, setShowAddLanguage] = useState(false);
  const [showAddTranslation, setShowAddTranslation] = useState(false);

  const translationKeys = Array.from(translations.keys()).sort();

  return (
    <main>
      <div className="container mx-auto py-8">
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

      {/* Add Language Form */}
      {showAddLanguage && (
        <Form method="post" className="mb-6 p-4 border rounded-lg">
          <input type="hidden" name="intent" value="add-language" />
          <div className="flex gap-4 items-end">
            <div>
              <Label htmlFor="locale">Language Code</Label>
              <Input
                id="locale"
                name="locale"
                placeholder="e.g., en, es, fr"
                required
              />
            </div>
            <div className="flex items-center gap-2">
              <input
                id="default"
                name="default"
                type="checkbox"
                className="rounded border-gray-300"
              />
              <Label htmlFor="default">Default language</Label>
            </div>
            <Button type="submit">Add</Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => setShowAddLanguage(false)}
            >
              Cancel
            </Button>
          </div>
        </Form>
      )}



      {/* Add Translation Form */}
      {showAddTranslation && (
        <Form method="post" className="mb-6 p-4 border rounded-lg">
          <input type="hidden" name="intent" value="add-translation" />
          <div className="flex gap-4 items-end">
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
                <option value="">No section</option>
                {sections.map((section) => (
                  <option key={section.name} value={section.name}>
                    {section.name}
                  </option>
                ))}
              </select>
            </div>
            <Button type="submit">Add</Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => setShowAddTranslation(false)}
            >
              Cancel
            </Button>
          </div>
        </Form>
      )}

      {/* Translations Table */}
      <div className="border rounded-lg overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[200px]">Key</TableHead>
              <TableHead className="w-[150px]">Section</TableHead>
              {languages.map((lang) => (
                <TableHead key={lang.locale}>
                  {lang.locale}
                  {lang.default && " (default)"}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {translationKeys.map((key) => {
              const keyTranslations = translations.get(key)!;
              const firstTranslation = Array.from(keyTranslations.values())[0];
              const section = firstTranslation?.section;

              return (
                <TableRow key={key}>
                  <TableCell className="font-mono text-sm">{key}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {section || "-"}
                  </TableCell>
                  {languages.map((lang) => (
                    <TableCell key={lang.locale} className="p-2">
                      <TranslationCell
                        translationKey={key}
                        language={lang.locale}
                        translation={keyTranslations.get(lang.locale)}
                        section={section}
                      />
                    </TableCell>
                  ))}
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
    </main>
  );
} 