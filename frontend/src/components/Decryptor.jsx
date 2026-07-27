import React, { useState } from "react";
import { decryptNotes } from "../lib/cipherService";

const TONICS = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const MODES = [
  { value: "major", label: "major - bright" },
  { value: "minor", label: "minor - dark" },
  { value: "dorian", label: "dorian - wistful" },
  { value: "phrygian", label: "phrygian - brooding" },
  { value: "lydian", label: "lydian - floating" },
  { value: "mixolydian", label: "mixolydian - folky" },
];

function Decryptor() {
  const [noteSequence, setNoteSequence] = useState("");
  const [key, setKey] = useState("");
  const [tonic, setTonic] = useState("C");
  const [mode, setMode] = useState("major");
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");

  const handleDecrypt = () => {
    if (!noteSequence.trim()) {
      setError("Please paste the note sequence");
      return;
    }

    setError("");

    try {
      setResult(decryptNotes({ noteSequence, key, tonic, mode }));
    } catch (err) {
      setError(err.message || "Failed to decrypt notes");
    }
  };

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text);
    alert("Copied to clipboard!");
  };

  return (
    <div className="section decryptor">
      <h2>Decrypt: Music → Text</h2>

      <div className={`section-body ${result ? "has-results" : ""}`}>
        <div className="form-pane">
          <div className="input-group">
            <label htmlFor="noteInput">Paste note sequence:</label>
            <textarea
              id="noteInput"
              value={noteSequence}
              onChange={(e) => setNoteSequence(e.target.value)}
              placeholder="Paste the note sequence like: C3(1.0) D3(0.5) E3(1.0) ..."
              rows={3}
            />
            <small>
              Format: NOTE(DURATION) NOTE(DURATION) ... (e.g., C3(1.0) D3(0.5))
            </small>
          </div>

          <div className="key-row">
            <div className="input-group">
              <label htmlFor="decryptTonic">Musical key:</label>
              <select
                id="decryptTonic"
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
              <label htmlFor="decryptMode">Mode:</label>
              <select
                id="decryptMode"
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
            <label htmlFor="decryptKeyInput">Key phrase (optional):</label>
            <input
              id="decryptKeyInput"
              type="text"
              value={key}
              onChange={(e) => setKey(e.target.value)}
              placeholder="Leave blank if no key was used"
            />
            <small className="hint">
              The musical key, the mode and the key phrase all have to match what
              it was written with. Get any of them wrong and it still decodes,
              just into the wrong words.
            </small>
          </div>

          <button onClick={handleDecrypt} className="btn-primary">
            Decrypt to Text
          </button>

          {error && <div className="error">{error}</div>}
        </div>

        {result && (
          <div className="results">
            <div className="result-section">
              <h3>Decrypted Text</h3>
              <p className="result-text">{result.decrypted_text}</p>
              <button
                className="btn-secondary"
                onClick={() => copyToClipboard(result.decrypted_text)}
              >
                Copy Decrypted Text
              </button>
            </div>

            <div className="result-section">
              <h3>Note Count</h3>
              <p>{result.note_count} notes in the sequence</p>
            </div>

            <details className="result-section">
              <summary>View Raw Notes (Debug)</summary>
              <pre className="result-code">
                {JSON.stringify(result.notes, null, 2)}
              </pre>
            </details>
          </div>
        )}
      </div>
    </div>
  );
}

export default Decryptor;
