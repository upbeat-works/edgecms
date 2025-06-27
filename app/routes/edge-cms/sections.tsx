import { useLoaderData, Form, useFetcher } from "react-router";
import { useState, useEffect } from "react";
import { requireAuth } from "~/lib/auth.middleware";
import { 
  getSectionsWithCounts, 
  createSection,
  updateSection,
  deleteSection,
  type SectionWithCounts
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

export async function loader({ request }: { request: Request }) {
  await requireAuth(request, env);
  
  const sections = await getSectionsWithCounts();
  return { sections };
}

export async function action({ request }: { request: Request }) {
  await requireAuth(request, env);
  
  const formData = await request.formData();
  const intent = formData.get("intent");

  switch (intent) {
    case "add-section": {
      const name = formData.get("name") as string;
      await createSection(name);
      return { success: true };
    }

    case "update-section": {
      const oldName = formData.get("oldName") as string;
      const newName = formData.get("newName") as string;
      await updateSection(oldName, newName);
      return { success: true };
    }

    case "delete-section": {
      const name = formData.get("name") as string;
      await deleteSection(name);
      return { success: true };
    }

    default:
      return { error: "Invalid action" };
  }
}

function EditableSectionName({ 
  sectionName
}: { 
  sectionName: string;
}) {
  const fetcher = useFetcher();
  const [value, setValue] = useState(sectionName);
  const [isDirty, setIsDirty] = useState(false);

  useEffect(() => {
    setValue(sectionName);
    setIsDirty(false);
  }, [sectionName]);

  const handleBlur = () => {
    if (isDirty && value !== sectionName && value.trim() !== "") {
      fetcher.submit(
        {
          intent: "update-section",
          oldName: sectionName,
          newName: value.trim(),
        },
        { method: "post" }
      );
    } else if (value.trim() === "") {
      // Reset to original value if empty
      setValue(sectionName);
      setIsDirty(false);
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
      className="border-0 p-1 h-auto focus:ring-1 font-medium"
      placeholder="Section name..."
    />
  );
}

export default function Sections() {
  const { sections } = useLoaderData<typeof loader>();
  const [showAddSection, setShowAddSection] = useState(false);

  return (
    <main>
      <div className="container mx-auto py-8">
        <h1 className="text-3xl font-bold mb-8">Sections Management</h1>

        <div className="mb-6 flex justify-end">
          <Button onClick={() => setShowAddSection(true)}>
            Add Section
          </Button>
        </div>

        {/* Add Section Form */}
        {showAddSection && (
          <Form method="post" className="mb-6 p-4 border rounded-lg">
            <input type="hidden" name="intent" value="add-section" />
            <div className="flex gap-4 items-end">
              <div>
                <Label htmlFor="name">Section Name</Label>
                <Input
                  id="name"
                  name="name"
                  placeholder="e.g., homepage, dashboard"
                  required
                />
              </div>
              <Button type="submit">Add</Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => setShowAddSection(false)}
              >
                Cancel
              </Button>
            </div>
          </Form>
        )}

        {/* Sections Table */}
        <div className="border rounded-lg overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Section Name</TableHead>
                <TableHead className="text-center">Media Count</TableHead>
                <TableHead className="text-center">Translations Count</TableHead>
                <TableHead className="w-[100px]">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sections.map((section) => (
                <TableRow key={section.name}>
                  <TableCell className="p-2">
                    <EditableSectionName sectionName={section.name} />
                  </TableCell>
                  <TableCell className="text-center">
                    <span className="px-2 py-1 bg-blue-100 text-blue-800 rounded-full text-sm">
                      {section.mediaCount}
                    </span>
                  </TableCell>
                  <TableCell className="text-center">
                    <span className="px-2 py-1 bg-green-100 text-green-800 rounded-full text-sm">
                      {section.translationCount}
                    </span>
                  </TableCell>
                  <TableCell>
                    <Form method="post" className="inline">
                      <input type="hidden" name="intent" value="delete-section" />
                      <input type="hidden" name="name" value={section.name} />
                      <Button
                        type="submit"
                        variant="destructive"
                        size="sm"
                        onClick={(e) => {
                          if (!confirm(`Are you sure you want to delete the section "${section.name}"? This will remove the section from all associated media and translations.`)) {
                            e.preventDefault();
                          }
                        }}
                      >
                        Delete
                      </Button>
                    </Form>
                  </TableCell>
                </TableRow>
              ))}
              {sections.length === 0 && (
                <TableRow>
                  <TableCell colSpan={4} className="text-center text-muted-foreground py-8">
                    No sections created yet. Click "Add Section" to create your first section.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </div>
    </main>
  );
} 