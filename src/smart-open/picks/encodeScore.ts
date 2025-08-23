// const charset = '<>:"/\\|?*'; // Valid characters for encoding
// const base = charset.length; // Base is the length of charset

// const charset =
//   "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
// const base = charset.length; // 62

// const charset =
//   "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
// const base = charset.length; // 62

// const charset = "0123456789";
// 123456789
const charset = "0123456789";
// const charset = "¹²³⁴⁵⁶⁷⁸⁹";
// const charset = '¹²³⁰⁴⁵⁶⁷⁸⁹';
// const charset = 'ʰʲᵃᵇᵈᵉᵍᵏᶜᶠ';
const base = charset.length; // 62

export function encodeScore(num: number, minLength: number): string {
  console.log(num, minLength);
  // Ensure num is non-negative and base is valid
  if (num < 0) {
    throw new Error("encodeScore received a negative number");
  }

  if (base <= 0) {
    throw new Error("Base must be greater than 0");
  }

  let encoded = "";

  // Loop to encode the number in the given base
  do {
    const remainder = num % base;

    // Ensure remainder is a valid index in the charset
    if (remainder < 0 || remainder >= base) {
      throw new RangeError(`Invalid remainder value: ${remainder}`);
    }
    // Check for very large numbers causing runaway loops
    if (encoded.length > 1000) {
      console.log(encoded);
      throw new RangeError("Encoded string length exceeded 1000 characters.");
    }
    console.log(remainder, charset[remainder]);
    encoded = charset[remainder] + encoded;
    num = Math.floor(num / base);
  } while (num > 0);

  // Pad with the first character ('<') to ensure consistent length
  while (encoded.length < minLength) {
    encoded = charset[0] + encoded; // Pad with the first character of charset
  }

  return encoded;
}