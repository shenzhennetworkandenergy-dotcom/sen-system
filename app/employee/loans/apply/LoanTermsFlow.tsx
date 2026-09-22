"use client";

import { useEffect, useState } from "react";

import { acceptLoanGuidanceAction } from "../actions";

type TermStep = {
  title: string;
  paragraphs?: string[];
  arabic?: string[];
  meaning?: string[];
  reference?: string;
  acknowledgement: string;
};

const steps: TermStep[] = [
  {
    title: "ঋণ গ্রহণের আগে গুরুত্বপূর্ণ নির্দেশনা",
    paragraphs: [
      "ঋণ গ্রহণ একটি গুরুত্বপূর্ণ আর্থিক ও নৈতিক দায়িত্ব। ইসলামে প্রয়োজনের ক্ষেত্রে ঋণ গ্রহণ বৈধ হলেও অপ্রয়োজনীয় ঋণ গ্রহণ থেকে বিরত থাকা এবং ঋণ গ্রহণের পর যথাসময়ে তা পরিশোধের ব্যাপারে সর্বোচ্চ গুরুত্ব দেওয়া হয়েছে।",
      "অতএব, ঋণের জন্য আবেদন করার পূর্বে আবেদনকারীকে নিজের আর্থিক সক্ষমতা, ঋণের প্রয়োজনীয়তা এবং নির্ধারিত সময়ে পরিশোধের সামর্থ্য সতর্কতার সঙ্গে বিবেচনা করতে হবে।",
    ],
    acknowledgement: "আমি উপরোক্ত নির্দেশনা পড়েছি ও বুঝেছি।",
  },
  {
    title: "কুরআনের নির্দেশনা — ঋণের লেনদেন লিখিতভাবে সংরক্ষণ",
    paragraphs: ["আল্লাহ তা‘আলা বলেন:"],
    arabic: ["يَـٰٓأَيُّهَا ٱلَّذِينَ ءَامَنُوٓا۟ إِذَا تَدَايَنتُم بِدَيْنٍ إِلَىٰٓ أَجَلٍۢ مُّسَمًّۭى فَٱكْتُبُوهُ ۚ وَلْيَكْتُب بَّيْنَكُمْ كَاتِبٌۢ بِٱلْعَدْلِ ۚ وَلَا يَأْبَ كَاتِبٌ أَن يَكْتُبَ كَمَا عَلَّمَهُ ٱللَّهُ ۚ فَلْيَكْتُبْ وَلْيُمْلِلِ ٱلَّذِى عَلَيْهِ ٱلْحَقُّ وَلْيَتَّقِ ٱللَّهَ رَبَّهُۥ وَلَا يَبْخَسْ مِنْهُ شَيْـًۭٔا ۚ فَإِن كَانَ ٱلَّذِى عَلَيْهِ ٱلْحَقُّ سَفِيهًا أَوْ ضَعِيفًا أَوْ لَا يَسْتَطِيعُ أَن يُمِلَّ هُوَ فَلْيُمْلِلْ وَلِيُّهُۥ بِٱلْعَدْلِ ۚ وَٱسْتَشْهِدُوا۟ شَهِيدَيْنِ مِن رِّجَالِكُمْ ۖ فَإِن لَّمْ يَكُونَا رَجُلَيْنِ فَرَجُلٌۭ وَٱمْرَأَتَانِ مِمَّن تَرْضَوْنَ مِنَ ٱلشُّهَدَآءِ أَن تَضِلَّ إِحْدَىٰهُمَا فَتُذَكِّرَ إِحْدَىٰهُمَا ٱلْأُخْرَىٰ ۚ وَلَا يَأْبَ ٱلشُّهَدَآءُ إِذَا مَا دُعُوا۟ ۚ وَلَا تَسْـَٔمُوٓا۟ أَن تَكْتُبُوهُ صَغِيرًا أَوْ كَبِيرًا إِلَىٰٓ أَجَلِهِۦ ۚ ذَٰلِكُمْ أَقْسَطُ عِندَ ٱللَّهِ وَأَقْوَمُ لِلشَّهَـٰدَةِ وَأَدْنَىٰٓ أَلَّا تَرْتَابُوٓا۟ ۖ إِلَّآ أَن تَكُونَ تِجَـٰرَةً حَاضِرَةًۭ تُدِيرُونَهَا بَيْنَكُمْ فَلَيْسَ عَلَيْكُمْ جُنَاحٌ أَلَّا تَكْتُبُوهَا ۗ وَأَشْهِدُوٓا۟ إِذَا تَبَايَعْتُمْ ۚ وَلَا يُضَآرَّ كَاتِبٌۭ وَلَا شَهِيدٌۭ ۚ وَإِن تَفْعَلُوا۟ فَإِنَّهُۥ فُسُوقٌۢ بِكُمْ ۗ وَٱتَّقُوا۟ ٱللَّهَ ۖ وَيُعَلِّمُكُمُ ٱللَّهُ ۗ وَٱللَّهُ بِكُلِّ شَىْءٍ عَلِيمٌۭ ٢٨٢"],
    meaning: ["হে বিশ্বাসীগণ! যখন তোমরা নির্দিষ্ট সময়ের জন্য ধারে কারবার করবে, তখন তা লিখে রাখবে, তোমাদের মধ্যে যেন কোনো একজন লেখক ন্যায্যভাবে লিখে দেয়। লেখক যেন লিখতে অস্বীকার না করে, যেরূপ আল্লাহ তাকে শিক্ষা দিয়েছেন; কাজেই সে যেন লিখে এবং ঋণগ্রহীতা যেন লেখার বিষয়বস্তু বলে দেয়, তার প্রতিপালক আল্লাহকে ভয় করে এবং প্রাপ্য থেকে কোনো কিছু কম না করে। ঋণগ্রহীতা যদি স্বল্পবুদ্ধি, দুর্বল অথবা লেখার বিষয়বস্তু বলতে অক্ষম হয়, তবে তার অভিভাবক যেন ন্যায্যভাবে বলে দেয়। তোমাদের পুরুষদের মধ্য থেকে দুজন সাক্ষী রাখ; দুজন পুরুষ না পাওয়া গেলে একজন পুরুষ ও দুজন নারী—যাদের সাক্ষ্য সম্পর্কে তোমরা সন্তুষ্ট—যাতে একজন ভুলে গেলে অন্যজন স্মরণ করিয়ে দেয়। সাক্ষীদের ডাকা হলে তারা যেন অস্বীকার না করে। ঋণ ছোট হোক বা বড়, নির্দিষ্ট মেয়াদসহ তা লিখতে অবহেলা করো না। এটি আল্লাহর কাছে অধিক ন্যায়সঙ্গত, সাক্ষ্যের জন্য অধিক দৃঢ় এবং সন্দেহে না পড়ার অধিক নিকটবর্তী। তবে তোমরা পরস্পর হাতে হাতে যে নগদ ব্যবসা করো, তা না লিখলে কোনো দোষ নেই। কেনাবেচার সময় সাক্ষী রাখো। লেখক বা সাক্ষী যেন ক্ষতিগ্রস্ত না হয়; তা করলে তোমাদের পাপ হবে। আল্লাহকে ভয় করো। আল্লাহ তোমাদের শিক্ষা দেন এবং আল্লাহ সব বিষয়ে সর্বজ্ঞ।"],
    reference: "সূরা আল-বাকারাহ, ২:২৮২",
    acknowledgement: "আমি ঋণের শর্ত লিখিত ও স্পষ্ট রাখার নির্দেশনা বুঝেছি।",
  },
  {
    title: "কুরআনের নির্দেশনা — ঋণগ্রহীতা প্রকৃতপক্ষে অসচ্ছল হলে",
    arabic: ["وَإِنْ كَانَ ذُو عُسْرَةٍ فَنَظِرَةٌ إِلَىٰ مَيْسَرَةٍ"],
    meaning: ["“আর ঋণগ্রহীতা যদি অভাবগ্রস্ত হয়, তবে সচ্ছলতা আসা পর্যন্ত তাকে সময় দাও।”"],
    reference: "সূরা আল-বাকারাহ, ২:২৮০",
    acknowledgement: "আমি উপরোক্ত কুরআনিক নির্দেশনা পড়েছি ও বুঝেছি।",
  },
  {
    title: "হাদিস — ঋণের বোঝা থেকে আল্লাহর আশ্রয় প্রার্থনা",
    paragraphs: ["রাসূলুল্লাহ ﷺ দোয়া করতেন:"],
    arabic: [
      "اللَّهُمَّ إِنِّي أَعُوذُ بِكَ مِنَ الْمَأْثَمِ وَالْمَغْرَمِ",
      "إِنَّ الرَّجُلَ إِذَا غَرِمَ حَدَّثَ فَكَذَبَ، وَوَعَدَ فَأَخْلَفَ",
    ],
    meaning: [
      "“হে আল্লাহ! আমি আপনার কাছে পাপ এবং ঋণের বোঝা থেকে আশ্রয় চাই।”",
      "তাঁকে ঋণ থেকে এত বেশি আশ্রয় চাওয়ার কারণ জিজ্ঞেস করা হলে তিনি বলেন: “মানুষ যখন ঋণগ্রস্ত হয়, তখন কথা বলতে গিয়ে মিথ্যা বলে এবং প্রতিশ্রুতি দিয়ে তা ভঙ্গ করে।”",
    ],
    reference: "সহিহ আল-বুখারি, হাদিস ২৩৯৭",
    acknowledgement: "আমি ঋণের নৈতিক ঝুঁকি ও দায় সম্পর্কে সতর্কতাটি বুঝেছি।",
  },
  {
    title: "হাদিস — ঋণের গুরুতর দায়",
    arabic: ["يُغْفَرُ لِلشَّهِيدِ كُلُّ ذَنْبٍ إِلَّا الدَّيْنَ"],
    meaning: ["“শহীদের সকল গুনাহ ক্ষমা করা হয়—ঋণ ব্যতীত।”"],
    reference: "সহিহ মুসলিম, হাদিস ১৮৮৬",
    acknowledgement: "আমি ঋণ পরিশোধের গুরুতর দায় সম্পর্কে পড়েছি ও বুঝেছি।",
  },
  {
    title: "হাদিস — ঋণ পরিশোধের আন্তরিক নিয়ত",
    arabic: ["مَنْ أَخَذَ أَمْوَالَ النَّاسِ يُرِيدُ أَدَاءَهَا أَدَّى اللَّهُ عَنْهُ، وَمَنْ أَخَذَ يُرِيدُ إِتْلَافَهَا أَتْلَفَهُ اللَّهُ"],
    meaning: ["“যে ব্যক্তি মানুষের সম্পদ গ্রহণ করে তা পরিশোধ করার ইচ্ছায়, আল্লাহ তার পক্ষ থেকে তা পরিশোধের ব্যবস্থা করেন। আর যে তা নষ্ট করার উদ্দেশ্যে গ্রহণ করে, আল্লাহ তাকে ধ্বংস করেন।”"],
    reference: "সহিহ আল-বুখারি, হাদিস ২৩৮৭",
    acknowledgement: "আমি ঋণ পরিশোধের আন্তরিক নিয়ত ও দায়বদ্ধতা স্বীকার করছি।",
  },
  {
    title: "ঋণের পরিমাণ",
    paragraphs: ["আবেদনকারী যে পরিমাণ ঋণের জন্য আবেদন করবেন, সেটিই স্বয়ংক্রিয়ভাবে অনুমোদিত বলে গণ্য হবে না। কোম্পানি আবেদনকারীর প্রয়োজন, চাকরির অবস্থা, আর্থিক সক্ষমতা এবং প্রযোজ্য নীতিমালা বিবেচনা করে সম্পূর্ণ বা আংশিক পরিমাণ অনুমোদন অথবা আবেদন প্রত্যাখ্যান করতে পারবে।"],
    acknowledgement: "আমি এই শর্তটি পড়েছি, বুঝেছি এবং সম্মত আছি।",
  },
  {
    title: "পরিশোধের অঙ্গীকার",
    paragraphs: ["অনুমোদিত ঋণ গ্রহণের পর আবেদনকারী নির্ধারিত সময়সূচি ও চূড়ান্ত চুক্তি অনুযায়ী ঋণ পরিশোধের দায়িত্ব গ্রহণ করবেন।"],
    acknowledgement: "আমি এই শর্তটি পড়েছি, বুঝেছি এবং সম্মত আছি।",
  },
  {
    title: "সাক্ষী প্রদান ও চুক্তির সাক্ষ্য নিশ্চিতকরণ",
    paragraphs: [
      "ঋণের চুক্তি লিখিতভাবে সম্পন্ন করার সময় সাক্ষীর বিষয়টি গুরুত্বের সঙ্গে পালন করা হবে।",
      "সূরা আল-বাকারাহ ২:২৮২-এর নির্দেশনার আলোকে, সাক্ষ্য গ্রহণের ক্ষেত্রে দুইজন পুরুষ সাক্ষী রাখা হবে; আর দুইজন পুরুষ সাক্ষী পাওয়া সম্ভব না হলে একজন পুরুষ এবং দুইজন নারী সাক্ষীর ব্যবস্থা করা হবে।",
      "ঋণের আবেদনকারী হিসেবে আমি আমার পক্ষ থেকে প্রয়োজনীয় বিশ্বস্ত সাক্ষী সংগ্রহ ও উপস্থিত করার দায়িত্ব গ্রহণ করছি।",
      "প্রয়োজনীয় সাক্ষী নির্বাচন, তাদের সম্মতি গ্রহণ এবং চূড়ান্ত ঋণ চুক্তিতে সাক্ষ্য/স্বাক্ষরের জন্য উপস্থিত করার দায়িত্ব আমি যথাসম্ভব নিজ দায়িত্বে সম্পন্ন করব।",
      "আমি বুঝেছি যে সাক্ষী ব্যবস্থাটি চূড়ান্ত Loan Agreement/ঋণ চুক্তির অংশ হবে এবং Admin/কর্তৃপক্ষ চুক্তি সম্পন্ন করার পূর্বে সাক্ষীর তথ্য যাচাই করতে পারবেন।",
    ],
    reference: "সূরা আল-বাকারাহ, ২:২৮২",
    acknowledgement: "আমি সাক্ষী সংক্রান্ত উপরোক্ত নির্দেশনা পড়েছি ও বুঝেছি এবং চূড়ান্ত ঋণ চুক্তির জন্য প্রয়োজনীয় সাক্ষী নিজ দায়িত্বে সংগ্রহ ও উপস্থিত করার বিষয়ে সম্মত আছি।",
  },
  {
    title: "চূড়ান্ত অনুমোদিত শর্ত",
    paragraphs: ["আবেদনপত্রে আবেদনকারীর প্রস্তাবিত পরিমাণ, সময়সীমা বা কিস্তির উল্লেখ কোম্পানির চূড়ান্ত অনুমোদন হিসেবে গণ্য হবে না। সংশ্লিষ্ট Admin/কর্তৃপক্ষ কর্তৃক অনুমোদিত এবং উভয় পক্ষ কর্তৃক গৃহীত চূড়ান্ত শর্তাবলিই কার্যকর হবে।"],
    acknowledgement: "আমি এই শর্তটি পড়েছি, বুঝেছি এবং সম্মত আছি।",
  },
  {
    title: "বেতন/প্রাপ্য অর্থ থেকে ভবিষ্যৎ কিস্তি কর্তন",
    paragraphs: ["চূড়ান্ত ঋণ চুক্তিতে এ ধরনের ব্যবস্থা অন্তর্ভুক্ত এবং প্রযোজ্য আইন ও কোম্পানির নীতিমালা অনুযায়ী অনুমোদিত হলে, আবেদনকারীর সম্মতিতে ভবিষ্যৎ বেতন/প্রাপ্য অর্থ থেকে নির্ধারিত কিস্তি কর্তন করা হতে পারে।"],
    acknowledgement: "আমি এই শর্তটি পড়েছি, বুঝেছি এবং সম্মত আছি।",
  },
  {
    title: "সঠিক তথ্য প্রদানের বাধ্যবাধকতা",
    paragraphs: ["আবেদনকারীকে ঋণের আবেদনে সত্য, সঠিক ও পূর্ণাঙ্গ তথ্য প্রদান করতে হবে। মিথ্যা, বিভ্রান্তিকর বা গুরুত্বপূর্ণ তথ্য গোপন করা হয়েছে বলে প্রমাণিত হলে কোম্পানি আবেদনটি প্রত্যাখ্যান অথবা প্রযোজ্য নীতিমালা ও চুক্তি অনুযায়ী পরবর্তী ব্যবস্থা গ্রহণ করতে পারবে।"],
    acknowledgement: "আমি এই শর্তটি পড়েছি, বুঝেছি এবং সম্মত আছি।",
  },
  {
    title: "আবেদন মানেই ঋণ অনুমোদন নয়",
    paragraphs: ["এই ফর্ম পূরণ ও জমা দেওয়া ঋণ পাওয়ার নিশ্চয়তা সৃষ্টি করবে না। ঋণ অনুমোদন সম্পূর্ণভাবে কোম্পানির প্রযোজ্য নীতিমালা ও অনুমোদন প্রক্রিয়ার অধীন থাকবে।"],
    acknowledgement: "আমি এই শর্তটি পড়েছি, বুঝেছি এবং সম্মত আছি।",
  },
  {
    title: "চূড়ান্ত চুক্তির বাধ্যবাধকতা",
    paragraphs: ["ঋণ অনুমোদিত হলে ঋণের পরিমাণ, পরিশোধের সময়সীমা, কিস্তি, কর্তনের পদ্ধতি এবং অন্যান্য প্রযোজ্য শর্ত চূড়ান্ত ঋণ চুক্তিতে উল্লেখ করা হবে। আবেদনকারী চুক্তিটি পড়ে ও বুঝে সম্মতি দেওয়ার পরই সেই চুক্তির শর্তাবলি তার জন্য বাধ্যতামূলক হবে।"],
    acknowledgement: "আমি এই শর্তটি পড়েছি, বুঝেছি এবং সম্মত আছি।",
  },
];

const finalConsents = [
  ["final_guidance", "আমি ঋণ সংক্রান্ত উপরোক্ত নির্দেশনা ও সতর্কতাগুলো পড়েছি এবং বুঝেছি।"],
  ["final_repayment", "আমি অনুমোদিত ঋণ নির্ধারিত শর্ত ও সময় অনুযায়ী পরিশোধের দায়িত্ব স্বীকার করছি।"],
  ["final_authoritative_terms", "আমি বুঝেছি যে আমার আবেদনে উল্লেখিত শর্ত স্বয়ংক্রিয়ভাবে অনুমোদিত নয়; Admin/কর্তৃপক্ষ কর্তৃক অনুমোদিত এবং চূড়ান্তভাবে গৃহীত শর্তই কার্যকর হবে।"],
  ["final_salary_deduction", "আমি বুঝেছি যে চূড়ান্ত চুক্তি ও প্রযোজ্য নিয়ম অনুযায়ী আমার সম্মতিতে ভবিষ্যৎ বেতন/প্রাপ্য অর্থ থেকে ঋণের কিস্তি কর্তন করা হতে পারে।"],
  ["final_accuracy", "আমি নিশ্চিত করছি যে ঋণ আবেদনে আমার দেওয়া সকল তথ্য আমার জ্ঞান ও বিশ্বাস অনুযায়ী সত্য, সঠিক ও পূর্ণাঙ্গ।"],
  ["final_no_guarantee", "আমি বুঝেছি যে আবেদন জমা দেওয়া ঋণ অনুমোদনের নিশ্চয়তা নয় এবং কোম্পানি প্রযোজ্য নীতিমালা অনুযায়ী আবেদন অনুমোদন, আংশিক অনুমোদন বা প্রত্যাখ্যান করতে পারে।"],
  ["final_witness", "আমি বুঝেছি যে চূড়ান্ত ঋণ চুক্তির জন্য প্রয়োজনীয় সাক্ষী সংগ্রহ ও উপস্থিত করার দায়িত্ব আমার থাকবে এবং সাক্ষীর তথ্য/স্বাক্ষর চূড়ান্ত চুক্তির অংশ হতে পারে।"],
] as const;

function readingSeconds(step: TermStep) {
  const text = [step.title, ...(step.paragraphs ?? []), ...(step.arabic ?? []), ...(step.meaning ?? []), step.reference ?? ""].join(" ");
  return Math.min(30, Math.max(5, Math.ceil(text.length / 18)));
}

export function LoanTermsFlow({ error }: { error?: string }) {
  const [current, setCurrent] = useState(0);
  const [accepted, setAccepted] = useState<boolean[]>(() => steps.map(() => false));
  const [finalAccepted, setFinalAccepted] = useState<boolean[]>(() => finalConsents.map(() => false));
  const isFinal = current === steps.length;
  const [remaining, setRemaining] = useState(() => readingSeconds(steps[0]));

  useEffect(() => {
    if (remaining <= 0) return;
    const timer = window.setInterval(() => setRemaining((value) => Math.max(0, value - 1)), 1000);
    return () => window.clearInterval(timer);
  }, [remaining]);

  const timer = `00:${String(remaining).padStart(2, "0")}`;
  const allFinal = finalAccepted.every(Boolean);
  const step = isFinal ? null : steps[current];
  const goBack = () => {
    const target = Math.max(0, current - 1);
    setCurrent(target);
    setRemaining(accepted[target] ? 0 : readingSeconds(steps[target]));
  };
  const goNext = () => {
    const target = Math.min(steps.length, current + 1);
    setCurrent(target);
    setRemaining(target === steps.length ? 10 : accepted[target] ? 0 : readingSeconds(steps[target]));
  };

  return <div className="mx-auto max-w-4xl space-y-5 rounded-2xl border bg-white p-6 shadow-sm">
    {error ? <p className="rounded-lg bg-red-50 p-3 text-red-800">{error}</p> : null}
    <div className="flex items-center justify-between gap-4 text-sm font-semibold text-slate-600">
      <span>{isFinal ? "চূড়ান্ত পর্যালোচনা" : `ধাপ ${current + 1} / ${steps.length}`}</span>
      <span>{Math.round(((current + 1) / (steps.length + 1)) * 100)}% সম্পন্ন</span>
    </div>
    <div className="h-2 overflow-hidden rounded-full bg-slate-200"><div className="h-full bg-blue-800 transition-all" style={{ width: `${((current + 1) / (steps.length + 1)) * 100}%` }} /></div>

    {!isFinal && step ? <article className="space-y-5">
      <h2 className="text-2xl font-bold text-slate-900">{step.title}</h2>
      {step.paragraphs?.map((paragraph) => <p key={paragraph} className="leading-8 text-slate-700">{paragraph}</p>)}
      {step.arabic?.map((arabic, index) => <div key={arabic} className="space-y-3 rounded-xl border border-emerald-200 bg-emerald-50 p-5">
        <p dir="rtl" lang="ar" className="text-right text-2xl font-semibold leading-loose">{arabic}</p>
        {step.meaning?.[index] ? <><p className="font-semibold">বাংলা অর্থ:</p><p className="leading-8">{step.meaning[index]}</p></> : null}
      </div>)}
      {step.reference ? <p className="rounded-lg bg-slate-100 p-3"><span className="font-semibold">রেফারেন্স:</span> {step.reference}</p> : null}
      {remaining > 0 ? <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-center">
        <p>এই অংশটি পড়ুন — পরবর্তী ধাপ {remaining} সেকেন্ড পরে চালু হবে</p>
        <p className="mt-2 font-mono text-3xl font-bold text-amber-900">{timer}</p>
      </div> : <label className="flex items-start gap-3 rounded-xl border bg-slate-50 p-4">
        <input type="checkbox" className="mt-1" checked={accepted[current]} onChange={(event) => setAccepted((items) => items.map((value, index) => index === current ? event.target.checked : value))} />
        <span>{step.acknowledgement}</span>
      </label>}
    </article> : <form action={acceptLoanGuidanceAction} className="space-y-5">
      <div>
        <h2 className="text-2xl font-bold">সকল Terms/Conditions-এর সারসংক্ষেপ</h2>
        <p className="mt-2 text-slate-600">আবেদনে যাওয়ার আগে প্রতিটি নির্দেশনা ও শর্তের প্রতি আপনার চূড়ান্ত সম্মতি আলাদাভাবে নিশ্চিত করুন।</p>
      </div>
      <div className="grid gap-3 md:grid-cols-2">{steps.map((item, index) => <section key={item.title} className="rounded-xl border p-4"><p className="text-xs font-bold text-blue-800">ধাপ {index + 1}</p><h3 className="mt-1 font-bold">{item.title}</h3><p className="mt-2 text-sm text-slate-600">{item.acknowledgement}</p><input type="hidden" name={`term_${String(index + 1).padStart(2, "0")}`} value="on" /></section>)}</div>
      {remaining > 0 ? <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-center"><p>সারসংক্ষেপটি পড়ুন — চূড়ান্ত সম্মতি {remaining} সেকেন্ড পরে চালু হবে</p><p className="mt-2 font-mono text-3xl font-bold text-amber-900">{timer}</p></div> : <div className="space-y-3 rounded-xl border bg-slate-50 p-5">{finalConsents.map(([name, label], index) => <label key={name} className="flex items-start gap-3"><input type="checkbox" className="mt-1" name={name} required checked={finalAccepted[index]} onChange={(event) => setFinalAccepted((items) => items.map((value, itemIndex) => itemIndex === index ? event.target.checked : value))} /><span>{label}</span></label>)}</div>}
      <div className="flex flex-wrap gap-3"><button type="button" onClick={goBack} className="rounded-lg border px-5 py-2.5 font-semibold">Back</button><button disabled={remaining > 0 || !allFinal} className="rounded-lg bg-blue-800 px-5 py-2.5 font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40">Agree &amp; Continue to Application</button></div>
    </form>}

    {!isFinal ? <div className="flex justify-between gap-3"><button type="button" disabled={current === 0} onClick={goBack} className="rounded-lg border px-5 py-2.5 font-semibold disabled:opacity-40">Back</button><button type="button" disabled={!accepted[current]} onClick={goNext} className="rounded-lg bg-blue-800 px-5 py-2.5 font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40">Next</button></div> : null}
  </div>;
}
