"""
Flask backend for the Text-to-Music Cipher
"""

from flask import Flask, request, jsonify
from flask_cors import CORS
from cipher import MusicCipher
from music_converter import MusicConverter

app = Flask(__name__)
CORS(app)  # Enable CORS for frontend requests

cipher = MusicCipher()
converter = MusicConverter()


@app.route("/health", methods=["GET"])
def health():
    """Health check endpoint"""
    return jsonify({"status": "ok", "service": "Text-to-Music Cipher Backend"})


@app.route("/encrypt", methods=["POST"])
def encrypt():
    """
    Encrypt text to musical notes.
    
    Request body:
    {
        "text": "Hello World"
    }
    
    Response:
    {
        "original_text": "Hello World",
        "notes": [...],
        "note_sequence_text": "C3(1.0) D3(0.5) ...",
        "abc_notation": "...",
        "web_audio_json": {...},
        "web_audio_json_harmonic": {...}
    }
    """
    try:
        data = request.get_json()
        text = data.get("text", "")
        # Optional key. Scrambles which letter maps to which note; the same
        # phrase is needed to read the tune back.
        key = data.get("key", "")
        tonic = data.get("tonic", "C")
        mode = data.get("mode", "major")
        
        if not text:
            return jsonify({"error": "No text provided"}), 400
        
        keyed = MusicCipher(key, tonic, mode)
        
        # Convert to notes
        notes = keyed.text_to_notes(text)
        note_sequence_text = keyed.format_note_sequence(notes)
        abc_notation = converter.notes_to_abc_notation(notes)
        web_audio_json = converter.generate_web_audio_json(notes)
        web_audio_json_harmonic = converter.generate_harmonic_web_audio_json(notes)
        
        return jsonify({
            "success": True,
            "original_text": text,
            "notes": notes,
            "note_sequence_text": note_sequence_text,
            "abc_notation": abc_notation,
            "web_audio_json": web_audio_json,
            "web_audio_json_harmonic": web_audio_json_harmonic,
            "scale": keyed.scale,
            "tonic": keyed.tonic,
            "mode": keyed.mode,
            "keyed": bool(key),
            "note_count": len(notes)
        })
    
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/decrypt", methods=["POST"])
def decrypt():
    """
    Decrypt musical notes back to text.
    
    Request body:
    {
        "note_sequence": "C3(1.0) D3(0.5) ...",  # or pass notes as array
        "notes": [...]  # alternative: pass as array
    }
    
    Response:
    {
        "decrypted_text": "HELLO WORLD",
        "notes": [...]
    }
    """
    try:
        data = request.get_json()
        
        # Try to get notes from either format
        notes = data.get("notes")
        if not notes:
            note_sequence_text = data.get("note_sequence", "")
            if note_sequence_text:
                notes = cipher.parse_note_sequence(note_sequence_text)
            else:
                return jsonify({"error": "No notes provided"}), 400
        
        # Decrypt with the same key it was written with
        key = data.get("key", "")
        tonic = data.get("tonic", "C")
        mode = data.get("mode", "major")
        keyed = MusicCipher(key, tonic, mode)
        decrypted_text = keyed.notes_to_text(notes)
        
        return jsonify({
            "success": True,
            "decrypted_text": decrypted_text,
            "notes": notes,
            "tonic": keyed.tonic,
            "mode": keyed.mode,
            "keyed": bool(key),
            "note_count": len(notes)
        })
    
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/format-notes", methods=["POST"])
def format_notes():
    """
    Format note array as text or ABC notation.
    
    Request body:
    {
        "notes": [...],
        "format": "text" or "abc" or "both"
    }
    """
    try:
        data = request.get_json()
        notes = data.get("notes", [])
        format_type = data.get("format", "both")
        
        if not notes:
            return jsonify({"error": "No notes provided"}), 400
        
        result = {}
        
        if format_type in ["text", "both"]:
            result["note_sequence_text"] = cipher.format_note_sequence(notes)
        
        if format_type in ["abc", "both"]:
            result["abc_notation"] = converter.notes_to_abc_notation(notes)
        
        if format_type == "both":
            result["web_audio_json"] = converter.generate_web_audio_json(notes)
        
        return jsonify({
            "success": True,
            "format": format_type,
            **result
        })
    
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/info", methods=["GET"])
def info():
    """Get cipher information"""
    return jsonify({
        "cipher_name": "Text-to-Music Cipher",
        "scale": MusicCipher.__dict__.get("SCALE", "See source"),
        "tempo": MusicCipher.__dict__.get("TEMPO", 120),
        "supported_characters": "A-Z, a-z, spaces, and punctuation (,.!?;:'\"()-)",
        "endpoints": {
            "/health": "GET - Health check",
            "/encrypt": "POST - Encrypt text to notes",
            "/decrypt": "POST - Decrypt notes to text",
            "/format-notes": "POST - Format notes in different ways",
            "/info": "GET - This endpoint"
        }
    })


if __name__ == "__main__":
    print("Starting Text-to-Music Cipher Backend...")
    print("Available at http://localhost:5000")
    print("Endpoints:")
    print("  POST /encrypt - Convert text to musical notes")
    print("  POST /decrypt - Convert musical notes to text")
    print("  POST /format-notes - Format notes in different ways")
    print("  GET /info - API information")
    app.run(debug=True, host="0.0.0.0", port=5000)
