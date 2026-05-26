# Extensions

EdgeCMS supports project-specific admin pages through a small extension API.
Extensions can register custom routes and add links to the EdgeCMS header nav,
without writing a plugin system or wiring up your own layout.

## How it works

EdgeCMS reserves the URL prefix `/edge-cms/custom/*` for extension routes.
Extension routes are mounted inside the existing EdgeCMS layout, so they
automatically get:

- The header nav (with extension links alongside the built-in ones)
- The `requireAuth` gate — signed-in users only
- The theme toggle, publish button, and EdgeCMS styling

A single file — `app/extension.ts` — declares what routes and nav items to
register.

## Quickstart

Add an "Operations" page at `/edge-cms/custom/operations`.

### 1. Register the route and nav item

Open `app/extension.ts` and set its default export:

```ts
import { route } from '@react-router/dev/routes';
import type { Extension } from './extension.types';

const extension: Extension = {
  routes: [
    route('operations', 'routes/custom/operations.tsx'),
  ],
  navItems: [
    { href: '/edge-cms/custom/operations', label: 'Operations' },
  ],
};

export default extension;
```

### 2. Create the page

Create `app/routes/custom/operations.tsx`:

```tsx
export default function Operations() {
  return (
    <div className="container mx-auto py-8">
      <h1 className="text-2xl font-semibold">Operations</h1>
      <p className="text-muted-foreground mt-2">
        Your custom page content here.
      </p>
    </div>
  );
}
```

### 3. Run it

```bash
npm run dev
```

Sign in and "Operations" appears in the header nav. Clicking it loads your page
inside the EdgeCMS shell.

## Nested pages

Add as many routes as you need. Paths are relative to `/edge-cms/custom/`; file
paths are relative to `app/`.

```ts
const extension: Extension = {
  routes: [
    route('operations', 'routes/custom/operations.tsx'),
    route('operations/reports', 'routes/custom/operations.reports.tsx'),
    route('operations/reports/:id', 'routes/custom/operations.reports.$id.tsx'),
  ],
  navItems: [
    { href: '/edge-cms/custom/operations', label: 'Operations' },
  ],
};
```

## Loaders and actions

Extension routes are regular React Router routes. Use loaders, actions, and the
same `requireAuth` middleware EdgeCMS uses internally:

```tsx
import { requireAuth } from '~/utils/auth.middleware';
import type { Route } from './+types/operations';

export async function loader({ request, context }: Route.LoaderArgs) {
  const { user } = await requireAuth(request, context.cloudflare.env);
  // Query D1, KV, R2 via context.cloudflare.env.DB / CACHE / MEDIA_BUCKET
  return { user };
}

export default function Operations({ loaderData }: Route.ComponentProps) {
  return <div>Hello, {loaderData.user.email}</div>;
}
```

## API reference

Defined in `app/extension.types.ts`.

```ts
type Extension = {
  routes?: RouteConfigEntry[];
  navItems?: NavItem[];
};

type NavItem = {
  href: string;
  label: string;
};
```

| Field      | Type                  | Description                                                                                                  |
| ---------- | --------------------- | ------------------------------------------------------------------------------------------------------------ |
| `routes`   | `RouteConfigEntry[]`  | React Router route entries. Mounted under `/edge-cms/custom/`. Inherit the EdgeCMS layout and auth gate.     |
| `navItems` | `NavItem[]`           | Appended after the built-in nav items (Translations, Media, Blocks, Sections). Rendered in desktop + mobile. |

## Limitations

The extension API is intentionally minimal. It does **not** support:

- Component overrides or layout slots (the EdgeCMS header, sidebar, etc. are fixed)
- Role gating on nav items — every signed-in user sees every link
- Icons on nav items
- Settings/admin page injection beyond top-level nav
- Routes outside the `/edge-cms/custom/*` namespace
- Loading extensions from external packages

If you need one of these, open an issue — they're easy to add to the `Extension`
type.
