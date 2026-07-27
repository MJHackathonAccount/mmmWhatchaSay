/**
 * Music converter - browser port of backend/music_converter.py
 *
 * Converts note sequences into the formats the UI consumes: ABC notation for
 * display, and JSON for the Web Audio player.
 *
 * The MIDI path from the Python version is not ported. It was never reachable
 * from the API and it depended on music21, which has no browser equivalent.
 */

import { TEMPO, formatDuration } from "./cipher";

const ABC_NOTE_PATTERN = /^([A-G])(#?)(\d+)$/;

/**
 * ABC spells octave 3 in upper case and octave 4 in lower case, with commas
 * going down from there and apostrophes going up.
 */
function toAbc(noteName) {
  const match = ABC_NOTE_PATTERN.exec(noteName);
  if (!match) return "z";

  const [, letter, sharp, octaveStr] = match;
  const octave = parseInt(octaveStr, 10);
  const accidental = sharp ? "^" : "";

  const body =
    octave <= 3
      ? letter + ",".repeat(3 - octave)
      : letter.toLowerCase() + "'".repeat(octave - 4);

  return accidental + body;
}

/** In ABC the default is a quarter note, so 1.0 needs no suffix at all. */
function formatAbcDuration(duration) {
  if (duration === 0.5) return "/2"; // Eighth note
  if (duration === 0.75) return "3/4"; // Dotted eighth (upper case consonant)
  if (duration === 1.0) return ""; // Quarter note (default)
  if (duration === 1.5) return "3/2"; // Dotted quarter (upper case vowel)
  if (duration === 2.0) return "2"; // Half note
  return duration !== 1.0 ? formatDuration(duration) : "";
}

/**
 * Convert a note sequence to ABC notation, a text format for music that plenty
 * of other tools can render as sheet music.
 */
export function notesToAbcNotation(noteSequence) {
  const abcLines = [
    "X:1",
    "T:Text-to-Music Cipher",
    "M:4/4",
    "L:1/4",
    `Q:1/4=${TEMPO}`,
    "K:C",
    "|",
  ];

  const melodyParts = noteSequence.map(noteDict => {
    const { note, duration } = noteDict;
    if (note === "REST") {
      return `z${formatAbcDuration(duration)}`;
    }
    return `${toAbc(note)}${formatAbcDuration(duration)}`;
  });

  // A break every eight notes, a space otherwise. The separator lands after
  // the final note too, matching the reference implementation.
  let melody = "";
  melodyParts.forEach((part, i) => {
    melody += part;
    melody += (i + 1) % 8 === 0 ? "\n" : " ";
  });

  abcLines.push(melody);

  return abcLines.join("\n");
}

/**
 * Generate the JSON the Web Audio player consumes.
 *
 * Returned as a string rather than an object because the player parses it,
 * which is how the data arrived when this came back from the API.
 */
export function generateWebAudioJson(noteSequence) {
  const secondsPerBeat = 60 / TEMPO;

  const audioData = { tempo: TEMPO, notes: [] };

  noteSequence.forEach((noteDict, index) => {
    const noteName = noteDict.note;
    const durationBeats = noteDict.duration;
    const durationSeconds = durationBeats * secondsPerBeat;
    const char = noteDict.char ?? "";

    audioData.notes.push({
      note: noteName === "REST" ? null : noteName, // null = rest
      duration: `${formatDuration(durationBeats)}n`,
      time: audioData.notes.length * durationSeconds,
      char,
      index,
      stream: "melody",
    });
  });

  return JSON.stringify(audioData, null, 2);
}

/**
 * Harmonic layering: vowels sustain underneath as harmony, consonants play on
 * top as the melody.
 *
 * Vowels sustain until the next vowel or for two beats, whichever comes first.
 */
export function generateHarmonicWebAudioJson(noteSequence) {
  const secondsPerBeat = 60 / TEMPO;

  const vowelRegions = [];
  const melodyNotes = [];

  let currentTime = 0;

  for (let i = 0; i < noteSequence.length; i++) {
    const noteDict = noteSequence[i];
    const char = noteDict.char ?? "";
    const charType = noteDict.char_type ?? "consonant";
    const noteName = noteDict.note;
    const durationBeats = noteDict.duration;

    if (charType === "vowel" && noteName !== "REST") {
      // Found a vowel - sustain it
      const regionStartTime = currentTime;
      let regionSustainDuration = 0;

      const maxSustain = 2.0;
      let j = i;

      while (j < noteSequence.length) {
        const nextDict = noteSequence[j];
        const nextCharType = nextDict.char_type ?? "consonant";
        const nextDuration = nextDict.duration;

        regionSustainDuration += nextDuration;

        // If we find another vowel, stop sustaining
        if (nextCharType === "vowel" && j > i) {
          regionSustainDuration -= nextDuration;
          break;
        }

        if (regionSustainDuration >= maxSustain) {
          regionSustainDuration = maxSustain;
          break;
        }

        j += 1;
      }

      vowelRegions.push({
        start_time: regionStartTime,
        end_time: regionStartTime + regionSustainDuration,
        note: noteName,
        char,
        index: i,
        duration: regionSustainDuration,
      });
    }

    if (charType === "consonant" && noteName !== "REST") {
      melodyNotes.push({
        time: currentTime,
        note: noteName,
        duration: durationBeats,
        char,
        index: i,
      });
    }

    // Rests hold their place in the sequence but do not advance the clock
    if (noteName !== "REST") {
      currentTime += durationBeats;
    }
  }

  const audioData = { tempo: TEMPO, notes: [], harmony: [], melody: [] };

  for (const region of vowelRegions) {
    audioData.harmony.push({
      note: region.note,
      startTime: region.start_time * secondsPerBeat,
      duration: region.duration * secondsPerBeat,
      char: region.char,
      index: region.index,
      stream: "harmony",
    });
  }

  for (const melodyNote of melodyNotes) {
    audioData.melody.push({
      note: melodyNote.note,
      startTime: melodyNote.time * secondsPerBeat,
      duration: melodyNote.duration * secondsPerBeat,
      char: melodyNote.char,
      index: melodyNote.index,
      stream: "melody",
    });
  }

  return JSON.stringify(audioData, null, 2);
}
