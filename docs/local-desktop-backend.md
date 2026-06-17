# Local Desktop Backend

This project can now run against a desktop-owned backend instead of Base44.

## Pieces

- API server: [server/index.mjs](/C:/Users/Admin/Desktop/main-phase-market/server/index.mjs)
- SQLite database: `server/data/main-phase-market.db`
- Entity store: [server/entityStore.mjs](/C:/Users/Admin/Desktop/main-phase-market/server/entityStore.mjs)
- Frontend provider: [localBackend.js](/C:/Users/Admin/Desktop/main-phase-market/src/services/providers/localBackend.js)

## Run it

Terminal 1:

```powershell
npm.cmd run dev:backend
```

If you want auto-restart while editing and your machine supports it:

```powershell
npm.cmd run dev:backend:watch
```

Terminal 2:

```powershell
$env:VITE_APP_BACKEND_PROVIDER='local'
npm.cmd run dev
```

## Import CSVs

Example:

```powershell
npm.cmd run local:import:csv -- Product "Data Exports/Product_export.csv"
npm.cmd run local:import:csv -- Order "Data Exports/Order_export.csv"
npm.cmd run local:import:csv -- Card "Data Exports/Card_export.csv"
```

Important:

- `Card_export.csv` is currently muddy from Base44, so do not import it unless you explicitly want those rows.
- The MTG catalog/search is already local and file-based under [public/data/mtg](/C:/Users/Admin/Desktop/main-phase-market/public/data/mtg).

## Current limitations

- Local auth is a simple desktop-admin stub for now.
- Local actions/files/email are not implemented yet.
- This is the fastest break-away path for inventory/products/orders data, not the final polished backend.

## Security notes

- The local API now binds to `127.0.0.1` by default, not all network interfaces.
- It only accepts loopback connections and localhost browser origins.
- That means other devices on your network should not be able to hit it unless you deliberately change the host binding.
- The current auth model is still a local admin stub, so this is safe for desktop development but not ready for internet exposure.
