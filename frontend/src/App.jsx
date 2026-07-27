import React, { useState } from "react";
import "./App.css";
import Encryptor from "./components/Encryptor";
import Decryptor from "./components/Decryptor";

function App() {
  const [activeTab, setActiveTab] = useState("encrypt");

  return (
    <div className="App">
      <header className="App-header">
        <h1>✨ MMMWatchaSay ✨</h1>
        <p className="tagline">Whisper Words, Hear Music • Encode Secrets in Melodies</p>
      </header>

      <nav className="tabs">
        <button
          className={`tab-button ${activeTab === "encrypt" ? "active" : ""}`}
          onClick={() => setActiveTab("encrypt")}
        >
          Encrypt (Text → Music)
        </button>
        <button
          className={`tab-button ${activeTab === "decrypt" ? "active" : ""}`}
          onClick={() => setActiveTab("decrypt")}
        >
          Decrypt (Music → Text)
        </button>
      </nav>

      <main className="App-main">
        {activeTab === "encrypt" && <Encryptor />}
        {activeTab === "decrypt" && <Decryptor />}
      </main>

      <footer className="App-footer">
        <p>🎶 Turn your words into melodies 🎶</p>
      </footer>
    </div>
  );
}

export default App;
