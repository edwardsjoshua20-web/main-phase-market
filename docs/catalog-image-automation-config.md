# Catalog and image automation config

Catalog and image refresh now follow the same structural pattern as pricing:

- declared config file
- shared job runner
- clean skip behavior for missing prerequisites
- one automation entry point per pipeline family

## Catalog config

- live config: `config/catalog-refresh.json`
- example config: `config/catalog-refresh.example.json`

Entry point:

- `npm run automation:catalog:refresh`

## Image config

- live config: `config/image-refresh.json`
- example config: `config/image-refresh.example.json`

Entry point:

- `npm run automation:images:refresh`

## Job shape

Each job declares:

- `id`
- `label`
- `command`
- `args`
- optional `requires`
- optional `enabled`

Requirement example:

```json
{
  "type": "file-exists",
  "path": "public/data/fab/cards.json",
  "label": "FAB cards catalog"
}
```

## Why this matters

This keeps the site operationally clean:

- pricing is config-driven
- catalog refresh is config-driven
- image refresh is config-driven
- health reporting can judge the outputs consistently

That means future game support becomes a configuration problem first, not a code-rewrite problem first.
