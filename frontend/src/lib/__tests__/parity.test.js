/**
 * Parity tests: the browser port must reproduce the Python reference exactly.
 *
 * Regenerate the fixtures with:
 *     cd backend && python golden_vectors.py
 */

import {
  MusicCipher,
  buildScale,
  safeVowelDegrees,
} from "../cipher";
import {
  notesToAbcNotation,
  generateWebAudioJson,
  generateHarmonicWebAudioJson,
} from "../musicConverter";

import vectors from "../__fixtures__/goldenVectors.json";

/**
 * Report the first few mismatches rather than dying on case 1 of 990, so a
 * failure shows whether it is one edge case or the whole mapping.
 */
function expectAllMatch(label, check) {
  const failures = [];

  vectors.cases.forEach((testCase, i) => {
    try {
      check(testCase);
    } catch (error) {
      if (failures.length < 3) {
        failures.push(
          `case ${i} (text=${JSON.stringify(testCase.text)} key=${JSON.stringify(
            testCase.key
          )} tonic=${testCase.tonic} mode=${testCase.mode}):\n${error.message}`
        );
      }
    }
  });

  if (failures.length > 0) {
    throw new Error(`${label} mismatched:\n\n${failures.join("\n\n")}`);
  }
}

function cipherFor(testCase) {
  return new MusicCipher(testCase.key, testCase.tonic, testCase.mode);
}

describe("golden vectors", () => {
  it("loads a meaningful number of cases", () => {
    expect(vectors.cases.length).toBeGreaterThan(100);
    expect(vectors.scales.length).toBeGreaterThan(0);
  });
});

describe("key building", () => {
  it("builds the same scale for every tonic and mode", () => {
    vectors.scales.forEach(entry => {
      expect(buildScale(entry.tonic, entry.mode)).toEqual(entry.scale);
    });
  });

  it("picks the same clash-free vowel degrees", () => {
    vectors.scales.forEach(entry => {
      expect(safeVowelDegrees(entry.mode)).toEqual(entry.safe_vowel_degrees);
    });
  });

  it("derives the same scale inside the cipher", () => {
    expectAllMatch("cipher scale", testCase => {
      expect(cipherFor(testCase).scale).toEqual(testCase.scale);
    });
  });
});

describe("encryption", () => {
  it("produces identical note objects", () => {
    expectAllMatch("notes", testCase => {
      expect(cipherFor(testCase).textToNotes(testCase.text)).toEqual(
        testCase.notes
      );
    });
  });

  it("produces identical formatted sequences", () => {
    expectAllMatch("note_sequence_text", testCase => {
      const notes = cipherFor(testCase).textToNotes(testCase.text);
      expect(MusicCipher.formatNoteSequence(notes)).toBe(
        testCase.note_sequence_text
      );
    });
  });
});

describe("decryption", () => {
  it("parses formatted sequences identically", () => {
    expectAllMatch("parsed_sequence", testCase => {
      expect(MusicCipher.parseNoteSequence(testCase.note_sequence_text)).toEqual(
        testCase.parsed_sequence
      );
    });
  });

  it("recovers the same text from note objects", () => {
    expectAllMatch("decrypted_from_notes", testCase => {
      const cipher = cipherFor(testCase);
      expect(cipher.notesToText(testCase.notes)).toBe(
        testCase.decrypted_from_notes
      );
    });
  });

  it("recovers the same text from a parsed sequence", () => {
    expectAllMatch("decrypted_from_parsed", testCase => {
      const cipher = cipherFor(testCase);
      const parsed = MusicCipher.parseNoteSequence(testCase.note_sequence_text);
      expect(cipher.notesToText(parsed)).toBe(testCase.decrypted_from_parsed);
    });
  });

  it("round-trips through the full encode/decode path", () => {
    expectAllMatch("round trip", testCase => {
      const cipher = cipherFor(testCase);
      const notes = cipher.textToNotes(testCase.text);
      const sequence = MusicCipher.formatNoteSequence(notes);
      const parsed = MusicCipher.parseNoteSequence(sequence);
      expect(cipher.notesToText(parsed)).toBe(testCase.decrypted_from_parsed);
    });
  });
});

describe("music conversion", () => {
  it("produces identical ABC notation", () => {
    expectAllMatch("abc_notation", testCase => {
      expect(notesToAbcNotation(testCase.notes)).toBe(testCase.abc_notation);
    });
  });

  it("produces identical web audio JSON", () => {
    expectAllMatch("web_audio", testCase => {
      expect(JSON.parse(generateWebAudioJson(testCase.notes))).toEqual(
        testCase.web_audio
      );
    });
  });

  it("produces identical harmonic web audio JSON", () => {
    expectAllMatch("web_audio_harmonic", testCase => {
      expect(JSON.parse(generateHarmonicWebAudioJson(testCase.notes))).toEqual(
        testCase.web_audio_harmonic
      );
    });
  });
});
