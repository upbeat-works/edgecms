import { type RouteConfig, route, prefix, index, layout } from "@react-router/dev/routes";

export default [
  ...prefix("edge-cms", [
    index("routes/edge-cms/index.tsx"),
    layout("routes/edge-cms/_layout.tsx", [
      route("i18n", "routes/edge-cms/i18n.tsx"),
      route("i18n/versions", "routes/edge-cms/versions.tsx"),
      route("media", "routes/edge-cms/media.tsx"),
      route("sections", "routes/edge-cms/sections.tsx"),
    ]),
    route("sign-in", "routes/edge-cms/sign-in.tsx"),
    route("_a/sign-up", "routes/edge-cms/sign-up.tsx"),
    route("public/i18n/:locale.json", "routes/edge-cms/public/i18n.$locale[.]json.tsx"),
    route("public/media/:filename", "routes/edge-cms/public/media.$filename.tsx"),
  ])
] satisfies RouteConfig;
