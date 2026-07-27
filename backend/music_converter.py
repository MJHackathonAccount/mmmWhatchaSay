"""
Music converter - converts note sequences to audio data.
Uses music21 to generate MIDI, which can then be played.
"""

from typing import List, Dict
import json
import re
from cipher import TEMPO, SCALE

try:
    from music21 import stream, note, tempo, instrument
    HAS_MUSIC21 = True
except ImportError:
    HAS_MUSIC21 = False
    print("Warning: music21 not installed. Install with: pip install music21")


class MusicConverter:
    """Converts note sequences to playable audio formats."""

    @staticmethod
    def notes_to_midi(note_sequence: List[Dict], output_file: str = None) -> str:
        """
        Convert note sequence to MIDI data.
        
        Args:
            note_sequence: List of {"note": "C3", "duration": 1.0, ...}
            output_file: Optional file path to save MIDI
            
        Returns:
            Base64 encoded MIDI data or file path
        """
        if not HAS_MUSIC21:
            raise RuntimeError("music21 is required. Install with: pip install music21")
        
        # Create a score
        score = stream.Score()
        part = stream.Part()
        part.append(instrument.Violin())
        
        # Add tempo
        part.append(tempo.MetronomeMark(number=TEMPO))
        
        # Add notes
        for note_dict in note_sequence:
            note_name = note_dict["note"]
            duration = note_dict["duration"]
            
            if note_name == "REST":
                # Add rest
                rest = note.Rest(quarterLength=duration)
                part.append(rest)
            else:
                # Parse note (e.g., "C3" -> C, octave 3)
                pitch_str = note_name[:-1]  # e.g., "C3" -> "C"
                octave_str = note_name[-1]   # e.g., "C3" -> "3"
                
                try:
                    note_obj = note.Note(pitch_str + octave_str, quarterLength=duration)
                    part.append(note_obj)
                except Exception as e:
                    print(f"Warning: Could not parse note {note_name}: {e}")
                    # Add a rest instead
                    rest = note.Rest(quarterLength=duration)
                    part.append(rest)
        
        score.append(part)
        
        # Save to file if specified
        if output_file:
            score.write('midi', fp=output_file)
            return output_file
        
        # Return the score object (can be used by frontend)
        return score

    @staticmethod
    def notes_to_abc_notation(note_sequence: List[Dict]) -> str:
        """
        Convert note sequence to ABC notation (text-based music format).
        This is lightweight and can be rendered client-side.
        
        ABC notation is a simple text format for music.
        Example: CABc 2A 4d|cde2 (represents melody in ABC)
        
        Args:
            note_sequence: List of note dicts
            
        Returns:
            ABC notation string
        """
        # ABC notation basics:
        # C D E F G A B (uppercase = lower octave)
        # c d e f g a b (lowercase = higher octave)
        # Duration: number after note (2 = half, 4 = quarter, 8 = eighth)
        # Rest: z
        
        # Notes are built from the key now, so they can carry sharps and can sit
        # in any octave. Derive the ABC spelling rather than looking it up.
        def to_abc(note_name: str) -> str:
            match = re.match(r"^([A-G])(#?)(\d+)$", note_name)
            if not match:
                return "z"

            letter, sharp, octave = match.group(1), match.group(2), int(match.group(3))
            accidental = "^" if sharp else ""

            # ABC: uppercase is octave 3, lowercase is octave 4,
            # apostrophes go up from there, commas go down
            if octave <= 3:
                body = letter + "," * (3 - octave)
            else:
                body = letter.lower() + "'" * (octave - 4)

            return accidental + body
        
        # Duration mapping to ABC
        # In ABC, default is quarter note
        # 0.5 = 1/8 (use /2), 1.0 = 1/4 (default), 2.0 = 1/2 (use 2)
        def format_duration(duration: float) -> str:
            if duration == 0.5:
                return "/2"  # Eighth note
            elif duration == 0.75:
                return "3/4"  # Dotted eighth (upper case consonant)
            elif duration == 1.0:
                return ""    # Quarter note (default)
            elif duration == 1.5:
                return "3/2"  # Dotted quarter (upper case vowel)
            elif duration == 2.0:
                return "2"   # Half note
            else:
                # For other durations, use a multiplier
                return str(duration) if duration != 1.0 else ""
        
        # Start ABC header
        abc_lines = [
            "X:1",
            f"T:Text-to-Music Cipher",
            f"M:4/4",
            f"L:1/4",
            f"Q:1/4={TEMPO}",
            f"K:C",
            f"|"
        ]
        
        # Build melody
        melody_parts = []
        for note_dict in note_sequence:
            note_name = note_dict["note"]
            duration = note_dict["duration"]
            
            if note_name == "REST":
                melody_parts.append(f"z{format_duration(duration)}")
            else:
                abc_note = to_abc(note_name)
                melody_parts.append(f"{abc_note}{format_duration(duration)}")
        
        # Add spaces between notes for readability (every 8 notes)
        melody = ""
        for i, part in enumerate(melody_parts):
            melody += part
            if (i + 1) % 8 == 0:
                melody += "\n"
            else:
                melody += " "
        
        abc_lines.append(melody)
        
        return "\n".join(abc_lines)

    @staticmethod
    def generate_web_audio_json(note_sequence: List[Dict]) -> str:
        """
        Generate JSON that can be used by Web Audio API on the frontend.
        
        Args:
            note_sequence: List of note dicts
            
        Returns:
            JSON string
        """
        # Convert duration to seconds (assuming quarter note = 1 beat)
        beats_per_minute = TEMPO
        seconds_per_beat = 60 / beats_per_minute
        
        audio_data = {
            "tempo": TEMPO,
            "notes": []
        }
        
        for index, note_dict in enumerate(note_sequence):
            note_name = note_dict["note"]
            duration_beats = note_dict["duration"]
            duration_seconds = duration_beats * seconds_per_beat
            char = note_dict.get("char", "")  # Get the original character
            
            if note_name == "REST":
                audio_data["notes"].append({
                    "note": None,  # None = rest
                    "duration": f"{duration_beats}n",  # "1n" = quarter note
                    "time": len(audio_data["notes"]) * duration_seconds,
                    "char": char,
                    "index": index,
                    "stream": "melody"
                })
            else:
                audio_data["notes"].append({
                    "note": note_name,
                    "duration": f"{duration_beats}n",
                    "time": len(audio_data["notes"]) * duration_seconds,
                    "char": char,
                    "index": index,
                    "stream": "melody"
                })
        
        return json.dumps(audio_data, indent=2)

    @staticmethod
    def generate_harmonic_web_audio_json(note_sequence: List[Dict]) -> str:
        """
        Generate harmonic layering JSON: vowels sustain as harmony, consonants as melody.
        
        Vowels sustain for 2 beats or until the next vowel appears.
        Consonants play quickly on top of the sustained vowels.
        
        Args:
            note_sequence: List of note dicts with char and char_type
            
        Returns:
            JSON string with harmony and melody streams
        """
        beats_per_minute = TEMPO
        seconds_per_beat = 60 / beats_per_minute
        
        # Process the sequence to identify vowel regions
        vowel_regions = []  # List of (start_time, end_time, note, char)
        melody_notes = []   # List of (time, note, duration, char) for consonants
        
        current_time = 0
        i = 0
        
        while i < len(note_sequence):
            note_dict = note_sequence[i]
            char = note_dict.get("char", "")
            char_type = note_dict.get("char_type", "consonant")
            note_name = note_dict["note"]
            duration_beats = note_dict["duration"]
            
            if char_type == "vowel" and note_name != "REST":
                # Found a vowel - sustain it
                region_start_time = current_time
                region_sustain_duration = 0
                
                # Calculate sustain duration: scan ahead for next vowel or max 2 beats
                j = i
                max_sustain = 2.0  # Max sustain is 2 beats
                
                while j < len(note_sequence):
                    next_dict = note_sequence[j]
                    next_char_type = next_dict.get("char_type", "consonant")
                    next_duration = next_dict["duration"]
                    
                    region_sustain_duration += next_duration
                    
                    # If we find another vowel, stop sustaining
                    if next_char_type == "vowel" and j > i:
                        region_sustain_duration -= next_duration  # Don't include the next vowel's duration
                        break
                    
                    # Cap at 2 beats
                    if region_sustain_duration >= max_sustain:
                        region_sustain_duration = max_sustain
                        break
                    
                    j += 1
                
                vowel_regions.append({
                    "start_time": region_start_time,
                    "end_time": region_start_time + region_sustain_duration,
                    "note": note_name,
                    "char": char,
                    "index": i,
                    "duration": region_sustain_duration
                })
            
            if char_type == "consonant" and note_name != "REST":
                # Consonant - add to melody
                melody_notes.append({
                    "time": current_time,
                    "note": note_name,
                    "duration": duration_beats,
                    "char": char,
                    "index": i
                })
            
            if note_name == "REST":
                # Rest - just advance time
                pass
            else:
                # Add this note's duration to current_time (for consonants)
                if char_type == "consonant":
                    current_time += duration_beats
                # For vowels, don't advance time yet - they'll be skipped in the main loop
                else:
                    # Skip ahead by this vowel's duration
                    current_time += duration_beats
            
            i += 1
        
        # Build the final JSON with both streams
        audio_data = {
            "tempo": TEMPO,
            "notes": [],
            "harmony": [],
            "melody": []
        }
        
        # Add harmony notes (sustaining vowels)
        for region in vowel_regions:
            audio_data["harmony"].append({
                "note": region["note"],
                "startTime": region["start_time"] * seconds_per_beat,
                "duration": region["duration"] * seconds_per_beat,
                "char": region["char"],
                "index": region["index"],
                "stream": "harmony"
            })
        
        # Add melody notes (consonants)
        for melody_note in melody_notes:
            audio_data["melody"].append({
                "note": melody_note["note"],
                "startTime": melody_note["time"] * seconds_per_beat,
                "duration": melody_note["duration"] * seconds_per_beat,
                "char": melody_note["char"],
                "index": melody_note["index"],
                "stream": "melody"
            })
        
        return json.dumps(audio_data, indent=2)


# Example
if __name__ == "__main__":
    from cipher import MusicCipher
    
    cipher = MusicCipher()
    converter = MusicConverter()
    
    test_text = "Hi"
    notes = cipher.text_to_notes(test_text)
    
    print("Notes:", cipher.format_note_sequence(notes))
    print("\nABC Notation:")
    print(converter.notes_to_abc_notation(notes))
    print("\nWeb Audio JSON:")
    print(converter.generate_web_audio_json(notes))
