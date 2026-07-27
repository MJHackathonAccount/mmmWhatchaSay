/**
 * The work the Flask API used to do, done in the browser instead.
 *
 * The return shapes match the old /encrypt and /decrypt responses, so the
 * components and the player consume exactly what they did before.
 */

import { MusicCipher } from "./cipher";
import {
  notesToAbcNotation,
  generateWebAudioJson,
  generateHarmonicWebAudioJson,
} from "./musicConverter";

export function encryptText({ text, key = "", tonic = "C", mode = "major" }) {
  if (!text) {
    throw new Error("No text provided");
  }

  const cipher = new MusicCipher(key, tonic, mode);
  const notes = cipher.textToNotes(text);

  return {
    success: true,
    original_text: text,
    notes,
    note_sequence_text: MusicCipher.formatNoteSequence(notes),
    abc_notation: notesToAbcNotation(notes),
    web_audio_json: generateWebAudioJson(notes),
    web_audio_json_harmonic: generateHarmonicWebAudioJson(notes),
    scale: cipher.scale,
    tonic: cipher.tonic,
    mode: cipher.mode,
    keyed: Boolean(key),
    note_count: notes.length,
  };
}

export function decryptNotes({
  noteSequence,
  notes,
  key = "",
  tonic = "C",
  mode = "major",
}) {
  let resolvedNotes = notes;

  if (!resolvedNotes || resolvedNotes.length === 0) {
    if (!noteSequence) {
      throw new Error("No notes provided");
    }
    resolvedNotes = MusicCipher.parseNoteSequence(noteSequence);
  }

  const cipher = new MusicCipher(key, tonic, mode);

  return {
    success: true,
    decrypted_text: cipher.notesToText(resolvedNotes),
    notes: resolvedNotes,
    tonic: cipher.tonic,
    mode: cipher.mode,
    keyed: Boolean(key),
    note_count: resolvedNotes.length,
  };
}
