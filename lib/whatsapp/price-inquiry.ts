export type WhatsappPriceProduct = {
  name: string;
  sku: string;
  model_number: string | null;
  slug: string;
  product_type: string;
  currency: string;
  regular_price: number | string | null;
  sale_price: number | string | null;
};

const hardDrive = /(?:\bhdd\b|\bhard\s*(?:disk|drive)\b|হার্ড\s*(?:ডিস্ক|ড্রাইভ)(?:ের)?)/iu;
const priceQuestion = /(?:\b(?:price|cost|how much)\b|দাম|মূল্য|প্রাইস|কত (?:টাকা|পড়বে|পড়বে))/iu;
const priceAnswer = /(?:https?:\/\/|\bBDT\b|৳)/iu;
const capacityPattern = /(?<![\p{L}\p{N}])(\d+)\s*(tb|gb|টিবি|জিবি)(?![\p{L}\p{N}])/giu;

function searchText(value: string) {
  return value.normalize("NFKC").toLowerCase().replace(/[০-৯]/g, (digit) => String("০১২৩৪৫৬৭৮৯".indexOf(digit)));
}

function capacities(value: string) {
  return [...new Set([...value.matchAll(capacityPattern)].map((match) =>
    match[1] + (/^(?:tb|টিবি)$/i.test(match[2]) ? "tb" : "gb")))];
}

const filler = new Set([
  "hi", "hello", "dear", "sir", "bro", "please", "tell", "me", "your", "confirm", "can", "you", "send",
  "the", "a", "an", "of", "for", "is", "what", "s", "how", "much", "price", "cost", "details", "current", "any",
  "দাম", "মূল্য", "প্রাইস", "কত", "টাকা", "ভাই", "হ্যালো", "কী", "কি", "আছে", "বলুন", "বলবেন", "জানান", "এর",
  "একটি", "একটা", "পড়বে", "পড়বে",
]);

function words(value: string) {
  return value.match(/[\p{L}\p{M}\p{N}]+/gu) ?? [];
}

export function isWhatsappPriceInquiry(value: string) {
  return value.length <= 240 && priceQuestion.test(value) && !priceAnswer.test(value);
}

export function exactWhatsappPriceMatch(query: string, products: WhatsappPriceProduct[]) {
  if (!isWhatsappPriceInquiry(query)) return null;
  const text = searchText(query);
  const requested = capacities(text);
  if (requested.length > 1 || /\b(?:or|either|compare|versus|and|vs)\b|অথবা|নাকি/.test(text)) return null;
  const hasDisk = hardDrive.test(text);
  const qualifiers = words(text.replace(capacityPattern, " ").replace(new RegExp(hardDrive.source, "giu"), " "))
    .filter((word) => !filler.has(word));
  const candidates = products.filter((product) => {
    const name = searchText([product.name, product.sku, product.model_number].filter(Boolean).join(" "));
    const model = [product.sku, product.model_number].filter((part): part is string => Boolean(part?.trim()))
      .map((part) => searchText(part.trim()))
      .filter((part) => part.length >= 4 && /\d/.test(part));
    const explicitModel = model.some((part) => {
      const escaped = part.replace(/[.*+?^\x24{}()|[\]\\]/g, "\\\x24&");
      return new RegExp("(?<![\\p{L}\\p{N}-])" + escaped + "(?![\\p{L}\\p{N}-])", "u").test(text);
    });
    if (!explicitModel && !(hasDisk && requested.length === 1)) return false;
    if (hasDisk && !hardDrive.test(name)) return false;
    const listedCapacities = capacities(name);
    if (requested.length && !listedCapacities.includes(requested[0])
      && !(product.product_type === "variable" && !listedCapacities.length)) return false;
    const catalogueWords = new Set(words(name));
    return qualifiers.every((qualifier) => catalogueWords.has(qualifier));
  });
  if (candidates.length !== 1) return null;
  const product = candidates[0];
  if (product.product_type !== "simple" || product.currency !== "BDT") return null;
  if (requested.length && capacities(searchText(product.name)).length > 1) return null;
  const price = Number(product.sale_price ?? product.regular_price);
  return Number.isFinite(price) && price > 0 ? { product, price } : null;
}

export function whatsappPriceText(product: { name: string; slug: string }, price: number, bengali = false) {
  const amount = new Intl.NumberFormat("en-BD", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(price);
  const url = "https://www.sen.com.bd/products/" + encodeURIComponent(product.slug);
  return bengali
    ? product.name + " — বর্তমান ক্যাটালগ মূল্য BDT " + amount + "।\n" + url + "\nকোটেশন বা স্টক জানতে এখানে রিপ্লাই করুন।"
    : product.name + " — current catalogue price BDT " + amount + ".\n" + url + "\nReply here for a quotation or stock confirmation.";
}
