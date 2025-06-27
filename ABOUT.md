# About

We want to build a tiny app hosted on cloudflare workers:

## Stack
- react-router v7
- shadcn
- Cloudflare D1
- Cloudflare KV

## Data Model
**Sections**
- name String @id

**Translations**
- key      String
- language String reference (Languages.locale)
- value    String
- section String? reference (Sections.name)
- @@id([language, key])
- @@index([key])

**Languages**
- locale String
- default Boolean

**Media**
- mimeType
- filename
- sizeBytes
- section String? reference (Sections.name)


## Routes
### /edge-cms/sign-in
This page should have a minimal user + password authentication. We want to use Better Auth + Cloudflare's D1 database to manage users.

### /edge-cms/i18n - authenticated
This page will hold a UI table that displays the application translations. Each column represents one of the application languages, and you should be able to edit inline and the database should update it's value onChange.
Optionally you can filter by section.

The idea is that we're able to add the default language and it will be easy to identify the missing translations by querying the keys that dont have a translation.

### /edge-cms/media - authenticated
This page will display a grid of HTML <object> elements and an upload button to add new files. The name of the file needs to be transformed to be kebab-case.
The grid will be separated by sections and the media items that dont have a section will appear at the top in a generic section.

You should be able to update the section of each media item.

- The media items will be uploaded to a cloudflare r2 bucket.
- The bucket name should be defined via environment variable.

### /edge-cms/public/i18n/:locale[.]json
This route should fetch all of the translations for the specified locale param, and if a key doesn't have a translation in that locale it should return the default language.
It should generate a localization json object in the shape:
```json
{
  [key]: "value"
}
```

The object should be cached using Cloudflare's KV. If the object is stale or missing then it should be generated again.
When a translation is added/updated, the corresponding KV object for that locale should be purged.

### /edge-cms/public/media/:filename
This route should redirct to the corresponding r2 bucket public url.

## Integrating with other apps
The purpose of this project is to be able to deploy this as a cloudflare worker to an existing domain.
We just need to define the /edge-cms routes in the wrangler configuration and any domain could receive requests to serve this application.
As part of the deploy configuration the path needs to be defined and the bucket name.