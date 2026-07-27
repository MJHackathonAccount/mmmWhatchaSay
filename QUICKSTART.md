# 🚀 QUICKSTART - Text-to-Music Cipher

Get up and running in 5 minutes!

## 1️⃣ Test the Cipher (No Setup Required)

First, let's verify the cipher logic works:

```bash
cd backend
python test_cipher.py
```

You should see output showing the cipher converting text to musical notes and back. If this works, you're good to go!

## 2️⃣ Start the Backend

```bash
cd backend

# Create virtual environment (recommended)
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Start the server
python app.py
```

✅ Backend running at `http://localhost:5000`

## 3️⃣ Start the Frontend (New Terminal)

```bash
cd frontend

# Install dependencies
npm install

# Start development server
npm start
```

✅ Frontend opens at `http://localhost:3000`

## 4️⃣ Try It Out!

### Encrypt a Message
1. Go to "Encrypt (Text → Music)" tab
2. Type: `Hello World`
3. Click "Convert to Music"
4. See your message as:
   - Musical notes: `C3(1.0) D3(0.5) ...`
   - ABC notation (sheet music format)
   - Play it as music! 🎵

### Decrypt a Message
1. Go to "Decrypt (Music → Text)" tab
2. Paste: `C3(1.0) D3(0.5) E3(1.0) F3(0.5) G3(1.0) A3(0.5) B3(1.0)`
3. Click "Decrypt to Text"
4. Get back the original message

## 5️⃣ Share Encrypted Messages

1. Encrypt a message
2. Copy the "Note Sequence (Text Format)"
3. Share it: `C3(1.0) D3(0.5) E3(1.0) ...`
4. Others paste it in Decrypt tab to read it!

## 📊 How It Works

### Character → Note Mapping

Each letter gets a unique note based on its ASCII value:
- **A-Z** → 16 notes (chromatic scale: C3 to D5)
- **Vowels** → Quarter notes (1 beat)
- **Consonants** → Eighth notes (0.5 beat)  
- **Spaces** → Rests (1 beat)
- **Punctuation** → Short rests (0.5 beat)

### Example: "HI"
```
H (consonant) → C3(0.5)
I (vowel)     → A3(1.0)

Output: C3(0.5) A3(1.0)
```

## 🎼 Output Formats

Your encrypted message can be output as:

1. **Text Format**: `C3(1.0) D3(0.5) E3(1.0) ...`
   - Easy to share and paste
   - Decryptable format

2. **ABC Notation**: Sheet music format
   ```
   X:1
   T:My Message
   M:4/4
   L:1/4
   Q:1/4=120
   K:C
   |
   C D E F G A B |
   ```
   - Can be imported into music software
   - Rendered on [abcnotation.com](https://abcnotation.com/)

3. **Web Audio JSON**: For playing in browser
   - Used internally for playback
   - Consumed by Tone.js Web Audio library

## 🔧 API Endpoints

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/encrypt` | POST | Convert text → notes |
| `/decrypt` | POST | Convert notes → text |
| `/format-notes` | POST | Reformat notes |
| `/health` | GET | Health check |
| `/info` | GET | API info |

### Example API Call

```bash
# Encrypt text
curl -X POST http://localhost:5000/encrypt \
  -H "Content-Type: application/json" \
  -d '{"text": "Hello"}'

# Decrypt notes
curl -X POST http://localhost:5000/decrypt \
  -H "Content-Type: application/json" \
  -d '{"note_sequence": "C3(1.0) D3(0.5) E3(1.0)"}'
```

## 📝 Note Format

Notes follow this pattern: `NOTENAME(DURATION)`

### Note Names
- Octave 3: C3, D3, E3, F3, G3, A3, B3
- Octave 4: C4, D4, E4, F4, G4, A4, B4
- Octave 5: C5, D5
- Special: REST (for spaces/punctuation)

### Durations
- 0.5 = Eighth note
- 1.0 = Quarter note (default)
- 2.0 = Half note

Example: `C3(0.5)` = Note C in octave 3, held for half a beat

## 🎵 Tempo

Default: **120 BPM** (beats per minute)
- 1 beat = 0.5 seconds at 120 BPM
- A 26-character message = ~8-13 seconds

## ❓ Troubleshooting

| Problem | Solution |
|---------|----------|
| Backend won't start | Check port 5000 is free; install deps with `pip install -r requirements.txt` |
| Frontend won't load | Delete `node_modules`, run `npm install` again |
| No sound | Check browser volume; refresh page; try Chrome/Firefox |
| Decryption wrong | Check note sequence format; vowel/consonant info helps recover text |

## 🚀 Next Steps

Want to enhance this? Here are some ideas:

- [ ] Add more musical scales (pentatonic, minor, etc.)
- [ ] Change tempo/speed
- [ ] Use different instruments
- [ ] Generate harmonies
- [ ] Add visual sheet music display
- [ ] Create URL-shareable encrypted messages
- [ ] Build a mobile app version

## 📚 Learn More

See [README.md](README.md) for detailed documentation.

---

**Have fun encrypting messages into music!** 🎶✨
