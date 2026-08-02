export type ConfirmedProductReply = {
  name: string;
  price: string;
  availability: string;
  prompt: string;
};

type ConfirmedProductReplyInput = {
  name: string;
  price: number | null;
  priceMax: number | null;
  currency: string;
  available: boolean;
};

const whatsappPrompt = `Please enter your WhatsApp number with country code.

দেশের কোডসহ WhatsApp নম্বর লিখুন।`;

function formattedPrice(product: ConfirmedProductReplyInput) {
  if (product.price === null) {
    return "Price on request / মূল্য জানতে যোগাযোগ করুন";
  }

  const formatter = new Intl.NumberFormat("en-BD", { maximumFractionDigits: 2 });
  const start = formatter.format(product.price);
  if (product.priceMax !== null && product.priceMax > product.price) {
    return `${product.currency} ${start}–${formatter.format(product.priceMax)}`;
  }
  return `${product.currency} ${start}`;
}

export function buildConfirmedProductReply(
  product: ConfirmedProductReplyInput,
): ConfirmedProductReply {
  return {
    name: product.name,
    price: formattedPrice(product),
    availability: product.available
      ? "Available in Bangladesh / বাংলাদেশে পাওয়া যাচ্ছে"
      : "Available through SEN / SEN-এর মাধ্যমে পাওয়া যাবে",
    prompt: whatsappPrompt,
  };
}
