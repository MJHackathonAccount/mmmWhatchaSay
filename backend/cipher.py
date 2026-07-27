"""
Text-to-Music Cipher

Converts text to musical notation and vice versa using a deterministic mapping.
"""

import hashlib
import re
from typing import List, Tuple, Dict

NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]

# Semitone offsets from the tonic. Every one of these is a rotation of the same
# seven-note pattern, which is why they share the "no semitone neighbour"
# arithmetic further down - the gaps just land in different places.
MODES = {
    "major": [0, 2, 4, 5, 7, 9, 11],       # ionian - bright
    "minor": [0, 2, 3, 5, 7, 8, 10],       # aeolian - dark
    "dorian": [0, 2, 3, 5, 7, 9, 10],      # minor with a lifted sixth
    "phrygian": [0, 1, 3, 5, 7, 8, 10],    # spanish, brooding
    "lydian": [0, 2, 4, 6, 7, 9, 11],      # major with a raised fourth, floating
    "mixolydian": [0, 2, 4, 5, 7, 9, 10],  # major with a flat seventh, folky
}

DEFAULT_TONIC = "C"
DEFAULT_MODE = "major"

# Three octaves of seven notes. The bottom of the scale sits in octave 3; the
# octave below that is 65-123Hz, which most laptop speakers cannot reproduce.
OCTAVES = 3
DEGREES_PER_OCTAVE = 7
SCALE_LENGTH = OCTAVES * DEGREES_PER_OCTAVE


def _midi_to_name(midi: int) -> str:
    return f"{NOTE_NAMES[midi % 12]}{midi // 12 - 1}"


def build_scale(tonic: str = DEFAULT_TONIC, mode: str = DEFAULT_MODE) -> List[str]:
    """
    The 21 notes of a key: three octaves of the mode, starting from the tonic.

    This is the "key" in the musical sense, and it doubles as part of the cipher
    key - letters are stored as scale degrees, so the same degree is a different
    note in every key.
    """
    pattern = MODES.get(mode, MODES[DEFAULT_MODE])
    root = 48 + NOTE_NAMES.index(tonic if tonic in NOTE_NAMES else DEFAULT_TONIC)

    return [
        _midi_to_name(root + 12 * octave + step)
        for octave in range(OCTAVES)
        for step in pattern
    ]


def safe_vowel_degrees(mode: str = DEFAULT_MODE) -> List[int]:
    """
    Scale degrees with no semitone neighbour anywhere in the scale.

    Vowels sustain underneath the consonants, so a vowel a semitone away from a
    passing consonant grinds. A diatonic scale has exactly two semitone steps;
    the degrees on either side of them are the ones to avoid. Which degrees those
    are depends on the mode, so this is recalculated per key rather than
    hardcoded - in C major it returns D, G and A, as before.
    """
    pattern = MODES.get(mode, MODES[DEFAULT_MODE])
    unsafe = set()

    for i in range(DEGREES_PER_OCTAVE):
        nxt = (i + 1) % DEGREES_PER_OCTAVE
        gap = (pattern[nxt] - pattern[i]) % 12
        if gap == 1:
            unsafe.add(i)
            unsafe.add(nxt)

    safe = [i for i in range(DEGREES_PER_OCTAVE) if i not in unsafe]

    # Spread across octaves, keeping to the lower/middle of the range where the
    # sustained voice sits comfortably
    positions = sorted(
        degree + DEGREES_PER_OCTAVE * octave
        for octave in range(OCTAVES)
        for degree in safe
    )
    return positions[:5]


# Default scale, kept so anything importing SCALE still works
SCALE = build_scale()

# Tempo in BPM
TEMPO = 120

# Duration mapping (in beats, relative to quarter note = 1 beat)
DURATION_MAP = {
    "vowel": 1.0,        # Quarter note
    "consonant": 0.5,    # Eighth note
    "space": 1.0,        # Rest (1 beat)
    "punctuation": 0.5   # Staccato eighth note
}

# Capitals hold their note longer. Case used to be thrown away on decryption;
# stretching the note preserves it and adds dotted rhythms at the same time.
# The four letter lengths have to stay distinct - an upper case consonant at 1.0
# would be indistinguishable from a lower case vowel.
UPPER_DURATION_MAP = {
    "vowel": 1.5,        # Dotted quarter
    "consonant": 0.75    # Dotted eighth
}

LETTER_DURATIONS = {
    DURATION_MAP["consonant"]: ("consonant", False),
    UPPER_DURATION_MAP["consonant"]: ("consonant", True),
    DURATION_MAP["vowel"]: ("vowel", False),
    UPPER_DURATION_MAP["vowel"]: ("vowel", True),
}

# Vowels
VOWELS = set("AEIOUaeiou")

# Common punctuation that should create rests
PUNCTUATION = set(".,!?;:'\"()-")

# --- Letter -> scale degree mapping -----------------------------------------
# Letters are stored as scale *degrees*, not fixed notes. The key turns a degree
# into an actual pitch, so the same melody written in two different keys spells
# two different messages.
#
# A plain "ord(char) % len(SCALE)" put the most common letters on top of each
# other (A and O landed on the same note with the same duration, so they were
# literally indistinguishable) and crowded them into a narrow band.

# Consonants ordered most-common-first
CONSONANTS_BY_FREQUENCY = "TNSRHLDCMWFGYPBVKJXQZ"

VOWELS_IN_ORDER = "AEIOU"


def _centre_out_order(count: int, centre: int) -> List[int]:
    """Scale positions ordered from the middle outwards: centre, +1, -1, +2..."""
    order = [centre]
    offset = 1
    while len(order) < count:
        for index in (centre + offset, centre - offset):
            if 0 <= index < count and index not in order:
                order.append(index)
        offset += 1
    return order


# Where the common letters live, and how many of them there are. Eleven letters
# covers roughly 80% of the consonants in English text.
_CENTRE_INDEX = 9
_COMMON_COUNT = 11

# Two rules, pulling in different directions:
#
#   1. The handful of letters that make up most of English should sit near each
#      other, so the line moves in steps like a tune rather than scattering
#      across three octaves.
#   2. Within that group they must NOT be in frequency order. Ranking them
#      straight up the scale put T, N, S, R, H on neighbouring notes, so every
#      "th", "nd" and "st" produced a tiny interval and 45% of consecutive
#      consonants landed within two steps of each other - hence the repetition.
#
# So: pick a central band for the common letters, then walk that band in strides
# of four (coprime with eleven, so every note is used exactly once) to break up
# the ordering. Rare letters take the extremes, where they read as accents
# because they turn up so seldom.
def _build_consonant_degrees() -> List[int]:
    centre_out = _centre_out_order(SCALE_LENGTH, _CENTRE_INDEX)

    central_band = sorted(centre_out[:_COMMON_COUNT])
    stride = 4
    degrees = [
        central_band[(i * stride) % len(central_band)]
        for i in range(len(central_band))
    ]
    degrees.extend(centre_out[_COMMON_COUNT:])

    return degrees


CONSONANT_DEGREE_ORDER = _build_consonant_degrees()


# --- Keying -----------------------------------------------------------------
# A passphrase shuffles which letter gets which note. Crucially it only shuffles
# *within* a register band: the common letters stay in the central band and the
# rare ones stay at the extremes, so a keyed tune is exactly as musical as an
# unkeyed one. Only the identity of each note changes, never its role.
#
# Keyspace is 5! x 11! x 10!, about 1.7e16. That is a puzzle, not a secret. The
# band layout is public, so an attacker knows the central notes are the common
# letters and ordinary frequency analysis will still break a long enough
# message. Treat it as a lock on a diary, not on a safe.

def _keyed_shuffle(items: List, key: bytes, salt: bytes) -> List:
    """
    Deterministic Fisher-Yates driven by a hash of the key.

    Rolling our own rather than using random.shuffle because CPython does not
    promise its shuffle stays identical between versions, and a message must
    still decode on a different machine years later.
    """
    result = list(items)
    stream = hashlib.sha256(salt + key).digest()
    offset = 0

    for i in range(len(result) - 1, 0, -1):
        if offset + 4 > len(stream):
            stream = hashlib.sha256(stream).digest()
            offset = 0
        draw = int.from_bytes(stream[offset:offset + 4], "big")
        offset += 4
        j = draw % (i + 1)
        result[i], result[j] = result[j], result[i]

    return result


def build_letter_notes(
    passphrase: str = "",
    tonic: str = DEFAULT_TONIC,
    mode: str = DEFAULT_MODE,
) -> Tuple[List[str], Dict[str, str], Dict[str, str], Dict[str, List[str]]]:
    """
    Build the scale and the letter/note lookups.

    Two independent keys are at work:
      - the musical key (tonic + mode) decides which pitch each degree becomes
      - the passphrase shuffles which letter owns which degree

    Returns (scale, letter_to_note, note_to_vowel, note_to_consonants).
    """
    scale = build_scale(tonic, mode)

    vowel_degrees = safe_vowel_degrees(mode)
    consonant_degrees = list(CONSONANT_DEGREE_ORDER)

    if passphrase:
        key = hashlib.sha256(passphrase.encode("utf-8")).digest()

        # Shuffle each band separately so common letters stay central
        central = _keyed_shuffle(consonant_degrees[:_COMMON_COUNT], key, b"central")
        outer = _keyed_shuffle(consonant_degrees[_COMMON_COUNT:], key, b"outer")
        consonant_degrees = central + outer

        # Vowels keep their clash-free degrees, they just swap among themselves
        vowel_degrees = _keyed_shuffle(vowel_degrees, key, b"vowels")

    vowel_notes = {
        letter: scale[degree]
        for letter, degree in zip(VOWELS_IN_ORDER, vowel_degrees)
    }

    letter_to_note: Dict[str, str] = {
        letter: scale[consonant_degrees[i]]
        for i, letter in enumerate(CONSONANTS_BY_FREQUENCY)
    }
    letter_to_note.update(vowel_notes)

    note_to_vowel = {note: letter for letter, note in vowel_notes.items()}

    note_to_consonants: Dict[str, List[str]] = {}
    for letter in CONSONANTS_BY_FREQUENCY:
        note_to_consonants.setdefault(letter_to_note[letter], []).append(letter)

    return scale, letter_to_note, note_to_vowel, note_to_consonants


# Module level defaults, kept so the unkeyed behaviour is unchanged
_, LETTER_TO_NOTE, NOTE_TO_VOWEL, NOTE_TO_CONSONANTS = build_letter_notes()


class MusicCipher:
    """Text-to-Music cipher with reversible encryption/decryption."""

    def __init__(
        self,
        passphrase: str = "",
        tonic: str = DEFAULT_TONIC,
        mode: str = DEFAULT_MODE,
    ):
        """
        Args:
            passphrase: Optional word key. Shuffles which letter owns which degree.
            tonic: Musical key, e.g. "D". Decides what pitch each degree becomes.
            mode: "major", "minor", "dorian", "phrygian", "lydian", "mixolydian".

        The musical key alone is only a few dozen combinations - brute forced in
        an instant - but it is what makes two messages sound like different
        pieces. The passphrase is what actually carries the keyspace.
        """
        self.passphrase = passphrase or ""
        self.tonic = tonic if tonic in NOTE_NAMES else DEFAULT_TONIC
        self.mode = mode if mode in MODES else DEFAULT_MODE
        (
            self.scale,
            self.letter_to_note,
            self.note_to_vowel,
            self.note_to_consonants,
        ) = build_letter_notes(self.passphrase, self.tonic, self.mode)

    def char_to_note(self, char: str) -> Tuple[str, float, str]:
        """
        Convert a single character to (note, duration, char_type).
        
        Args:
            char: Single character to convert
            
        Returns:
            Tuple of (note_name, duration_beats, char_type)
        """
        if char == " ":
            return ("REST", DURATION_MAP["space"], "space")
        elif char in PUNCTUATION:
            return ("REST", DURATION_MAP["punctuation"], "punctuation")
        elif char.isalpha():
            # Frequency-aware mapping keeps the common letters on distinct,
            # widely spaced notes
            upper = char.upper()
            note = self.letter_to_note.get(
                upper, self.scale[ord(upper) % len(self.scale)]
            )
            
            # Determine duration based on vowel/consonant, stretched for capitals
            is_vowel = char in VOWELS
            char_type = "vowel" if is_vowel else "consonant"
            duration = (
                UPPER_DURATION_MAP[char_type]
                if char.isupper()
                else DURATION_MAP[char_type]
            )
            
            return (note, duration, char_type)
        else:
            # Unknown character - treat as punctuation
            return ("REST", DURATION_MAP["punctuation"], "punctuation")

    def text_to_notes(self, text: str) -> List[Dict]:
        """
        Convert full text to sequence of notes.
        
        Args:
            text: Input text
            
        Returns:
            List of dicts: {"note": "C3", "duration": 1.0, "char": "a", "char_type": "vowel"}
        """
        notes = []
        for char in text:
            note, duration, char_type = self.char_to_note(char)
            notes.append({
                "note": note,
                "duration": duration,
                "char": char,
                "char_type": char_type
            })
        return notes

    def notes_to_text(self, note_sequence: List[Dict]) -> str:
        """
        Reverse mapping: convert note sequence back to text, using this
        instance's key.
        
        Args:
            note_sequence: List of {"note": ..., "duration": ..., "char_type": ...}
            
        Returns:
            Reconstructed text
        """
        text = []
        
        for note_dict in note_sequence:
            note = note_dict.get("note")
            char_type = note_dict.get("char_type")
            duration = note_dict.get("duration")
            
            if note == "REST":
                # Rests map to space or punctuation
                if char_type == "space":
                    text.append(" ")
                else:
                    text.append(".")  # Default punctuation placeholder
            else:
                # The note gives the letter, the duration gives the case
                if char_type == "vowel":
                    letter = self.note_to_vowel.get(note, "?")
                else:
                    # Consonants are stored most-common-first, so the first
                    # candidate is the most likely letter for this note
                    letter = self.note_to_consonants.get(note, ["?"])[0]
                
                _, is_upper = LETTER_DURATIONS.get(duration, (char_type, True))
                text.append(letter if is_upper else letter.lower())
        
        return "".join(text)

    @staticmethod
    def format_note_sequence(note_sequence: List[Dict]) -> str:
        """
        Format note sequence as readable text string.
        Format: "C3(1.0) D3(0.5) REST(1.0) ..."
        
        Args:
            note_sequence: List of note dicts
            
        Returns:
            Formatted string representation
        """
        return " ".join([f"{n['note']}({n['duration']})" for n in note_sequence])

    @staticmethod
    def parse_note_sequence(note_str: str) -> List[Dict]:
        """
        Parse formatted note string back to list of dicts.
        Format: "C3(1.0) D3(0.5) REST(1.0) ..."
        
        Args:
            note_str: Formatted note string
            
        Returns:
            List of note dicts
        """
        notes = []
        # Pattern: NOTE(DURATION) where NOTE is like C3, REST, etc.
        pattern = r"([A-G]#?-?\d+|REST)\(([0-9.]+)\)"
        matches = re.findall(pattern, note_str)
        
        for note, duration in matches:
            duration_value = float(duration)
            if note == "REST":
                char_type = "space" if duration_value == DURATION_MAP["space"] else "punctuation"
            else:
                # Duration carries both the vowel/consonant split and the case
                char_type, _ = LETTER_DURATIONS.get(duration_value, ("consonant", False))
            notes.append({
                "note": note,
                "duration": duration_value,
                "char_type": char_type
            })
        
        return notes


# Example usage
if __name__ == "__main__":
    # Test encryption
    test_text = "Hello World"
    cipher = MusicCipher()
    
    notes = cipher.text_to_notes(test_text)
    print(f"Original text: {test_text}")
    print(f"Notes: {cipher.format_note_sequence(notes)}")
    print(f"Note list: {notes}")
    
    # Test decryption
    reconstructed = cipher.notes_to_text(notes)
    print(f"Reconstructed: {reconstructed}")
