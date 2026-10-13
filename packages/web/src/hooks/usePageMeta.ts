import { useEffect } from "react";

const SITE_URL = "https://rspluginpulse.com";
const DEFAULT_IMAGE = `${SITE_URL}/og-image.png`;

export interface PageMeta {
  title: string;
  description: string;
  // Path only (e.g. "/plugin/117hd?game=runelite") -- resolved against
  // SITE_URL here so callers never have to repeat the domain.
  canonicalPath: string;
  image?: string;
  // Structured data for this specific page (e.g. a SoftwareApplication
  // block for a plugin, a Person block for an author). Omit for pages
  // that don't warrant their own schema beyond the site-wide WebSite
  // block already in index.html.
  jsonLd?: object;
}

// index.html ships sensible static defaults (title, description, OG/Twitter
// tags, one WebSite JSON-LD block) so the page is never meta-less even
// before this runs or for a request this hook never fires on. This
// overwrites those per-route once data is available, so Google's
// JS-rendering pass (and any bot that does execute JS) sees the real
// per-entity content instead of the generic homepage copy. Non-JS bots
// (social link previews) are handled separately in middleware.ts, since
// mutating the DOM after the fact doesn't help a crawler that never runs
// the JS at all.
export function usePageMeta({ title, description, canonicalPath, image, jsonLd }: PageMeta) {
  useEffect(() => {
    const canonicalUrl = `${SITE_URL}${canonicalPath}`;
    const imageUrl = image ?? DEFAULT_IMAGE;

    document.title = title;
    setMeta("description", description);
    setMeta("og:title", title, "property");
    setMeta("og:description", description, "property");
    setMeta("og:url", canonicalUrl, "property");
    setMeta("og:image", imageUrl, "property");
    setMeta("twitter:title", title);
    setMeta("twitter:description", description);
    setMeta("twitter:image", imageUrl);
    setCanonical(canonicalUrl);

    const script = jsonLd ? setPageJsonLd(jsonLd) : null;
    return () => {
      script?.remove();
    };
  }, [title, description, canonicalPath, image, jsonLd]);
}

function setMeta(name: string, content: string, attr: "name" | "property" = "name") {
  let el = document.querySelector(`meta[${attr}="${name}"]`);
  if (!el) {
    el = document.createElement("meta");
    el.setAttribute(attr, name);
    document.head.appendChild(el);
  }
  el.setAttribute("content", content);
}

function setCanonical(href: string) {
  let el = document.querySelector('link[rel="canonical"]');
  if (!el) {
    el = document.createElement("link");
    el.setAttribute("rel", "canonical");
    document.head.appendChild(el);
  }
  el.setAttribute("href", href);
}

// A second, page-specific JSON-LD block alongside index.html's static
// WebSite one (left alone -- both can coexist, Google reads an array of
// structured-data blocks per page fine). Removed on unmount/re-run so
// navigating away doesn't leave a stale plugin's schema describing the
// next page.
const PAGE_JSONLD_ID = "page-json-ld";
function setPageJsonLd(data: object): HTMLScriptElement {
  document.getElementById(PAGE_JSONLD_ID)?.remove();
  const script = document.createElement("script");
  script.id = PAGE_JSONLD_ID;
  script.type = "application/ld+json";
  script.textContent = JSON.stringify(data);
  document.head.appendChild(script);
  return script;
}
