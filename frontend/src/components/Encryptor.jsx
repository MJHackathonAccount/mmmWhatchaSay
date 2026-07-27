import React, { useState } from "react";
import { encryptText } from "../lib/cipherService";
import MusicPlayer from "./MusicPlayer";

const TONICS = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const MODES = [
  { value: "major", label: "major - bright" },
  { value: "minor", label: "minor - dark" },
  { value: "dorian", label: "dorian - wistful" },
  { value: "phrygian", label: "phrygian - brooding" },
  { value: "lydian", label: "lydian - floating" },
  { value: "mixolydian", label: "mixolydian - folky" },
];

function Encryptor() {
  const [inputText, setInputText] = useState("");
  const [key, setKey] = useState("");
  const [tonic, setTonic] = useState("C");
  const [mode, setMode] = useState("major");
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");

  const handleEncrypt = () => {
    if (!inputText.trim()) {
      setError("Please enter some text");
      return;
    }

    setError("");

    try {
      setResult(encryptText({ text: inputText, key, tonic, mode }));
    } catch (err) {
      setError(err.message || "Failed to encrypt text");
    }
  };

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text);
    alert("Copied to clipboard!");
  };

  return (
    <div className="section encryptor">
      <h2>Encrypt: Text → Music</h2>

      <div className={`section-body ${result ? "has-results" : ""}`}>
        <div className="form-pane">
          <div className="input-group">
            <label htmlFor="textInput">Enter your text:</label>
            <textarea
              id="textInput"
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              placeholder="Type a message..."
              rows={3}
            />
          </div>

          <div className="key-row">
            <div className="input-group">
              <label htmlFor="tonicSelect">Musical key:</label>
              <select
                id="tonicSelect"
                value={tonic}
                onChange={(e) => setTonic(e.target.value)}
              >
                {TONICS.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>

            <div className="input-group">
              <label htmlFor="modeSelect">Mode:</label>
              <select
                id="modeSelect"
                value={mode}
                onChange={(e) => setMode(e.target.value)}
              >
                {MODES.map((m) => (
                  <option key={m.value} value={m.value}>
                    {m.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="input-group">
            <label htmlFor="keyInput">Key phrase (optional):</label>
            <input
              id="keyInput"
              type="text"
              value={key}
              onChange={(e) => setKey(e.target.value)}
              placeholder="Leave blank for no key"
            />
            <small className="hint">
              The musical key doubles as a cipher key: letters are stored as
              scale degrees, so the same melody in another key spells something
              else. A key phrase shuffles the letters on top of that. Both are
              needed to read it back.
            </small>
          </div>

          <button onClick={handleEncrypt} className="btn-primary">
            Convert to Music
          </button>
          {error && <div className="error">{error}</div>}
        </div>

        {result && (
          <div className="results">
            <div className="result-section player-section">
              <h3>🎼 Play Music 🎼</h3>
              <MusicPlayer
                webAudioJson={result.web_audio_json}
                webAudioJsonHarmonic={result.web_audio_json_harmonic}
                noteCount={result.note_count}
                originalText={result.original_text}
                tonic={result.tonic}
                mode={result.mode}
              />
            </div>

            <div className="result-section">
              <h3>Original Text</h3>
              <p className="result-text">{result.original_text}</p>
            </div>

            <div className="result-section">
              <h3>Note Sequence (Text Format)</h3>
              <p className="result-code">{result.note_sequence_text}</p>
              <button
                className="btn-secondary"
                onClick={() => copyToClipboard(result.note_sequence_text)}
              >
                Copy Note Sequence
              </button>
            </div>

            <div className="result-section">
              <h3>ABC Notation</h3>
              <pre className="result-code">{result.abc_notation}</pre>
              <button
                className="btn-secondary"
                onClick={() => copyToClipboard(result.abc_notation)}
              >
                Copy ABC Notation
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default Encryptor;
