import * as cheerio from "cheerio";
import { collapseWhitespace } from "../util/text.ts";

const STRIPPED_SELECTORS = [
  "script",
  "style",
  "noscript",
  "template",
  "svg",
  "iframe",
  "form",
  "[aria-hidden='true']",
];

export interface PageLink {
  url: string;
  text: string;
  sameSite: boolean;
}

export interface ParsedPage {
  title: string;
  description: string;
  text: string;
  links: PageLink[];
}

export function parsePage(html: string, baseUrl: string, siteHost: string): ParsedPage {
  const $ = cheerio.load(html);

  const title = collapseWhitespace($("title").first().text() || $("h1").first().text() || "");
  const description = collapseWhitespace(
    $("meta[name='description']").attr("content") ??
      $("meta[property='og:description']").attr("content") ??
      "",
  );

  const links = collectLinks($, baseUrl, siteHost);

  const $body = cheerio.load(html);
  $body(STRIPPED_SELECTORS.join(",")).remove();
  $body("nav, footer, header[role='banner']").remove();

  const bodyText = collapseWhitespace(
    $body("main").text() || $body("article").text() || $body("body").text() || "",
  );

  const fallbackText = bodyText.length < 200 ? collapseWhitespace($("body").text()) : bodyText;

  return { title, description, text: fallbackText, links };
}

function collectLinks($: cheerio.CheerioAPI, baseUrl: string, siteHost: string): PageLink[] {
  const seen = new Set<string>();
  const links: PageLink[] = [];

  $("a[href]").each((_, element) => {
    const href = $(element).attr("href");
    if (!href) return;
    const trimmed = href.trim();
    if (!trimmed || trimmed.startsWith("#") || /^(mailto|tel|javascript):/i.test(trimmed)) return;

    let absolute: URL;
    try {
      absolute = new URL(trimmed, baseUrl);
    } catch {
      return;
    }
    if (absolute.protocol !== "http:" && absolute.protocol !== "https:") return;

    absolute.hash = "";
    const key = absolute.href;
    if (seen.has(key)) return;
    seen.add(key);

    links.push({
      url: key,
      text: collapseWhitespace($(element).text()).slice(0, 160),
      sameSite: isSameSite(absolute.hostname, siteHost),
    });
  });

  return links;
}

export function isSameSite(hostname: string, siteHost: string): boolean {
  const a = hostname.toLowerCase().replace(/^www\./, "");
  const b = siteHost.toLowerCase().replace(/^www\./, "");
  return a === b || a.endsWith(`.${b}`) || b.endsWith(`.${a}`);
}

export function extractSitemapUrls(xml: string): string[] {
  const urls: string[] = [];
  const pattern = /<loc>\s*([^<\s]+)\s*<\/loc>/gi;
  let match = pattern.exec(xml);
  while (match !== null) {
    if (match[1]) urls.push(match[1]);
    match = pattern.exec(xml);
  }
  return urls;
}
