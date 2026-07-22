import "server-only";
import sanitizeHtml from "sanitize-html";

const allowedTags = ["p","br","strong","b","em","i","u","s","h2","h3","h4","ul","ol","li","blockquote","code","pre","a","table","thead","tbody","tr","th","td","img"];

export function sanitizeProductHtml(value: string | null) {
  if (!value) return null;
  return sanitizeHtml(value, {
    allowedTags,
    allowedAttributes: { a: ["href","target","rel","title"], img: ["src","alt","title","width","height"], th: ["colspan","rowspan"], td: ["colspan","rowspan"] },
    allowedSchemes: ["http","https","mailto"],
    allowedSchemesByTag: { img: ["https"] },
    allowProtocolRelative: false,
    transformTags: { a: sanitizeHtml.simpleTransform("a", { rel: "noopener noreferrer" }, true) },
    disallowedTagsMode: "discard",
  }).trim() || null;
}

export const productHtmlAllowlist = allowedTags;
