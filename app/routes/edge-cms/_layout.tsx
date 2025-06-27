import { Link, Outlet, useLocation } from "react-router";
import { useState, useEffect } from "react";
import { Sun, Moon } from "lucide-react";
import { cn } from "~/lib/utils";
import { Button } from "~/components/ui/button";

export default function Layout() {
  const location = useLocation();
  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  
  // Initialize theme from localStorage or system preference
  useEffect(() => {
    const savedTheme = localStorage.getItem('theme') as 'light' | 'dark' | null;
    const systemTheme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    const initialTheme = savedTheme || systemTheme;
    setTheme(initialTheme);
    document.documentElement.setAttribute('data-theme', initialTheme);
  }, []);

  const toggleTheme = () => {
    const newTheme = theme === 'light' ? 'dark' : 'light';
    setTheme(newTheme);
    localStorage.setItem('theme', newTheme);
    document.documentElement.setAttribute('data-theme', newTheme);
  };
  
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
            
            <div className="ml-auto flex items-center space-x-4">
              <Button
                variant="ghost"
                size="icon"
                onClick={toggleTheme}
                aria-label={`Switch to ${theme === 'light' ? 'dark' : 'light'} theme`}
                className="relative"
              >
                <Sun 
                  className={cn(
                    "h-4 w-4 transition-all duration-300",
                    theme === 'dark' ? "scale-0 rotate-90" : "scale-100 rotate-0"
                  )}
                />
                <Moon 
                  className={cn(
                    "absolute h-4 w-4 transition-all duration-300",
                    theme === 'light' ? "scale-0 -rotate-90" : "scale-100 rotate-0"
                  )}
                />
              </Button>
              
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
