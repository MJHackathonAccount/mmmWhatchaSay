/**
 * Text-to-Music Cipher - browser port of backend/cipher.py
 *
 * This is a byte-for-byte port of the Python reference implementation. A
 * melody encoded by either side has to decode on the other, so the quirks are
 * deliberate: Python's floor division, its positive modulo on negatives, and
 * its dict insertion order all have explicit equivalents below.
 *
 * backend/golden_vectors.py generates the fixtures that hold this to it.
 */

import { sha256 } from "@noble/hashes/sha256";

export const NOTE_NAMES = [
  "C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B",
];

// Semitone offsets from the tonic. Every one of these is a rotation of the
// same seven-note pattern, which is why they share the "no semitone
// neighbour" arithmetic further down - the gaps just land in different places.
export const MODES = {
  major: [0, 2, 4, 5, 7, 9, 11], // ionian - bright
  minor: [0, 2, 3, 5, 7, 8, 10], // aeolian - dark
  dorian: [0, 2, 3, 5, 7, 9, 10], // minor with a lifted sixth
  phrygian: [0, 1, 3, 5, 7, 8, 10], // spanish, brooding
  lydian: [0, 2, 4, 6, 7, 9, 11], // major with a raised fourth, floating
  mixolydian: [0, 2, 4, 5, 7, 9, 10], // major with a flat seventh, folky
};

export const DEFAULT_TONIC = "C";
export const DEFAULT_MODE = "major";

// Three octaves of seven notes. The bottom of the scale sits in octave 3; the
// octave below that is 65-123Hz, which most laptop speakers cannot reproduce.
const OCTAVES = 3;
const DEGREES_PER_OCTAVE = 7;
const SCALE_LENGTH = OCTAVES * DEGREES_PER_OCTAVE;

// Tempo in BPM
export const TEMPO = 120;

// Duration mapping (in beats, relative to quarter note = 1 beat)
export const DURATION_MAP = {
  vowel: 1.0, // Quarter note
  consonant: 0.5, // Eighth note
  space: 1.0, // Rest (1 beat)
  punctuation: 0.5, // Staccato eighth note
};

// Capitals hold their note longer. Case used to be thrown away on decryption;
// stretching the note preserves it and adds dotted rhythms at the same time.
export const UPPER_DURATION_MAP = {
  vowel: 1.5, // Dotted quarter
  consonant: 0.75, // Dotted eighth
};

// Keyed on numbers rather than object keys so the float values stay floats.
// All four are exactly representable in binary floating point, so lookup by
// equality is safe here.
const LETTER_DURATIONS = new Map([
  [DURATION_MAP.consonant, ["consonant", false]],
  [UPPER_DURATION_MAP.consonant, ["consonant", true]],
  [DURATION_MAP.vowel, ["vowel", false]],
  [UPPER_DURATION_MAP.vowel, ["vowel", true]],
]);

const VOWELS = new Set("AEIOUaeiou");

const PUNCTUATION = new Set([
  ".", ",", "!", "?", ";", ":", "'", '"', "(", ")", "-",
]);

// Consonants ordered most-common-first
const CONSONANTS_BY_FREQUENCY = "TNSRHLDCMWFGYPBVKJXQZ";

const VOWELS_IN_ORDER = "AEIOU";

// Where the common letters live, and how many of them there are. Eleven
// letters covers roughly 80% of the consonants in English text.
const CENTRE_INDEX = 9;
const COMMON_COUNT = 11;

/** Python's `%` returns a result with the sign of the divisor; JS does not. */
function pyMod(value, divisor) {
  return ((value % divisor) + divisor) % divisor;
}

/** Python's `//` floors rather than truncating toward zero. */
function floorDiv(value, divisor) {
  return Math.floor(value / divisor);
}

function midiToName(midi) {
  return `${NOTE_NAMES[pyMod(midi, 12)]}${floorDiv(midi, 12) - 1}`;
}

/**
 * The 21 notes of a key: three octaves of the mode, starting from the tonic.
 *
 * This is the "key" in the musical sense, and it doubles as part of the cipher
 * key - letters are stored as scale degrees, so the same degree is a different
 * note in every key.
 */
export function buildScale(tonic = DEFAULT_TONIC, mode = DEFAULT_MODE) {
  const pattern = MODES[mode] || MODES[DEFAULT_MODE];
  const root =
    48 + NOTE_NAMES.indexOf(NOTE_NAMES.includes(tonic) ? tonic : DEFAULT_TONIC);

  const scale = [];
  for (let octave = 0; octave < OCTAVES; octave++) {
    for (const step of pattern) {
      scale.push(midiToName(root + 12 * octave + step));
    }
  }
  return scale;
}

/**
 * Scale degrees with no semitone neighbour anywhere in the scale.
 *
 * Vowels sustain underneath the consonants, so a vowel a semitone away from a
 * passing consonant grinds. A diatonic scale has exactly two semitone steps;
 * the degrees on either side of them are the ones to avoid.
 */
export function safeVowelDegrees(mode = DEFAULT_MODE) {
  const pattern = MODES[mode] || MODES[DEFAULT_MODE];
  const unsafe = new Set();

  for (let i = 0; i < DEGREES_PER_OCTAVE; i++) {
    const next = (i + 1) % DEGREES_PER_OCTAVE;
    const gap = pyMod(pattern[next] - pattern[i], 12);
    if (gap === 1) {
      unsafe.add(i);
      unsafe.add(next);
    }
  }

  const safe = [];
  for (let i = 0; i < DEGREES_PER_OCTAVE; i++) {
    if (!unsafe.has(i)) safe.push(i);
  }

  // Spread across octaves, keeping to the lower/middle of the range where the
  // sustained voice sits comfortably
  const positions = [];
  for (let octave = 0; octave < OCTAVES; octave++) {
    for (const degree of safe) {
      positions.push(degree + DEGREES_PER_OCTAVE * octave);
    }
  }
  positions.sort((a, b) => a - b);
  return positions.slice(0, 5);
}

/** Scale positions ordered from the middle outwards: centre, +1, -1, +2... */
function centreOutOrder(count, centre) {
  const order = [centre];
  let offset = 1;
  while (order.length < count) {
    for (const index of [centre + offset, centre - offset]) {
      if (index >= 0 && index < count && !order.includes(index)) {
        order.push(index);
      }
    }
    offset += 1;
  }
  return order;
}

// Two rules, pulling in different directions:
//
//   1. The handful of letters that make up most of English should sit near
//      each other, so the line moves in steps like a tune.
//   2. Within that group they must NOT be in frequency order, or every "th",
//      "nd" and "st" produces a tiny interval and the line sounds repetitive.
//
// So: pick a central band for the common letters, then walk that band in
// strides of four (coprime with eleven, so every note is used exactly once).
function buildConsonantDegrees() {
  const centreOut = centreOutOrder(SCALE_LENGTH, CENTRE_INDEX);

  const centralBand = centreOut.slice(0, COMMON_COUNT).sort((a, b) => a - b);
  const stride = 4;
  const degrees = [];
  for (let i = 0; i < centralBand.length; i++) {
    degrees.push(centralBand[(i * stride) % centralBand.length]);
  }
  degrees.push(...centreOut.slice(COMMON_COUNT));

  return degrees;
}

const CONSONANT_DEGREE_ORDER = buildConsonantDegrees();

/**
 * Deterministic Fisher-Yates driven by a hash of the key.
 *
 * Rolling our own rather than using a library shuffle because the sequence has
 * to stay identical across languages and across years - a message must still
 * decode on a different machine later.
 */
function keyedShuffle(items, key, salt) {
  const result = [...items];
  let stream = sha256(concatBytes(salt, key));
  let offset = 0;

  for (let i = result.length - 1; i > 0; i--) {
    if (offset + 4 > stream.length) {
      stream = sha256(stream);
      offset = 0;
    }
    // Big-endian, matching Python's int.from_bytes(..., "big")
    const draw =
      stream[offset] * 0x1000000 +
      (stream[offset + 1] << 16) +
      (stream[offset + 2] << 8) +
      stream[offset + 3];
    offset += 4;
    const j = draw % (i + 1);
    [result[i], result[j]] = [result[j], result[i]];
  }

  return result;
}

function concatBytes(a, b) {
  const out = new Uint8Array(a.length + b.length);
  out.set(a, 0);
  out.set(b, a.length);
  return out;
}

const encoder = new TextEncoder();

function ascii(text) {
  return encoder.encode(text);
}

/**
 * Build the scale and the letter/note lookups.
 *
 * Two independent keys are at work:
 *   - the musical key (tonic + mode) decides which pitch each degree becomes
 *   - the passphrase shuffles which letter owns which degree
 */
export function buildLetterNotes(
  passphrase = "",
  tonic = DEFAULT_TONIC,
  mode = DEFAULT_MODE
) {
  const scale = buildScale(tonic, mode);

  let vowelDegrees = safeVowelDegrees(mode);
  let consonantDegrees = [...CONSONANT_DEGREE_ORDER];

  if (passphrase) {
    const key = sha256(encoder.encode(passphrase));

    // Shuffle each band separately so common letters stay central
    const central = keyedShuffle(
      consonantDegrees.slice(0, COMMON_COUNT),
      key,
      ascii("central")
    );
    const outer = keyedShuffle(
      consonantDegrees.slice(COMMON_COUNT),
      key,
      ascii("outer")
    );
    consonantDegrees = [...central, ...outer];

    // Vowels keep their clash-free degrees, they just swap among themselves
    vowelDegrees = keyedShuffle(vowelDegrees, key, ascii("vowels"));
  }

  const letterToNote = new Map();
  for (let i = 0; i < CONSONANTS_BY_FREQUENCY.length; i++) {
    letterToNote.set(CONSONANTS_BY_FREQUENCY[i], scale[consonantDegrees[i]]);
  }

  // Insertion order matters below, so build the vowel table in A E I O U order
  const noteToVowel = new Map();
  const vowelCount = Math.min(VOWELS_IN_ORDER.length, vowelDegrees.length);
  for (let i = 0; i < vowelCount; i++) {
    const letter = VOWELS_IN_ORDER[i];
    const note = scale[vowelDegrees[i]];
    letterToNote.set(letter, note);
    noteToVowel.set(note, letter);
  }

  const noteToConsonants = new Map();
  for (const letter of CONSONANTS_BY_FREQUENCY) {
    const note = letterToNote.get(letter);
    if (!noteToConsonants.has(note)) noteToConsonants.set(note, []);
    noteToConsonants.get(note).push(letter);
  }

  return { scale, letterToNote, noteToVowel, noteToConsonants };
}

/**
 * Format a number the way Python's str() would, so "1.0" does not become "1".
 */
export function formatDuration(value) {
  return Number.isInteger(value) ? value.toFixed(1) : String(value);
}

const LETTER_PATTERN = /\p{L}/u;
const UPPER_PATTERN = /\p{Lu}/u;

/** Text-to-Music cipher with reversible encryption/decryption. */
export class MusicCipher {
  /**
   * @param {string} passphrase Optional word key. Shuffles which letter owns
   *   which degree.
   * @param {string} tonic Musical key, e.g. "D".
   * @param {string} mode major | minor | dorian | phrygian | lydian | mixolydian
   */
  constructor(passphrase = "", tonic = DEFAULT_TONIC, mode = DEFAULT_MODE) {
    this.passphrase = passphrase || "";
    this.tonic = NOTE_NAMES.includes(tonic) ? tonic : DEFAULT_TONIC;
    this.mode = Object.prototype.hasOwnProperty.call(MODES, mode)
      ? mode
      : DEFAULT_MODE;

    const tables = buildLetterNotes(this.passphrase, this.tonic, this.mode);
    this.scale = tables.scale;
    this.letterToNote = tables.letterToNote;
    this.noteToVowel = tables.noteToVowel;
    this.noteToConsonants = tables.noteToConsonants;
  }

  /** Convert a single character to [note, duration, charType]. */
  charToNote(char) {
    if (char === " ") {
      return ["REST", DURATION_MAP.space, "space"];
    }
    if (PUNCTUATION.has(char)) {
      return ["REST", DURATION_MAP.punctuation, "punctuation"];
    }
    if (LETTER_PATTERN.test(char)) {
      // Frequency-aware mapping keeps the common letters on distinct, widely
      // spaced notes
      const upper = char.toUpperCase();
      const note =
        this.letterToNote.get(upper) ??
        this.scale[pyMod(upper.codePointAt(0), this.scale.length)];

      // Determine duration based on vowel/consonant, stretched for capitals
      const charType = VOWELS.has(char) ? "vowel" : "consonant";
      const duration = UPPER_PATTERN.test(char)
        ? UPPER_DURATION_MAP[charType]
        : DURATION_MAP[charType];

      return [note, duration, charType];
    }
    // Unknown character - treat as punctuation
    return ["REST", DURATION_MAP.punctuation, "punctuation"];
  }

  /** Convert full text to a sequence of note objects. */
  textToNotes(text) {
    const notes = [];
    for (const char of text) {
      const [note, duration, charType] = this.charToNote(char);
      notes.push({ note, duration, char, char_type: charType });
    }
    return notes;
  }

  /** Reverse mapping: convert a note sequence back to text, using this key. */
  notesToText(noteSequence) {
    const text = [];

    for (const noteDict of noteSequence) {
      const note = noteDict.note;
      const charType = noteDict.char_type;
      const duration = noteDict.duration;

      if (note === "REST") {
        // Rests map to space or punctuation
        text.push(charType === "space" ? " " : ".");
      } else {
        // The note gives the letter, the duration gives the case
        let letter;
        if (charType === "vowel") {
          letter = this.noteToVowel.get(note) ?? "?";
        } else {
          // Consonants are stored most-common-first, so the first candidate is
          // the most likely letter for this note
          const candidates = this.noteToConsonants.get(note);
          letter = candidates ? candidates[0] : "?";
        }

        const entry = LETTER_DURATIONS.get(duration);
        const isUpper = entry ? entry[1] : true;
        text.push(isUpper ? letter : letter.toLowerCase());
      }
    }

    return text.join("");
  }

  /** Format as "C3(1.0) D3(0.5) REST(1.0) ..." */
  static formatNoteSequence(noteSequence) {
    return noteSequence
      .map(n => `${n.note}(${formatDuration(n.duration)})`)
      .join(" ");
  }

  formatNoteSequence(noteSequence) {
    return MusicCipher.formatNoteSequence(noteSequence);
  }

  /** Parse a formatted note string back to note objects. */
  static parseNoteSequence(noteStr) {
    const notes = [];
    const pattern = /([A-G]#?-?\d+|REST)\(([0-9.]+)\)/g;

    let match;
    while ((match = pattern.exec(noteStr)) !== null) {
      const note = match[1];
      const durationValue = parseFloat(match[2]);

      let charType;
      if (note === "REST") {
        charType =
          durationValue === DURATION_MAP.space ? "space" : "punctuation";
      } else {
        // Duration carries both the vowel/consonant split and the case
        const entry = LETTER_DURATIONS.get(durationValue);
        charType = entry ? entry[0] : "consonant";
      }

      notes.push({ note, duration: durationValue, char_type: charType });
    }

    return notes;
  }

  parseNoteSequence(noteStr) {
    return MusicCipher.parseNoteSequence(noteStr);
  }
}

export default MusicCipher;
