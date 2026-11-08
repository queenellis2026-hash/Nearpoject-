# Submission payload draft — NEAR HACKATHON, "Paid in Full"

**Do not send anything from this file.** The submission is a single, un-editable
send (form at https://nearhackathon.com/#apply or `POST https://nearhackathon.com/api/applications`).
Chris confirms the exact payload first; only then is it sent, once, before
**Saturday Nov 14, 2026, 23:59 UTC (5:59 PM CST)**.

## Fields still needed from Chris (placeholders — never guess these)

| Placeholder | What it is | Rule |
|---|---|---|
| `[TEAM LEAD NAME]` | Chris's name as team lead | 2–80 characters |
| `[CONTACT EMAIL]` | Email the organizers may contact | valid email, max 160 chars, max 2 submissions per email |
| `[MAINNET NEAR PAYOUT ADDRESS]` | The mainnet NEAR account Chris creates himself in a NEAR wallet | 2–64 chars, lowercase, e.g. `name.near`. **An agent must never create or invent this.** |
| `[PUBLIC REPO URL]` | The public GitHub (or other) URL of this repository once Chris/the team makes it public | http(s), max 300 chars; each repo can be submitted only once |
| `[X POST URL]` | URL of the demo post Chris publishes on X (see `x-post-draft.md`) | http(s), max 300 chars |

Team size is drafted as `2 - 4` (Chris + the agents working under his direction) — Chris confirms or changes it.

## The payload (API shape — exactly these fields, no others)

```json
{
  "requestId": "[GENERATE ONCE AT SUBMISSION TIME: a UUID, e.g. node -e \"console.log(crypto.randomUUID())\" — reuse the same value on any retry]",
  "projectName": "Paid in Full",
  "leadName": "[TEAM LEAD NAME]",
  "email": "[CONTACT EMAIL]",
  "size": "2 - 4",
  "tracks": ["realworld", "business", "agents"],
  "nearAddress": "[MAINNET NEAR PAYOUT ADDRESS]",
  "projectUrl": "[PUBLIC REPO URL]",
  "demoUrl": "[X POST URL]",
  "idea": "Contractors lose money in the gap between finishing a job and getting paid, and invoices quietly grow past the price the customer approved. Paid in Full is an invoice-to-payment desk for small crews. An agent clerk prepares the invoice from the job's line items, checks it against the approved contract sum, and flags any overage before a dollar moves; a flagged invoice cannot be approved or paid until a human resolves it, and a human approval is required before any payment. On NEAR: a testnet escrow contract holds the approved amount (the funding call takes the exact deposit as the approval) and releases it to the contractor on the client's release, and NEAR Intents dry quotes (dry: true, no funds moved) show what the payment would settle to cross-chain. The local demo runs with no wallet: npm test, then ./run-demo.sh. Built November 8-14, 2026 for NEAR HACKATHON. Tracks: realworld (invoicing on crypto rails), business (payments within human-set limits), agents (an agent that prepares and checks, a human who decides).",
  "consent": true
}
```

The `idea` text above is 1,032 characters (rule: 20–2,000) and describes only what the build actually does.

## Before sending — checklist

1. Repository is **public** and its README matches this payload.
2. The demo post is **live on X** from Chris's account, tags @NEARProtocol, uses #NEARHackathon, video/screenshots attached.
3. Chris has read the contact notice verbatim — *"I agree that the organizers may use these details to review our submission and contact us about this hackathon."* — and agrees (`consent: true` only then).
4. Chris has seen this exact payload and said yes.
5. **Do not add a `website` field** — the API treats any non-empty value as a spam trap and rejects the submission.
6. Send once. A 201 means saved. Mistakes are fixed only via https://nearhackathon.com/request-changes — never by submitting again (a second send of the same repo is rejected with 409).
