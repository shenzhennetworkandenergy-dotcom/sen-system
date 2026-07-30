import "server-only";

import { siteConfig } from "@/config/site";
import { normalizeProductSearch } from "@/lib/chatbot/search";

export type WebsiteKnowledgeResult = {
  matchType: "information";
  available: false;
  answerBn: string;
  answerEn: string;
};

type KnowledgeEntry = {
  terms: string[];
  answerBn: string;
  answerEn: string;
};

const categoryNames = siteConfig.businessCategories
  .map((category) => category.label)
  .join(", ");

const entries: KnowledgeEntry[] = [
  {
    terms: ["about", "company", "who", "business", "পরিচয়", "কোম্পানি"],
    answerBn:
      "SEN (Shenzhen Energy & Networks) চীনভিত্তিক technology sourcing-কে Bangladesh operations ও global customer requirements-এর সঙ্গে যুক্ত করে। আমরা networking, energy, medical equipment এবং specialized project sourcing নিয়ে কাজ করি।",
    answerEn:
      "SEN (Shenzhen Energy & Networks) connects China-based technology sourcing with Bangladesh operations and global customer requirements across networking, energy, medical equipment, and specialized project sourcing.",
  },
  {
    terms: ["category", "categories", "products", "sell", "equipment", "পণ্য", "ক্যাটাগরি"],
    answerBn: `আমাদের প্রধান চারটি product category হলো: ${categoryNames}। Product catalogue থেকে category নির্বাচন করে পণ্য দেখা ও search করা যায়।`,
    answerEn: `Our four main product categories are ${categoryNames}. You can choose a category or search by product name, SKU, or model in the product catalogue.`,
  },
  {
    terms: ["contact", "phone", "whatsapp", "email", "address", "location", "যোগাযোগ", "ফোন", "ঠিকানা"],
    answerBn:
      "SEN Bangladesh office: House 67, Level 3, Laboratory Road, New Elephant Road (Multiplan Center-এর পেছনে), Dhaka 1205। Call/WhatsApp: +8801805226599। Email: szwaqia@vip.163.com।",
    answerEn:
      "SEN Bangladesh office: House 67, Level 3, Laboratory Road, New Elephant Road (behind Multiplan Center), Dhaka 1205. Call/WhatsApp: +8801805226599. Email: szwaqia@vip.163.com.",
  },
  {
    terms: ["quote", "quotation", "rfq", "price", "request", "tender", "কোটেশন", "দাম"],
    answerBn:
      "Quotation পেতে Request a Quote form-এ product name, SKU বা model search করে সঠিক পণ্যটি select করুন, quantity ও requirement দিন, তারপর submit করুন। Catalogue-এ পণ্য না থাকলে custom sourcing request-ও পাঠানো যায়।",
    answerEn:
      "To request a quotation, search and select the correct product in the Request a Quote form, add the quantity and requirements, then submit. You can also send a custom sourcing request when an item is not in the catalogue.",
  },
  {
    terms: ["source", "sourcing", "procurement", "china", "import", "delivery", "project", "সোর্সিং", "চীন", "ডেলিভারি"],
    answerBn:
      "SEN supplier discovery, technical product matching, quotation coordination এবং China থেকে project-based delivery support প্রদান করে। Availability ও delivery time product, quantity এবং destination অনুযায়ী নিশ্চিত করা হয়।",
    answerEn:
      "SEN supports supplier discovery, technical product matching, quotation coordination, and project-based delivery from China. Availability and delivery timing are confirmed according to the product, quantity, and destination.",
  },
  {
    terms: ["account", "order", "tracking", "serial", "invoice", "payment", "অর্ডার", "ইনভয়েস", "পেমেন্ট"],
    answerBn:
      "Customer account থেকে quotation, order, invoice, payment status এবং support messages দেখা যায়। Order/serial tracking page-এ SEN reference ব্যবহার করে delivery progress দেখা যায়।",
    answerEn:
      "Your customer account provides quotations, orders, invoices, payment status, and support messages. The order/serial tracking page can be used to follow delivery progress with an SEN reference.",
  },
  {
    terms: ["network", "networking", "server", "switch", "router", "olt", "fiber", "isp"],
    answerBn:
      "Networking category-তে server, switch, router, OLT, fiber-optic equipment, data-center এবং ISP infrastructure-এর পণ্য ও components অন্তর্ভুক্ত। নির্দিষ্ট model বা specification লিখলে আমি availability খুঁজে দেখতে পারি।",
    answerEn:
      "The Networking category includes servers, switches, routers, OLTs, fiber-optic equipment, data-center products, ISP infrastructure, and related components. Enter a specific model or specification and I can check availability.",
  },
];

export function searchWebsiteKnowledge(
  query: string,
): WebsiteKnowledgeResult | null {
  const normalized = normalizeProductSearch(query);
  const words = new Set(normalized.split(" "));
  const isQuestion =
    /\b(what|who|where|how|contact|about|category|categories|do you|can you)\b/i.test(
      query,
    ) || /[?？]|কি|কী|কিভাবে|কোথায়|কারা/.test(query);
  if (!isQuestion) return null;

  const ranked = entries
    .map((entry) => ({
      entry,
      score: entry.terms.reduce(
        (score, term) =>
          score + (normalized.includes(term) || words.has(term) ? 1 : 0),
        0,
      ),
    }))
    .sort((left, right) => right.score - left.score);
  if (!ranked[0]?.score) return null;

  return {
    matchType: "information",
    available: false,
    answerBn: ranked[0].entry.answerBn,
    answerEn: ranked[0].entry.answerEn,
  };
}
