# Reasoning

## Core model

The inventory is represented as individual medicine batches. Each batch has a medicine name, lot number, quantity, and normalized ISO expiry date. Sellable stock is calculated at read time by excluding batches whose expiry is before the simulated current date and batches that are quarantined.

FEFO is enforced at the transaction boundary, not only in the UI. A dispense filters to matching, in-date, non-quarantined batches with available quantity, sorts them by expiry date, and consumes the requested quantity from that ordered list. This prevents an expired batch from being sold even if a client sends a direct API request.

## Automation

`POST /clock` advances the application date. The daily job marks unexpired batches within seven days as flagged and moves expired batches to quarantine. Each run is idempotent: an already flagged or quarantined batch is not counted again. The response includes both event counts and current totals.

## Messy imports

The import path accepts either an array or an object containing `batches`, `rows`, or `data`. It normalizes common field names, positive quantities such as `10` and `10 units`, and ISO, `dd/mm/yyyy`, and `dd-mm-yyyy` dates. Invalid rows are rejected with a reason. Duplicate medicine/lot/expiry combinations are deduplicated against both the incoming file and existing inventory.

## Reorder integration

The Notification Service is represented by an in-memory outbox. Each medicine gets a stock baseline. A reorder message is emitted only when sellable stock crosses from at least the threshold to below it, which avoids false alerts for stock that was already low at startup. The message includes the medicine, current sellable stock, and threshold.

## Frontend decisions

The frontend keeps the workflow compact: the inventory table is the source of truth for batches, the expiry watch surfaces both expired and soon-expiring stock, and the five-to-seven-day reminder strip gives an earlier action cue. Settings update the admin profile, pharmacy details, notification preference, and alert window in the active demo session. Buyer sales use the same FEFO transaction logic and immediately refresh quantities and the dispensing log.

## Testing and fixes

Validation used several focused checks:

- `node --check server.js` checks API syntax.
- `npm run build` checks the Vite production bundle.
- A DOM smoke harness renders the frontend and exercises Settings, password changes, sales, reminders, and the dispensing log.
- Fresh API processes were tested with `curl` for `/clock`, messy imports, FEFO dispensing, `/outbox`, aliases, and static frontend serving.

During development, a white-screen failure was reproduced in the DOM harness. The cause was a stale `ALERT_WINDOW_DAYS` reference after the alert setting became configurable; replacing it with `alertWindowDays` restored the initial render. A second transaction bug was fixed by validating requested sale quantity before mutating any batch, so an oversized sale cannot partially reduce inventory.