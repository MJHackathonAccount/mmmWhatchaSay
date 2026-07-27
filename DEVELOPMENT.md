# 🛠️ Development Guide - Text-to-Music Cipher

This guide helps developers understand and extend the cipher system.

---

## 📚 Understanding the Codebase

### Backend Architecture

#### `cipher.py` - Core Logic
```python
MusicCipher
├── char_to_note(char) → (note, duration, char_type)
│   └── Maps single character to musical note
├── text_to_notes(text) → List[Dict]
│   └── Converts full text to note sequence
├── notes_to_text(notes) → str
│   └── Reverses notes back to text
├── format_note_sequence(notes) → str
│   └── Formats as "C3(1.0) D3(0.5) ..."
└── parse_note_sequence(text) → List[Dict]
    └── Parses formatted string back to notes
```

**Key Variables:**
- `SCALE` - List of note names (C3, D3, ...)
- `TEMPO` - Beats per minute (120)
- `DURATION_MAP` - Duration for each character type
- `VOWELS` - Set of vowel characters
- `PUNCTUATION` - Special characters that create rests

#### `music_converter.py` - Output Formats
```python
MusicConverter
├── notes_to_midi(notes, output_file)
│   └── Generate MIDI file (requires music21)
├── notes_to_abc_notation(notes) → str
│   └── Generate ABC music notation
└── generate_web_audio_json(notes) → str
    └── Generate JSON for Tone.js playback
```

#### `app.py` - REST API
```
GET  /health           → Health check
GET  /info             → API information
POST /encrypt          → Text → Notes
POST /decrypt          → Notes → Text
POST /format-notes     → Reformat note sequences
```

### Frontend Architecture

#### Component Hierarchy
```
App (main routing)
├── Encryptor (text → music UI)
│   └── MusicPlayer (playback)
└── Decryptor (music → text UI)
```

#### State Management
- **Encryptor:** `inputText`, `result`, `loading`, `error`
- **Decryptor:** `noteSequence`, `result`, `loading`, `error`
- **MusicPlayer:** `isPlaying`, `synth` (Tone.js synth)

#### External Dependencies
- **Tone.js** - Web Audio synthesis
- **Axios** - API requests
- **React** - UI framework

---

## 🔧 Extending the Cipher

### Adding a New Scale

#### Step 1: Define the Scale in `cipher.py`

```python
# Add to SCALE constant
SCALE = [
    # Pentatonic scale (no semitones)
    "C3", "D3", "E3", "G3", "A3",
    "C4", "D4", "E4", "G4", "A4",
    ...
]
```

#### Step 2: Update Mapping Logic (if needed)

```python
@staticmethod
def char_to_note(char: str) -> Tuple[str, float, str]:
    # Adjust character code mapping if scale changed
    note_idx = ord(char.upper()) % len(SCALE)  # Auto-adjusts!
    ...
```

#### Step 3: Update ABC Notation Mapping

```python
# In music_converter.py
note_map = {
    "C3": "C", "D3": "D", "E3": "E", "G3": "G", "A3": "A",
    "C4": "c", "D4": "d", "E4": "e", "G4": "g", "A4": "a",
    ...
}
```

#### Step 4: Update Web Audio JSON

```python
# music_converter.py should auto-work with any scale!
# Just use the new scale notes
```

### Adding Custom Tempo

#### In `cipher.py`:
```python
TEMPO = 160  # Change from 120 to 160 BPM
```

#### In Backend API - Make it Configurable:
```python
@app.route("/encrypt", methods=["POST"])
def encrypt():
    data = request.get_json()
    text = data.get("text")
    tempo = data.get("tempo", 120)  # Allow tempo override
    ...
```

### Adding New Note Duration Rules

#### Example: Make punctuation longer
```python
# cipher.py
DURATION_MAP = {
    "vowel": 1.0,
    "consonant": 0.5,
    "space": 1.0,
    "punctuation": 1.5,  # Changed from 0.5 to 1.5
}
```

### Adding Harmony/Chords

#### Create `harmonizer.py`:
```python
class MusicHarmonizer:
    @staticmethod
    def add_harmony(notes: List[Dict]) -> List[List[Dict]]:
        """
        Takes melody notes and generates harmony tracks
        Returns: [melody, harmony1, harmony2, ...]
        """
        # Generate third/fifth intervals below
        harmonies = []
        for note in notes:
            # Add harmony notes
            ...
        return harmonies
```

#### Update API:
```python
@app.route("/encrypt-with-harmony", methods=["POST"])
def encrypt_with_harmony():
    data = request.get_json()
    text = data.get("text")
    notes = cipher.text_to_notes(text)
    harmonizer = MusicHarmonizer()
    harmony_tracks = harmonizer.add_harmony(notes)
    ...
```

### Adding Instrument Selection

#### Update `music_converter.py`:
```python
class MusicConverter:
    INSTRUMENTS = {
        "piano": "Acoustic Grand Piano",
        "violin": "Violin",
        "flute": "Flute",
        "synth": "Synthesizer",
    }
    
    @staticmethod
    def notes_to_midi_with_instrument(notes, instrument="piano"):
        score = stream.Score()
        part = stream.Part()
        
        # Select instrument
        instr_name = MusicConverter.INSTRUMENTS.get(instrument, "piano")
        part.append(instrument.Instrument.fromString(instr_name))
        ...
```

### Adding Visual Sheet Music Display

#### Create `MusicViewer.jsx` component:
```jsx
import React, { useState, useEffect } from "react";
import ABCjs from "abcjs";

function MusicViewer({ abcNotation }) {
  useEffect(() => {
    ABCjs.renderAbc("sheet-music", abcNotation);
  }, [abcNotation]);

  return <div id="sheet-music"></div>;
}

export default MusicViewer;
```

#### Add to Encryptor:
```jsx
{result && (
  <>
    <MusicViewer abcNotation={result.abc_notation} />
    <MusicPlayer webAudioJson={result.web_audio_json} />
  </>
)}
```

---

## 🧪 Testing

### Unit Tests - Cipher

#### Create `tests/test_cipher.py`:
```python
import pytest
from cipher import MusicCipher

def test_simple_encryption():
    cipher = MusicCipher()
    notes = cipher.text_to_notes("A")
    assert len(notes) == 1
    assert notes[0]["char"] == "A"

def test_roundtrip():
    cipher = MusicCipher()
    original = "HELLO WORLD"
    notes = cipher.text_to_notes(original)
    reconstructed = cipher.notes_to_text(notes)
    assert reconstructed == original.upper()

def test_vowel_consonant_duration():
    cipher = MusicCipher()
    a_note = cipher.char_to_note("A")
    b_note = cipher.char_to_note("B")
    
    assert a_note[1] == 1.0  # A is vowel, 1.0 beat
    assert b_note[1] == 0.5  # B is consonant, 0.5 beat
```

#### Run tests:
```bash
cd backend
pytest tests/
```

### Integration Tests - API

#### Create `tests/test_api.py`:
```python
import pytest
from app import app

@pytest.fixture
def client():
    app.config['TESTING'] = True
    with app.test_client() as client:
        yield client

def test_encrypt_endpoint(client):
    response = client.post('/encrypt', 
        json={'text': 'hello'})
    assert response.status_code == 200
    assert response.json['success'] == True
```

---

## 📊 Performance Optimization

### Current Bottlenecks
- ABC notation generation (string building)
- Web Audio JSON generation (list building)

### Optimization Ideas

1. **Cache Common Phrases:**
```python
CACHE = {}

def text_to_notes_cached(text):
    if text in CACHE:
        return CACHE[text]
    result = text_to_notes(text)
    CACHE[text] = result
    return result
```

2. **Lazy Load ABC Notation:**
```python
# Only generate when requested
@app.route("/encrypt", methods=["POST"])
def encrypt():
    data = request.get_json()
    include_abc = data.get("include_abc", False)
    
    result = {...}
    if include_abc:
        result["abc_notation"] = converter.notes_to_abc_notation(notes)
    ...
```

3. **Stream Large Files:**
```python
# For MIDI generation of long texts
@app.route("/export-midi")
def export_midi():
    text = request.args.get("text")
    notes = cipher.text_to_notes(text)
    midi_file = converter.notes_to_midi(notes)
    return send_file(midi_file, mimetype='audio/midi')
```

---

## 🐛 Debugging

### Enable Flask Debug Mode
```python
# app.py
if __name__ == "__main__":
    app.run(debug=True)
```

### Log API Requests
```python
@app.before_request
def log_request():
    print(f"[{request.method}] {request.path}")
    print(f"  Body: {request.get_json()}")

@app.after_request
def log_response(response):
    print(f"  Status: {response.status_code}")
    return response
```

### Frontend Console Logging
```jsx
const handleEncrypt = async () => {
    console.log("Input:", inputText);
    try {
        const response = await axios.post("/encrypt", { text: inputText });
        console.log("Response:", response.data);
        setResult(response.data);
    } catch (err) {
        console.error("Error:", err);
    }
};
```

---

## 📦 Deployment

### Backend Deployment (Python Anywhere, Heroku)

```bash
# Procfile for Heroku
web: gunicorn app:app

# requirements.txt (finalized)
Flask==2.3.0
Flask-CORS==4.0.0
gunicorn==20.1.0
music21==9.1.0
```

### Frontend Deployment (Netlify, Vercel)

```bash
# Build for production
npm run build

# Deploy build/ folder
```

### Environment Variables

```python
# app.py
import os

DEBUG = os.getenv("DEBUG", "False") == "True"
PORT = int(os.getenv("PORT", 5000))
CORS_ORIGINS = os.getenv("CORS_ORIGINS", "*")

CORS(app, origins=CORS_ORIGINS)
app.run(debug=DEBUG, port=PORT)
```

---

## 🚀 Roadmap Ideas

### Phase 1 (Current)
- [x] Basic cipher
- [x] REST API
- [x] React UI
- [x] Web Audio playback

### Phase 2 (Easy)
- [ ] Custom scales
- [ ] Tempo control
- [ ] ABC sheet music viewer
- [ ] URL-based sharing

### Phase 3 (Medium)
- [ ] Harmony generation
- [ ] Instrument selection
- [ ] Message history
- [ ] User authentication

### Phase 4 (Complex)
- [ ] Real-time collaboration
- [ ] Advanced music theory
- [ ] Mobile app
- [ ] AI song naming

---

## 📖 Code Style Guide

### Python
```python
# Use type hints
def text_to_notes(text: str) -> List[Dict]:
    pass

# Docstrings for functions
def char_to_note(char: str) -> Tuple[str, float, str]:
    """
    Convert character to musical note.
    
    Args:
        char: Single character
        
    Returns:
        Tuple of (note_name, duration, char_type)
    """
    pass
```

### JavaScript/React
```jsx
// Use meaningful component names
function EncryptorComponent() { }

// Use destructuring
const { text, notes } = result;

// Add PropTypes or TypeScript
MusicPlayer.propTypes = {
    webAudioJson: PropTypes.string.required,
    noteCount: PropTypes.number,
};
```

---

**Happy developing! 🚀**
