import { Link, Outlet, useLocation } from "react-router";
import { cn } from "~/lib/utils";

export function Layout() {
  const location = useLocation();
  
  const navItems = [
    { href: "/edge-cms/i18n", label: "Translations" },
    { href: "/edge-cms/media", label: "Media" },
  ];

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b">
        <div className="container mx-auto px-4">
          <nav className="flex h-16 items-center space-x-6">
            <Link to="/edge-cms" className="font-semibold text-lg">
              EdgeCMS
            </Link>
            
            <div className="flex items-center space-x-4 ml-8">
              {navItems.map((item) => (
                <Link
                  key={item.href}
                  to={item.href}
                  className={cn(
                    "text-sm font-medium transition-colors hover:text-primary",
                    location.pathname === item.href
                      ? "text-foreground"
                      : "text-muted-foreground"
                  )}
                >
                  {item.label}
                </Link>
              ))}
            </div>
            
            <div className="ml-auto">
              <form action="/edge-cms/sign-in" method="post">
                <input type="hidden" name="intent" value="signout" />
                <button
                  type="submit"
                  className="text-sm text-muted-foreground hover:text-foreground"
                >
                  Sign Out
                </button>
              </form>
            </div>
          </nav>
        </div>
      </header>
      
      <main className="flex-1">
        <Outlet />
      </main>
    </div>
  );
}
