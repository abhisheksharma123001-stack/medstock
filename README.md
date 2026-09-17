# Medstock

Medstock is a pharmacy inventory workspace built around FEFO: stock is dispensed from the batch with the soonest in-date expiry first, while expired batches are excluded from sellable stock and cannot be sold.

## Run locally

```bash
npm install
npm run dev
```

Open the local Vite URL printed in the terminal. The frontend runs on port `5173` by default.

### Run the API

In a second terminal:

```bash
npm run api
```

The API runs on `http://localhost:3000`. To use another port:

```bash
PORT=3100 npm run api
```

### Debug

1. Run `npm run api` and `npm run dev` in separate terminals.
2. Open the Vite URL in a browser.
3. Use the browser DevTools Console for frontend errors.
4. Check `GET /health` for API status.
5. Use `GET /batches` to inspect current quantities, expiry dates, and quarantine state.
6. Run `npm run build` to catch frontend compilation errors.

The API stores demo state in memory, so restarting the server resets the sample inventory.

## Automation API

Run the API with `npm run api` or `npm start`.

- `POST /clock` or `/api/clock` with `{ "date": "2026-09-21" }` flags batches expiring within 7 days, quarantines expired batches, and reports counts. It also accepts `{ "advanceDays": 4 }`.
- `POST /batches/import`, `/api/import`, or `/api/batches/import` accepts an array or `{ "batches": [] }`. It accepts ISO and `dd/mm/yyyy` dates and quantities such as `"10 units"`, returning `imported`, `deduped`, and `rejected` counts.
- `POST /dispense` with `{ "medicine": "...", "quantity": 1, "threshold": 20 }` dispenses FEFO-first and queues a reorder notification when sellable stock falls below the threshold.
- `GET /outbox` returns messages sent to the Notification Service.

Additional routes: `GET /health`, `GET /batches`, `GET /api/batches`, `GET /api/outbox`, and `DELETE /outbox`.

## Project structure

- `index.html` and `src/` contain the responsive pharmacy interface.
- `server.js` contains the inventory API, FEFO dispensing, clock automation, import normalization, and reorder outbox.
- `REASONING.md` records the design decisions and validation strategy.
- `AI_LOGS.md` contains the recorded AI conversation transcript supplied with the project.