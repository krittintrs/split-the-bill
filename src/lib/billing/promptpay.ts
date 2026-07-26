// EMVCo Merchant-Presented Mode / Bank of Thailand PromptPay QR payload (ADR-0009).
// Pure: (id, satang) -> deterministic EMV string. Golden-vector tested.

function tlv(id: string, value: string): string {
  const len = value.length.toString().padStart(2, "0");
  return `${id}${len}${value}`;
}

/** CRC-16/CCITT-FALSE: poly 0x1021, init 0xFFFF, computed over the string incl. "6304". */
function crc16(input: string): string {
  let crc = 0xffff;
  for (let i = 0; i < input.length; i++) {
    crc ^= input.charCodeAt(i) << 8;
    for (let b = 0; b < 8; b++) {
      crc = crc & 0x8000 ? (crc << 1) ^ 0x1021 : crc << 1;
      crc &= 0xffff;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, "0");
}

function merchantAccount(id: string): string {
  const digits = id.replace(/\D/g, "");
  if (digits.length !== id.length) throw new Error("id must be digits only");
  const aid = tlv("00", "A000000677010111");
  let target: string;
  if (id.length === 10) {
    // phone: drop leading 0, prefix country code 66, pad to 13 -> sub-tag 01
    target = tlv("01", ("0066" + id.replace(/^0/, "")).padStart(13, "0"));
  } else if (id.length === 13) {
    target = tlv("02", id); // national / tax ID
  } else if (id.length === 15) {
    target = tlv("03", id); // e-wallet
  } else {
    throw new Error("id must be 10, 13, or 15 digits");
  }
  return tlv("29", aid + target);
}

export function buildPromptPayPayload(id: string, satang?: number): string {
  const hasAmount = satang !== undefined;
  if (hasAmount && (!Number.isInteger(satang) || (satang as number) <= 0))
    throw new Error("satang must be a positive integer");
  const body =
    tlv("00", "01") +
    tlv("01", hasAmount ? "12" : "11") + // 12 = dynamic (amount), 11 = static
    merchantAccount(id) +
    tlv("58", "TH") +
    tlv("53", "764") + // THB
    (hasAmount ? tlv("54", ((satang as number) / 100).toFixed(2)) : "");
  const withCrcTag = body + "6304";
  return withCrcTag + crc16(withCrcTag);
}
