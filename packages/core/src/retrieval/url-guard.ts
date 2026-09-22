import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

export type UrlRejection =
  | "INVALID_URL"
  | "UNSUPPORTED_PROTOCOL"
  | "BLOCKED_ADDRESS"
  | "DNS_FAILURE";

export class UrlNotAllowedError extends Error {
  readonly code: UrlRejection;
  constructor(code: UrlRejection, message: string) {
    super(message);
    this.name = "UrlNotAllowedError";
    this.code = code;
  }
}

export interface UrlGuardOptions {
  allowPrivateAddresses: boolean;
}

export function normalizeUrl(raw: string): URL {
  const trimmed = raw.trim();
  const withProtocol = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  let url: URL;
  try {
    url = new URL(withProtocol);
  } catch {
    throw new UrlNotAllowedError("INVALID_URL", `not a usable URL: ${raw}`);
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new UrlNotAllowedError(
      "UNSUPPORTED_PROTOCOL",
      `only http and https are fetched, got ${url.protocol}`,
    );
  }
  url.hash = "";
  return url;
}

export async function assertFetchable(raw: string | URL, options: UrlGuardOptions): Promise<URL> {
  const url = raw instanceof URL ? raw : normalizeUrl(raw);
  if (options.allowPrivateAddresses) return url;

  const addresses = await resolveAddresses(url.hostname);
  for (const address of addresses) {
    if (isBlockedAddress(address)) {
      throw new UrlNotAllowedError(
        "BLOCKED_ADDRESS",
        `${url.hostname} resolves to a non-public address (${address})`,
      );
    }
  }
  return url;
}

async function resolveAddresses(hostname: string): Promise<string[]> {
  const literal = stripIpv6Brackets(hostname);
  if (isIP(literal)) return [literal];
  try {
    const records = await lookup(hostname, { all: true, verbatim: true });
    if (records.length === 0) throw new Error("no records");
    return records.map((record) => record.address);
  } catch (error) {
    throw new UrlNotAllowedError(
      "DNS_FAILURE",
      `could not resolve ${hostname}: ${describe(error)}`,
    );
  }
}

export function stripIpv6Brackets(hostname: string): string {
  return hostname.startsWith("[") && hostname.endsWith("]") ? hostname.slice(1, -1) : hostname;
}

export function isBlockedAddress(rawAddress: string): boolean {
  const address = stripIpv6Brackets(rawAddress);
  const version = isIP(address);
  if (version === 4) return isBlockedIpv4(address);
  if (version === 6) return isBlockedIpv6(address);
  return true;
}

const BLOCKED_IPV4_RANGES: [string, number][] = [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.88.99.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
];

function isBlockedIpv4(address: string): boolean {
  const value = ipv4ToNumber(address);
  if (value === null) return true;
  return BLOCKED_IPV4_RANGES.some(([network, bits]) => {
    const base = ipv4ToNumber(network);
    if (base === null) return false;
    const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
    return (value & mask) >>> 0 === (base & mask) >>> 0;
  });
}

function ipv4ToNumber(address: string): number | null {
  const parts = address.split(".");
  if (parts.length !== 4) return null;
  let value = 0;
  for (const part of parts) {
    const octet = Number(part);
    if (!Number.isInteger(octet) || octet < 0 || octet > 255) return null;
    value = ((value << 8) | octet) >>> 0;
  }
  return value;
}

function isBlockedIpv6(address: string): boolean {
  const normalized = address.toLowerCase().split("%")[0] ?? "";
  const mapped = normalized.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped?.[1]) return isBlockedIpv4(mapped[1]);
  if (normalized === "::" || normalized === "::1") return true;
  if (/^f[cd][0-9a-f]{2}:/.test(normalized)) return true;
  if (/^fe[89ab][0-9a-f]:/.test(normalized)) return true;
  if (/^ff[0-9a-f]{2}:/.test(normalized)) return true;
  if (normalized.startsWith("2001:db8:")) return true;
  return false;
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
