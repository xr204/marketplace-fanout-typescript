import { z } from "zod";
import { publish } from "./infrai_queue.js";

export const notificationRequest = z.object({
  sellerAsset: z.object({ id: z.string(), title: z.string() }),
  buyerUpdate: z.string().min(1),
  orderHandoff: z.object({ orderId: z.string(), nextStep: z.string() }),
  subscribers: z.array(z.string().min(1)).min(1)
});
export type NotificationRequest = z.infer<typeof notificationRequest>;

export function buildMessages(input: NotificationRequest) {
  return input.subscribers.map((subscriber) => ({ subscriber, sellerAsset: input.sellerAsset, buyerUpdate: input.buyerUpdate, orderHandoff: input.orderHandoff }));
}

export async function fanOut(raw: unknown) {
  const input = notificationRequest.parse(raw);
  const messages = buildMessages(input);
  await Promise.all(messages.map((message) => publish(message, `marketplace:${input.orderHandoff.orderId}:${message.subscriber}`)));
  return { orderId: input.orderHandoff.orderId, published: messages.length };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const sample = { sellerAsset: { id: "asset-42", title: "Handmade mug" }, buyerUpdate: "Packed and ready", orderHandoff: { orderId: "order-9", nextStep: "Carrier pickup" }, subscribers: ["buyer-1", "buyer-2"] };
  fanOut(sample).then(console.log).catch((error) => { console.error(error.message); process.exitCode = 1; });
}
