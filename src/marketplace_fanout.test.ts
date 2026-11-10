import { strict as assert } from "node:assert";
import { buildMessages, notificationRequest } from "./marketplace_fanout.js";

const input = notificationRequest.parse({ sellerAsset: { id: "a1", title: "Lamp" }, buyerUpdate: "Shipped", orderHandoff: { orderId: "o1", nextStep: "Track parcel" }, subscribers: ["b1", "b2"] });
const messages = buildMessages(input);
assert.equal(messages.length, 2);
assert.deepEqual(messages.map((message) => message.subscriber), ["b1", "b2"]);
assert.equal(messages[1].orderHandoff.nextStep, "Track parcel");
console.log("fanout decision verified");
