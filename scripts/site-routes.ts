import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";

export interface EdgeRequest {
  uri: string;
  method: string;
  headers: Record<string, { value: string; multiValue?: Array<{ value: string }> }>;
}
export interface EdgeResponse {
  statusCode: number;
  headers: Record<string, { value: string }>;
  body: string;
}

// One implementation for deployed CloudFront, local preview, and tests.
const edge = runInNewContext(
  readFileSync(new URL("../terraform/functions/site-request.js", import.meta.url), "utf8") +
    "\n({ handler, negotiate })",
) as {
  handler(event: { request: EdgeRequest }): EdgeRequest | EdgeResponse;
  negotiate(accept?: string): "html" | "markdown" | null;
};
export const routeRequest = edge.handler;
export const negotiatePageRepresentation = edge.negotiate;
