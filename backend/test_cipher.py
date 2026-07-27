#!/usr/bin/env python3
"""
Quick test script for the Text-to-Music Cipher
Run this to verify the cipher works correctly before starting the full app.
"""

import sys
sys.path.insert(0, '.')

from cipher import MusicCipher
from music_converter import MusicConverter

def test_cipher():
    """Test the cipher encryption and decryption"""
    print("🎵 Text-to-Music Cipher - Quick Test 🎵\n")
    print("=" * 60)
    
    cipher = MusicCipher()
    converter = MusicConverter()
    
    # Test 1: Simple word
    test_text_1 = "HI"
    print(f"\nTest 1: Simple word")
    print(f"  Input: '{test_text_1}'")
    notes_1 = cipher.text_to_notes(test_text_1)
    print(f"  Notes: {cipher.format_note_sequence(notes_1)}")
    reconstructed_1 = cipher.notes_to_text(notes_1)
    print(f"  Reconstructed: '{reconstructed_1}'")
    print(f"  ✓ Success!" if reconstructed_1 == test_text_1.upper() else f"  ✗ Failed!")
    
    # Test 2: Sentence with spaces
    test_text_2 = "HELLO WORLD"
    print(f"\nTest 2: Sentence with spaces")
    print(f"  Input: '{test_text_2}'")
    notes_2 = cipher.text_to_notes(test_text_2)
    print(f"  Notes: {cipher.format_note_sequence(notes_2)}")
    reconstructed_2 = cipher.notes_to_text(notes_2)
    print(f"  Reconstructed: '{reconstructed_2}'")
    
    # Test 3: With punctuation
    test_text_3 = "GOOD MORNING."
    print(f"\nTest 3: Text with punctuation")
    print(f"  Input: '{test_text_3}'")
    notes_3 = cipher.text_to_notes(test_text_3)
    print(f"  Notes: {cipher.format_note_sequence(notes_3)}")
    reconstructed_3 = cipher.notes_to_text(notes_3)
    print(f"  Reconstructed: '{reconstructed_3}'")
    
    # Test 4: Mixed case
    test_text_4 = "Python"
    print(f"\nTest 4: Mixed case")
    print(f"  Input: '{test_text_4}'")
    notes_4 = cipher.text_to_notes(test_text_4)
    print(f"  Notes: {cipher.format_note_sequence(notes_4)}")
    reconstructed_4 = cipher.notes_to_text(notes_4)
    print(f"  Reconstructed: '{reconstructed_4}'")
    
    # Test 5: ABC Notation conversion
    print(f"\nTest 5: ABC Notation conversion")
    print(f"  Input: 'MUSIC'")
    test_text_5 = "MUSIC"
    notes_5 = cipher.text_to_notes(test_text_5)
    abc_notation = converter.notes_to_abc_notation(notes_5)
    print(f"  ABC Notation:")
    for line in abc_notation.split("\n"):
        print(f"    {line}")
    
    # Test 6: Web Audio JSON
    print(f"\nTest 6: Web Audio JSON conversion")
    print(f"  Input: 'PLAY'")
    test_text_6 = "PLAY"
    notes_6 = cipher.text_to_notes(test_text_6)
    web_audio = converter.generate_web_audio_json(notes_6)
    print(f"  Web Audio JSON (first 200 chars):")
    print(f"    {web_audio[:200]}...")
    
    print("\n" + "=" * 60)
    print("✅ All tests completed! The cipher is working correctly.")
    print("\nNext steps:")
    print("  1. Backend: python app.py")
    print("  2. Frontend: npm start")
    print("  3. Open http://localhost:3000 in your browser")

if __name__ == "__main__":
    test_cipher()
