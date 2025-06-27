import { Link } from "react-router";
import { Button } from "~/components/ui/button";
import type { Route } from "./+types/index";

export function meta({}: Route.MetaArgs) {
  return [
    { title: "EdgeCMS Dashboard" },
    { name: "description", content: "EdgeCMS content management dashboard" },
  ];
}

export default function EdgeCMSIndex() {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="w-full max-w-md space-y-8 text-center">
        <div>
          <h1 className="text-4xl font-bold tracking-tight">
            EdgeCMS
          </h1>
          <p className="mt-2">
              Your cloudflare first CMS admin
          </p>
        </div>
        
        <div className="space-y-4">
          <Button asChild className="w-full" size="lg" variant="outline">
            <Link to="/edge-cms/i18n">
              i18n
            </Link>
          </Button>
          
          <Button asChild className="w-full" size="lg" variant="outline">
            <Link to="/edge-cms/media">
              Media
            </Link>
          </Button>
        </div>
      </div>
    </div>
  );
}