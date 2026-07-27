# 🎵 Text-to-Music Cipher 🎵

Convert words and sentences into musical notation and play them as songs!

## Overview

This project creates a **bidirectional cipher** that translates text into musical notes and vice versa. The cipher uses a deterministic algorithm to ensure the same text always produces the same melody, and that melodies can always be decrypted back to the original text.

### Key Features

- ✨ **Encrypt Text → Musical Notes**: Convert any message into a melody
- 🎼 **ABC Notation Output**: Display music in standard ABC notation format
- 🎵 **Play Music**: Listen to your encrypted message as an actual song
- 🎶 **Decrypt Notes → Text**: Reverse the process and recover original messages
- 📊 **Multiple Output Formats**: Get note sequences as text, ABC notation, and Web Audio JSON
- 🎹 **Interactive UI**: Clean, modern React interface for encryption/decryption

## How the Cipher Works

### Character-to-Note Mapping

The cipher maps text characters to musical notes using a **frequency-based hash** approach:

1. **Scale**: Uses a 16-note chromatic scale (2 octaves: C3 through D5)
2. **Base Note Selection**: Each character's ASCII value modulo 16 selects a note
3. **Duration Variation**: 
   - Vowels (A, E, I, O, U) → Quarter notes (1 beat)
   - Consonants → Eighth notes (0.5 beat)
   - Spaces → Rests (1 beat)
   - Punctuation → Short staccato eighth notes (0.5 beat)

### Example

```
Text: "HI"

H (consonant) → D3 with 0.5 beat duration
I (vowel)     → C4 with 1.0 beat duration

Output: D3(0.5) C4(1.0)
```

### Reversibility

Because the mapping is deterministic and includes vowel/consonant information in the output, the decryption process can reliably recover the original text even when there are character collisions (multiple characters mapping to the same note).

## Project Structure

```
MMMWatchaSay/
├── backend/
│   ├── cipher.py           # Core encryption/decryption logic
│   ├── music_converter.py  # Converts notes to playable formats
│   ├── app.py              # Flask API server
│   └── requirements.txt    # Python dependencies
│
├── frontend/
│   ├── public/
│   │   └── index.html      # HTML entry point
│   ├── src/
│   │   ├── App.jsx         # Main app component
│   │   ├── index.jsx       # Entry point
│   │   ├── index.js        # React initialization
│   │   ├── index.css       # Global styles
│   │   ├── App.css         # App styles
│   │   └── components/
│   │       ├── Encryptor.jsx    # Text-to-music UI
│   │       ├── Decryptor.jsx    # Music-to-text UI
│   │       └── MusicPlayer.jsx  # Audio playback
│   └── package.json        # Node dependencies
│
└── README.md               # This file
```

## Installation & Setup

### Prerequisites

- **Node.js 14+** and npm
- Modern web browser with Web Audio API support
- **Python 3.8+** (optional - only to run the reference implementation)

### Run the App

```bash
cd frontend
npm install
npm start
```

The app opens at `http://localhost:3000`. There is no server to start: the
cipher runs entirely in the browser.

### Backend (optional, reference only)

`backend/` holds the original Python implementation. It is no longer needed to
run the app and is kept as the reference the browser port is tested against.

```bash
cd backend
pip install -r requirements.txt
python test_cipher.py        # sanity check
python golden_vectors.py     # regenerate parity fixtures
```

If you change the cipher, change it in **both** places and regenerate the
fixtures, or previously encoded melodies will stop decoding.

## GitHub Pages Deployment

The whole app is static, so GitHub Pages hosts all of it.

1. Deploy from `frontend/`:

   ```bash
   npm run deploy
   ```

2. In GitHub repo settings, set Pages source to the `gh-pages` branch.

The `homepage` field in `frontend/package.json` must match your Pages URL, as
the build is served from a subpath.

## Cipher Parity

The browser cipher in `frontend/src/lib/` is a byte-for-byte port of
`backend/cipher.py`. `backend/golden_vectors.py` generates fixtures covering
every mode, keyed and unkeyed messages, capitals, punctuation and rests; the
Jest suite asserts the port reproduces them exactly.

```bash
cd frontend
npm test
```

## API Endpoints

> **Note:** These endpoints describe `backend/app.py`, the reference
> implementation. The deployed app does not call them - it runs the same logic
> locally in the browser.

### POST `/encrypt`
Converts text to musical notes.

**Request:**
```json
{
  "text": "Hello World"
}
```

**Response:**
```json
{
  "success": true,
  "original_text": "Hello World",
  "notes": [...],
  "note_sequence_text": "C3(1.0) D3(0.5) ...",
  "abc_notation": "X:1\nT:Text-to-Music Cipher\n...",
  "web_audio_json": {...},
  "note_count": 11
}
```

### POST `/decrypt`
Converts musical notes back to text.

**Request:**
```json
{
  "note_sequence": "C3(1.0) D3(0.5) E3(1.0)"
}
```

**Response:**
```json
{
  "success": true,
  "decrypted_text": "HID",
  "notes": [...],
  "note_count": 3
}
```

### POST `/format-notes`
Reformats note sequences in different output formats.

**Request:**
```json
{
  "notes": [...],
  "format": "abc" | "text" | "both"
}
```

### GET `/health`
Health check endpoint.

### GET `/info`
Returns cipher information and available endpoints.

## Usage Examples

### Encrypting a Message

1. Open the app at `http://localhost:3000`
2. Click the "Encrypt (Text → Music)" tab
3. Enter your message: "Hello"
4. Click "Convert to Music"
5. See your message encoded in:
   - Note sequence (text format)
   - ABC notation
   - Live playable music

### Decrypting a Message

1. Click the "Decrypt (Music → Text)" tab
2. Paste a note sequence: `C3(1.0) D3(0.5) E3(1.0) F3(0.5) G3(1.0)`
3. Click "Decrypt to Text"
4. See the original message reconstructed

### Sharing Encrypted Messages

1. Encrypt your message
2. Copy the "Note Sequence (Text Format)"
3. Share it with someone
4. They can paste it into the Decrypt tab to read your message

## ABC Notation

ABC notation is a human-readable format for music that can be rendered by many music players and converters.

### Format Example

```
X:1
T:Text-to-Music Cipher
M:4/4
L:1/4
Q:1/4=120
K:C
|
C D E F G A B c d e f g a b c' d' |
```

This can be pasted into tools like:
- [ABC Notation Converter](https://abcnotation.com/)
- [EasyABC](http://www.nilsliberg.se/ksp/easyabc/)
- Other ABC players and sheet music programs

## Technical Details

### Libraries & Technologies

**Backend:**
- Flask: Lightweight Python web framework
- Flask-CORS: Cross-Origin Resource Sharing support
- music21: Music notation library (optional, for MIDI generation)

**Frontend:**
- React: UI framework
- Tone.js: Web Audio API wrapper for sound generation
- Axios: HTTP client for API requests

### Note Duration Mapping

- Quarter Note = 1 beat (default)
- Eighth Note = 0.5 beat
- Half Note = 2 beats
- Full Note = 4 beats

At 120 BPM:
- 1 beat = 0.5 seconds
- A 26-character message takes approximately 8-13 seconds

## Future Enhancements

- [ ] **Custom Scales**: Let users choose musical scales (pentatonic, major, minor, etc.)
- [ ] **Tempo Control**: Adjust playback speed
- [ ] **Visual Sheet Music**: Display as actual sheet music
- [ ] **Different Instruments**: Use various instrument sounds
- [ ] **Harmony Addition**: Generate harmonies alongside the melody
- [ ] **URL Sharing**: Share encrypted messages via URLs
- [ ] **Mobile App**: React Native version for mobile devices
- [ ] **Message History**: Store and manage encrypted messages

## Troubleshooting

### Backend won't start
- Ensure Python 3.8+ is installed: `python --version`
- Check that port 5000 is available
- Verify all dependencies are installed: `pip install -r requirements.txt`

### Frontend won't load
- Ensure Node.js 14+ is installed: `node --version`
- Delete `node_modules` and `package-lock.json`, then run `npm install` again
- Check that the backend is running on port 5000

### No sound playing
- Check browser console for errors (F12)
- Ensure your browser supports Web Audio API (Chrome, Firefox, Safari, Edge)
- Try clicking elsewhere on the page first (many browsers require user interaction before playing sound)
- Check system volume

### Decryption not working correctly
- Ensure the note sequence format is correct: `NOTE(DURATION) NOTE(DURATION) ...`
- Check for extra spaces or formatting issues
- The decryption is best-effort; character collisions may result in similar-sounding letters

## License

This project is provided as-is for educational and entertainment purposes.

## Author

Created as part of the FridayVibes project series.

---

**Let your words sing!** 🎵🎶🎸
