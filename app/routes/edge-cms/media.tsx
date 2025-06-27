import { useLoaderData, Form, useFetcher } from "react-router";
import { useState } from "react";
import { requireAuth } from "~/lib/auth.middleware";
import { getMedia, getSections, updateMediaSection, type Media, type Section } from "~/lib/db.server";
import { uploadMedia } from "~/lib/media.server";
import { Button } from "~/components/ui/button";
import { Label } from "~/components/ui/label";
import { Input } from "~/components/ui/input";
import { env } from "cloudflare:workers";
import type { Route } from "./+types/media";

export async function loader({ request }: Route.LoaderArgs) {
  await requireAuth(request, env);
  
  const [media, sections] = await Promise.all([
    getMedia(env),
    getSections(env),
  ]);

  // Group media by section
  const mediaBySection = new Map<string | null, Media[]>();
  mediaBySection.set(null, []); // No section group
  
  for (const section of sections) {
    mediaBySection.set(section.name, []);
  }
  
  for (const item of media) {
    const section = item.section;
    if (!mediaBySection.has(section)) {
      mediaBySection.set(section, []);
    }
    mediaBySection.get(section)!.push(item);
  }

  return { mediaBySection, sections };
}

export async function action({ request }: Route.ActionArgs) {
  await requireAuth(request, env);
  
  const formData = await request.formData();
  const intent = formData.get("intent");

  switch (intent) {
    case "upload": {
      const files = formData.getAll("files") as File[];
      const section = formData.get("section") as string | null;
      
      const uploadPromises = files.map(file => 
        uploadMedia(env, file, section || undefined)
      );
      
      await Promise.all(uploadPromises);
      return { success: true };
    }

    case "update-section": {
      const mediaId = parseInt(formData.get("mediaId") as string);
      const section = formData.get("section") as string | null;
      
      await updateMediaSection(env, mediaId, section === "" ? null : section);
      return { success: true };
    }

    default:
      return { error: "Invalid action" };
  }
}

function MediaItem({ media, sections }: { media: Media; sections: Section[] }) {
  const fetcher = useFetcher();
  const [selectedSection, setSelectedSection] = useState(media.section || "");
  
  const handleSectionChange = (newSection: string) => {
    setSelectedSection(newSection);
    fetcher.submit(
      {
        intent: "update-section",
        mediaId: media.id.toString(),
        section: newSection,
      },
      { method: "post" }
    );
  };

  return (
    <div className="border rounded-lg p-4 space-y-2">
      <div className="aspect-video bg-gray-100 rounded overflow-hidden flex items-center justify-center">
        {media.mimeType.startsWith("image/") ? (
          <img 
            src={`/edge-cms/public/media/${media.filename}`}
            alt={media.filename}
            className="max-w-full max-h-full object-contain"
            loading="lazy"
          />
        ) : media.mimeType.startsWith("video/") ? (
          <video 
            src={`/edge-cms/public/media/${media.filename}`}
            controls
            className="max-w-full max-h-full"
          />
        ) : (
          <object
            data={`/edge-cms/public/media/${media.filename}`}
            type={media.mimeType}
            className="w-full h-full"
          >
            <div className="text-center text-gray-500 p-4">
              <p className="text-sm">{media.mimeType}</p>
              <p className="font-mono text-xs mt-1">{media.filename}</p>
            </div>
          </object>
        )}
      </div>
      
      <div className="space-y-1">
        <p className="text-sm font-medium truncate" title={media.filename}>
          {media.filename}
        </p>
        <p className="text-xs text-muted-foreground">
          {(media.sizeBytes / 1024).toFixed(1)} KB • {media.mimeType}
        </p>
        
        <select
          value={selectedSection}
          onChange={(e) => handleSectionChange(e.target.value)}
          className="w-full mt-2 rounded-md border border-input bg-background px-3 py-1 text-sm"
        >
          <option value="">No section</option>
          {sections.map((section) => (
            <option key={section.name} value={section.name}>
              {section.name}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}

export default function MediaManagement() {
  const { mediaBySection, sections } = useLoaderData<typeof loader>();
  const [showUpload, setShowUpload] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<FileList | null>(null);

  return (
    <main>
      <div className="container mx-auto py-8">
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-3xl font-bold">Media Management</h1>
          <Button onClick={() => setShowUpload(true)}>
            Upload Media
          </Button>
        </div>

      {/* Upload Form */}
      {showUpload && (
        <Form method="post" encType="multipart/form-data" className="mb-8 p-6 border rounded-lg bg-gray-50">
          <input type="hidden" name="intent" value="upload" />
          
          <div className="space-y-4">
            <div>
              <Label htmlFor="files">Select Files</Label>
              <Input
                id="files"
                name="files"
                type="file"
                multiple
                required
                onChange={(e) => setSelectedFiles(e.target.files)}
                className="cursor-pointer"
              />
              {selectedFiles && (
                <p className="text-sm text-muted-foreground mt-1">
                  {selectedFiles.length} file(s) selected
                </p>
              )}
            </div>
            
            <div>
              <Label htmlFor="section">Section (optional)</Label>
              <select
                id="section"
                name="section"
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                <option value="">No section</option>
                {sections.map((section) => (
                  <option key={section.name} value={section.name}>
                    {section.name}
                  </option>
                ))}
              </select>
            </div>
            
            <div className="flex gap-2">
              <Button type="submit">Upload</Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setShowUpload(false);
                  setSelectedFiles(null);
                }}
              >
                Cancel
              </Button>
            </div>
          </div>
        </Form>
      )}

      {/* Media Grid by Section */}
      <div className="space-y-8">
        {Array.from(mediaBySection.entries()).map(([sectionName, media]) => {
          if (media.length === 0) return null;
          
          return (
            <div key={sectionName || "no-section"}>
              <h2 className="text-xl font-semibold mb-4">
                {sectionName || "No Section"}
                <span className="text-sm text-muted-foreground ml-2">
                  ({media.length} items)
                </span>
              </h2>
              
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                {media.map((item) => (
                  <MediaItem
                    key={item.id}
                    media={item}
                    sections={sections}
                  />
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
    </main>
  );
} 