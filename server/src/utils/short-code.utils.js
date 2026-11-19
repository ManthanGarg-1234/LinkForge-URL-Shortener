
import { randomBytes } from "node:crypto";

const CHARACTERS =
  "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";

const CODE_LENGTH = 8;
const ACCEPTED_BYTE_LIMIT = 248;

export function generateShortCode() {
  let code = "";

  while (code.length < CODE_LENGTH) {
    const bytes = randomBytes(CODE_LENGTH);

    for (const byte of bytes) {
      if (byte >= ACCEPTED_BYTE_LIMIT) {
        continue;
      }

      code += CHARACTERS[byte % CHARACTERS.length];

      if (code.length === CODE_LENGTH) {
        break;
      }
    }
  }

  return code;
}
