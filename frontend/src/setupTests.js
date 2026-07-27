// jsdom does not provide TextEncoder/TextDecoder, which the cipher uses to get
// UTF-8 bytes for hashing. Browsers have had both for years; this only fills
// the gap under test.
import { TextEncoder, TextDecoder } from "util";

if (typeof global.TextEncoder === "undefined") {
  global.TextEncoder = TextEncoder;
}

if (typeof global.TextDecoder === "undefined") {
  global.TextDecoder = TextDecoder;
}
