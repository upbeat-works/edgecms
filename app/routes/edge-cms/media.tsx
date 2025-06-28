import { useLoaderData, Form, useFetcher } from "react-router";
import { useState, useEffect } from "react";
import { useInView } from "react-intersection-observer";
import { FileText, Play } from "lucide-react";
import { requireAuth } from "~/lib/auth.middleware";
import { getMedia, getSections, updateMediaSection, type Media, type Section } from "~/lib/db.server";
import { uploadMedia } from "~/lib/media.server";
import { Button } from "~/components/ui/button";
import { Label } from "~/components/ui/label";
import { Input } from "~/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "~/components/ui/dialog";
import { env } from "cloudflare:workers";
import type { Route } from "./+types/media";

export async function loader({ request }: Route.LoaderArgs) {
  await requireAuth(request, env);
  
  const [media, sections] = await Promise.all([
    getMedia(),
    getSections(),
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
      
      await updateMediaSection(mediaId, section === "" ? null : section);
      return { success: true };
    }

    default:
      return { error: "Invalid action" };
  }
}

function MediaItem({ media, sections }: { media: Media; sections: Section[] }) {
  const fetcher = useFetcher();
  const [selectedSection, setSelectedSection] = useState(media.section || "");
  const { ref, inView } = useInView({
    threshold: 0.1,
    triggerOnce: true
  });
  
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
      <Dialog>
        <DialogTrigger asChild>
          <div className="aspect-video bg-gray-100 rounded overflow-hidden flex items-center justify-center relative cursor-pointer group hover:bg-gray-200 transition-colors">
            {media.mimeType.startsWith("image/") ? (
              <img 
                src={`/edge-cms/public/media/${media.filename}`}
                alt={media.filename}
                className="max-w-full max-h-full object-contain"
                loading="lazy"
              />
            ) : media.mimeType.startsWith("video/") ? (
              <>
                <video 
                  src={`/edge-cms/public/media/${media.filename}`}
                  className="max-w-full max-h-full object-contain"
                  muted
                  preload="metadata"
                />
                <div className="absolute inset-0 flex items-center justify-center bg-black/30 group-hover:bg-black/40 transition-colors">
                  <div className="bg-white/90 rounded-full p-3 group-hover:bg-white transition-colors">
                    <Play className="h-6 w-6 text-black fill-black" />
                  </div>
                </div>
              </>
            ) : (
              <div ref={ref} className="absolute inset-0 bg-gray-200">
                <div className="absolute inset-0 z-10" />
                {inView && (
                  <object
                    data={`/edge-cms/public/media/${media.filename}#toolbar=0&navpanes=0&scrollbar=0&scroll=0`}
                    type={media.mimeType}
                    aria-label={media.filename}
                    className="h-full w-full object-cover"
                    onScroll={e => e.preventDefault()}
                  >
                    <div className="flex h-full w-full items-center justify-center">
                      <FileText className="h-12 w-12 text-gray-400" />
                    </div>
                  </object>
                )}
              </div>
            )}
          </div>
        </DialogTrigger>
        <DialogContent dismissible={false} className="border-0 min-w-[90vw] p-0 outline-none">
          <DialogHeader className="sr-only">
            <DialogTitle>{media.filename}</DialogTitle>
          </DialogHeader>
          <div className="aspect-video">
            {media.mimeType.startsWith("image/") ? (
              <img 
                src={`/edge-cms/public/media/${media.filename}`}
                alt={media.filename}
                className="w-full h-full object-contain rounded"
              />
            ) : media.mimeType.startsWith("video/") ? (
              <video 
                src={`/edge-cms/public/media/${media.filename}`}
                controls
                autoPlay
                className="w-full h-full object-contain rounded"
              />
            ) : (
              <object
                data={`/edge-cms/public/media/${media.filename}`}
                type={media.mimeType}
                aria-label={media.filename}
                className="w-full h-full object-contain rounded"
              >
                <div className="flex h-full w-full items-center justify-center">
                  <FileText className="h-12 w-12 text-gray-400" />
                  <p className="ml-2">Unable to preview this file type</p>
                </div>
              </object>
            )}
          </div>
        </DialogContent>
      </Dialog>
      
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
  const uploadFetcher = useFetcher();

  // Close dialog on successful upload
  useEffect(() => {
    if (uploadFetcher.data?.success && uploadFetcher.state === "idle") {
      setShowUpload(false);
      setSelectedFiles(null);
    }
  }, [uploadFetcher.data, uploadFetcher.state]);

  return (
    <main>
      <div className="container mx-auto py-8">
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-3xl font-bold">Media Management</h1>
          <Dialog open={showUpload} onOpenChange={setShowUpload}>
            <DialogTrigger asChild>
              <Button>Upload Media</Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>Upload Media</DialogTitle>
              </DialogHeader>
              <uploadFetcher.Form method="post" encType="multipart/form-data" className="space-y-4">
                <input type="hidden" name="intent" value="upload" />
                
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
                
                <div className="flex gap-2 justify-end">
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
                  <Button 
                    type="submit"
                    disabled={uploadFetcher.state === "submitting"}
                  >
                    {uploadFetcher.state === "submitting" ? "Uploading..." : "Upload"}
                  </Button>
                </div>
              </uploadFetcher.Form>
            </DialogContent>
          </Dialog>
        </div>

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