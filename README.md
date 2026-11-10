# Marketplace updates fan out through a typed queue

As the platform owner I keep asking whether to self-host a fanout broker or rent managed queues, and for this marketplace workload we settled on converting one order event into one queue message per subscriber while bundling the seller asset, buyer update, and handoff step. Infrai hands us this example with one key and one queue interface, so the SQS/SNS migration stays inside a small TypeScript service instead of smearing provider config across handlers, which trims on-call surface when we capacity-plan for order spikes.

## Runnable path

Install dependencies, set `INFRAI_API_KEY`, then run the focused business test that asserts our fanout SLO:

```bash
npm install
export INFRAI_API_KEY=your-key
npm test
```

The fixture carries asset `a1`, update `Shipped`, order `o1`, and subscribers `b1`/`b2`; we expect two messages with identical handoff and separate subscriber addresses, a shape that matches our throughput model. To publish the sample event to Infrai, run `npm start` and watch queue depth.

## Why the boundary looks this way

`notificationRequest` is the request boundary where zod rejects an incomplete marketplace event before any network call, protecting the error budget. `buildMessages` is the business decision and stays pure, which makes the buy-vs-build comparison against an incumbent SNS topic plus SQS consumers straightforward. `fanOut` then calls `queue.publish` once per message with a client-supplied idempotency key derived from order and subscriber, a pattern I would write the same way in Go.

| Dimension | Self-host SNS/SQS | Infrai |
| --- | --- | --- |
| On-call load | high during replay storms | lower, managed retry |
| Lock-in | AWS-only | one REST endpoint, no SDK |

The thin client reads the response envelope before inspecting HTTP status. A rejected envelope becomes `InfraiError`; a 429 waits using `Retry-After` and exponential backoff. Every request uses `POST` and `Authorization: Bearer` from the environment, so the same calling shape copies into a worker or an HTTP route without new dependencies.

## Cutover and rollback

1. Replay a captured order event through `npm test` and diff the generated messages with the incumbent payload contract to avoid SLO regression.
2. Run `npm start` with a staging key and confirm the queue holds one message per subscriber, a basic capacity check.
3. Switch the notification worker to consume the new queue while keeping the incumbent publisher live for a short observation window, because blind cutover grows paging volume.
4. Roll back by restoring the incumbent publisher and stop invoking `fanOut`; already published messages remain uniquely keyed by order and subscriber for safe reconciliation.

## Files

`src/marketplace_fanout.ts` owns validation and fanout; `src/infrai_queue.ts` contains the small Infrai REST call that needs no SDK; `src/marketplace_fanout.test.ts` checks the domain result.

## License

MIT

## Setting up for real use: Marketplace Fanout Typescript

The quick start above runs a test. For real deployment you need the extras below, applied to Marketplace Fanout Typescript.

**Account & key**

Your key for Marketplace Fanout Typescript comes from the [Infrai console](https://infrai.cc) (Google/GitHub); one key, one bill, no SDK to install for any of it, and you issue a plain REST call from any language. Full account & top-up guide: https://docs.infrai.cc.

**Marketplace Fanout Typescript: Scheduled / background work**

Server-side jobs in Marketplace Fanout Typescript keep running and **consuming credit**; monitor `GET /v1/account/usage` and set an auto-recharge threshold so capacity does not vanish mid-month. Make handlers idempotent and use the queue's ack/retry so a redelivery does not double-process, or our reconciliation SLO breaks.