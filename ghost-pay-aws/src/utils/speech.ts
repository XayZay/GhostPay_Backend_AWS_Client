/**
 * Number-to-words conversion for Nigerian Naira speech output.
 * Used by YarnGPT to generate voice confirmations.
 */

const numberWordsUnderThousand = (amount: number): string => {
  const ones = [
    "zero", "one", "two", "three", "four", "five", "six", "seven", "eight",
    "nine", "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen",
    "sixteen", "seventeen", "eighteen", "nineteen",
  ];
  const tens = [
    "", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy",
    "eighty", "ninety",
  ];

  if (amount < 20) {
    return ones[amount];
  }

  if (amount < 100) {
    const ten = Math.floor(amount / 10);
    const unit = amount % 10;
    return unit ? `${tens[ten]} ${ones[unit]}` : tens[ten];
  }

  const hundred = Math.floor(amount / 100);
  const rest = amount % 100;
  return rest
    ? `${ones[hundred]} hundred ${numberWordsUnderThousand(rest)}`
    : `${ones[hundred]} hundred`;
};

export const numberToWords = (amount: number): string => {
  if (amount === 0) {
    return "zero";
  }

  const scales = [
    { value: 1_000_000_000, label: "billion" },
    { value: 1_000_000, label: "million" },
    { value: 1_000, label: "thousand" },
  ];
  const parts: string[] = [];
  let remaining = amount;

  for (const scale of scales) {
    const count = Math.floor(remaining / scale.value);
    if (count > 0) {
      parts.push(`${numberWordsUnderThousand(count)} ${scale.label}`);
      remaining %= scale.value;
    }
  }

  if (remaining > 0) {
    parts.push(numberWordsUnderThousand(remaining));
  }

  return parts.join(" ");
};

export const formatAmountForSpeech = (amount: number): string => {
  const words = `${numberToWords(Math.round(amount))} naira`;
  return words.charAt(0).toUpperCase() + words.slice(1);
};
