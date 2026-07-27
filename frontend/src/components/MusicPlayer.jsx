import React, { useState, useEffect, useRef } from "react";

// Lowpass sweep applied per note. The cutoff is expressed as a multiple of that
// note's own fundamental rather than a fixed frequency, so a bass note and a
// high note are shaped the same way instead of the filter swallowing one and
// doing nothing to the other.
//
// The piano opens bright and closes down hard, which is how a struck string
// loses its edge. The violin barely moves, because bowing keeps feeding the
// overtones.
// The piano no longer closes down as far, since a note that has gone dull is
// the easiest thing for a sustained voice to bury.
const FILTER_SWEEP = {
  piano: { start: 6, peak: 13, end: 3.5, q: 0.9 },
  violin: { start: 4, peak: 7, end: 5, q: 0.7 },
};

const FILTER_CEILING = 16000;
const FILTER_FLOOR = 180;

// Instrument definitions with different envelopes and properties.
//
// "partials" are the overtones stacked above the fundamental. What separates a
// struck string from a bowed one is not just which overtones are present but how
// long they last: a piano's upper partials die away long before the fundamental,
// while a bowed violin keeps feeding energy in so its overtones sustain. "life"
// is the fraction of the note each partial survives for.
const INSTRUMENTS = {
  piano: {
    name: "Piano",
    waveform: "sine",
    attack: 0.01,
    decay: 0.2,
    // Consonants carry the tune, so they hold a little more of their level
    // rather than dropping away under the vowel bed
    sustain: 0.5,
    release: 0.3,
    volume: 0.42,
    partials: [
      { harmonic: 2, volume: 0.16, life: 0.85 },
      { harmonic: 3, volume: 0.08, life: 0.55 },
      { harmonic: 4, volume: 0.04, life: 0.35 },
    ],
  },
  violin: {
    name: "Violin",
    waveform: "sine",
    attack: 0.15,
    decay: 0.05,
    // The vowels are a held backdrop. At 0.85 they sat more than twice as loud
    // as the piano for the whole time they were sounding, which swallowed the
    // consonants once those started ringing longer.
    sustain: 0.62,
    release: 0.1,
    volume: 0.3,
    partials: [
      { harmonic: 2, volume: 0.18, life: 1.0 },
      { harmonic: 3, volume: 0.1, life: 0.95 },
      { harmonic: 4, volume: 0.05, life: 0.9 },
      { harmonic: 5, volume: 0.03, life: 0.85 },
    ],
  },
};

// Notes now depend on the key, so they can be sharps and can sit in any octave.
// Work them out rather than looking them up.
const PITCH_CLASSES = {
  C: 0, "C#": 1, D: 2, "D#": 3, E: 4, F: 5,
  "F#": 6, G: 7, "G#": 8, A: 9, "A#": 10, B: 11,
};

function noteToMidi(note) {
  const match = /^([A-G]#?)(-?\d+)$/.exec(note || "");
  if (!match) return null;
  return (parseInt(match[2], 10) + 1) * 12 + PITCH_CLASSES[match[1]];
}

function noteToFrequency(note) {
  const midi = noteToMidi(note);
  return midi === null ? 440 : 440 * Math.pow(2, (midi - 69) / 12);
}

// The ear grows more sensitive as pitch rises, so without a taper the top of the
// range swamps the bottom. Anchored in octaves above C3 rather than to specific
// note names, because the note names change with the key.
const C3_MIDI = 48;
const VOLUME_ANCHORS = [
  [0, 1.0],
  [1, 0.88],
  [2, 0.45],
  [3, 0.22],
];

function volumeForNote(note) {
  const midi = noteToMidi(note);
  if (midi === null) return 1.0;

  const octaves = (midi - C3_MIDI) / 12;
  if (octaves <= VOLUME_ANCHORS[0][0]) return VOLUME_ANCHORS[0][1];

  for (let i = 1; i < VOLUME_ANCHORS.length; i++) {
    const [prevX, prevY] = VOLUME_ANCHORS[i - 1];
    const [x, y] = VOLUME_ANCHORS[i];
    if (octaves <= x) {
      const t = (octaves - prevX) / (x - prevX);
      return prevY + t * (y - prevY);
    }
  }

  return VOLUME_ANCHORS[VOLUME_ANCHORS.length - 1][1];
}

// Semitones between two notes, or null if either is unknown. Measured in
// semitones rather than scale steps so it works whatever key the piece is in.
function intervalBetween(fromNote, toNote) {
  const from = noteToMidi(fromNote);
  const to = noteToMidi(toNote);
  if (from === null || to === null) return null;
  return Math.abs(to - from);
}

// Map letters to instruments
function getInstrumentForLetter(char) {
  const vowels = "AEIOUaeiou";
  
  if (vowels.includes(char)) {
    return "violin"; // Smooth, sustained
  }
  return "piano"; // All consonants
}

// Each note is played by a pair of oscillators pushed slightly apart in pitch.
// They drift in and out of phase, which is what gives the tone some warmth
// instead of the flat sound of a single sine.
const DETUNE_CENTS = 6;

// Push the two voices to opposite sides so the sustained vowel line and the
// consonant line occupy their own space instead of competing in the middle.
// -1 is hard left, +1 is hard right.
const INSTRUMENT_PAN = {
  violin: -0.35,
  piano: 0.35,
};

// Reverb settings. Wet is the share of the signal that goes through the
// convolver: 0 is bone dry, 1 is nothing but reflections.
const REVERB_SECONDS = 2.2;
const REVERB_DECAY = 2.5;
const REVERB_WET = 0.3;

// A convolver needs an impulse response to work with. White noise on an
// exponential fade is a convincing stand-in for a hall, and avoids shipping an
// audio file.
function createImpulseResponse(audioContext, seconds, decay) {
  const sampleRate = audioContext.sampleRate;
  const length = Math.floor(sampleRate * seconds);
  const impulse = audioContext.createBuffer(2, length, sampleRate);

  for (let channel = 0; channel < impulse.numberOfChannels; channel++) {
    const samples = impulse.getChannelData(channel);
    for (let i = 0; i < length; i++) {
      samples[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, decay);
    }
  }

  return impulse;
}

// Web Audio API synth with instrument support
class InstrumentalSynth {
  constructor() {
    const audioContext = new (window.AudioContext || window.webkitAudioContext)();
    this.audioContext = audioContext;
    this.oscillators = [];
    this.gains = [];
    this.pendingTimeouts = [];

    // Every voice routes through a single master bus rather than connecting
    // straight to the speakers. Effects get inserted here once, instead of
    // being wired up per note.
    this.masterGain = audioContext.createGain();
    this.masterGain.gain.value = 1.0;

    // Split the bus into a dry path and a parallel reverb send
    this.dryGain = audioContext.createGain();
    this.dryGain.gain.value = 1 - REVERB_WET;

    this.reverb = audioContext.createConvolver();
    this.reverb.buffer = createImpulseResponse(
      audioContext,
      REVERB_SECONDS,
      REVERB_DECAY
    );

    this.wetGain = audioContext.createGain();
    this.wetGain.gain.value = REVERB_WET;

    // Catch peaks where several voices stack up. A high ratio and a threshold
    // close to full scale make this a safety net rather than a compressor - it
    // should stay out of the way of the movement dynamics.
    this.limiter = audioContext.createDynamicsCompressor();
    this.limiter.threshold.value = -3;
    this.limiter.knee.value = 0;
    this.limiter.ratio.value = 20;
    this.limiter.attack.value = 0.003;
    this.limiter.release.value = 0.25;

    this.masterGain.connect(this.dryGain);
    this.dryGain.connect(this.limiter);

    this.masterGain.connect(this.reverb);
    this.reverb.connect(this.wetGain);
    this.wetGain.connect(this.limiter);

    // Tap the final signal so the visuals can react to what is actually
    // audible, rather than running off a timer alongside it
    this.analyser = audioContext.createAnalyser();
    this.analyser.fftSize = 256;
    this.levelData = new Uint8Array(this.analyser.frequencyBinCount);

    this.limiter.connect(this.analyser);
    this.analyser.connect(audioContext.destination);
  }

  // Current output level, 0..1
  getLevel() {
    this.analyser.getByteFrequencyData(this.levelData);
    let total = 0;
    for (let i = 0; i < this.levelData.length; i++) {
      total += this.levelData[i];
    }
    return total / this.levelData.length / 255;
  }

  playNote(note, duration, instrument = "piano", options = {}) {
    const { interval = null } = options;
    const freq = noteToFrequency(note);
    const startTime = this.audioContext.currentTime;

    const instrumentConfig = INSTRUMENTS[instrument] || INSTRUMENTS.piano;
    let { waveform, attack, decay, sustain, release, volume } = instrumentConfig;

    volume = volume * volumeForNote(note);

    // Movement dynamics: the further a note leaps from the one before it, the
    // louder it sits. Big leaps read as the melody, static/stepwise notes fall
    // back to a supporting bass. Volume only - the cipher is untouched.
    let playDuration = duration;
    if (interval !== null) {
      volume = volume * (0.75 + (Math.min(interval, 12) / 12) * 0.5);

      if (interval === 0) {
        // Same note twice in a row. Clip it short and re-attack sharply so the
        // repeat is audible as two notes instead of one smeared tone.
        playDuration = duration * 0.85;
        attack = Math.min(attack, 0.02);
      }
    }

    const endTime = startTime + playDuration;

    // A detuned pair per note. Both feed the same gain node so they share one
    // envelope; the level is halved so the pair doesn't sum louder than the
    // single oscillator it replaces.
    const osc = this.audioContext.createOscillator();
    const osc2 = this.audioContext.createOscillator();
    const gain = this.audioContext.createGain();

    osc.frequency.value = freq;
    osc.type = waveform;
    osc.detune.value = -DETUNE_CENTS;

    osc2.frequency.value = freq;
    osc2.type = waveform;
    osc2.detune.value = DETUNE_CENTS;

    volume = volume * 0.55;

    // ADSR envelope with overlap for legato
    gain.gain.setValueAtTime(0, startTime);
    gain.gain.linearRampToValueAtTime(volume, startTime + attack);

    const decayEndTime = startTime + attack + decay;
    gain.gain.linearRampToValueAtTime(volume * sustain, decayEndTime);

    // Short notes can leave no room for the release, which would push the
    // envelope points out of order
    const releaseStartTime = Math.max(decayEndTime, endTime - release);
    gain.gain.setValueAtTime(volume * sustain, releaseStartTime);
    gain.gain.linearRampToValueAtTime(0, endTime);

    osc.connect(gain);
    osc2.connect(gain);

    // Pan the voice before it hits the bus, so the reverb send picks up the
    // placement too rather than smearing everything back to centre
    const panner = this.audioContext.createStereoPanner();
    panner.pan.value = INSTRUMENT_PAN[instrument] ?? 0;
    panner.connect(this.masterGain);

    // Sweep a lowpass across the note. The partials feed through it too, since
    // shaping them over time is the whole point.
    const sweep = FILTER_SWEEP[instrument];
    let voiceOutput = panner;

    if (sweep) {
      const clamp = multiple =>
        Math.min(Math.max(freq * multiple, FILTER_FLOOR), FILTER_CEILING);

      const filter = this.audioContext.createBiquadFilter();
      filter.type = "lowpass";
      filter.Q.value = sweep.q;

      filter.frequency.setValueAtTime(clamp(sweep.start), startTime);
      filter.frequency.linearRampToValueAtTime(
        clamp(sweep.peak),
        startTime + attack
      );
      filter.frequency.exponentialRampToValueAtTime(clamp(sweep.end), endTime);

      filter.connect(panner);
      voiceOutput = filter;
    }

    gain.connect(voiceOutput);

    osc.start(startTime);
    osc.stop(endTime);
    osc2.start(startTime);
    osc2.stop(endTime);

    this.oscillators.push(osc, osc2);
    this.gains.push(gain);

    this.addPartials(freq, playDuration, startTime, instrumentConfig, volume, voiceOutput);
  }

  // Stack the overtones above a note. Each partial gets its own envelope so the
  // upper ones can fade early, which is most of what makes a struck note sound
  // different from a bowed one.
  addPartials(freq, duration, startTime, instrumentConfig, baseVolume, output) {
    const { attack, decay, sustain, release, partials } = instrumentConfig;
    if (!partials) return;

    partials.forEach(({ harmonic, volume: partialVolume, life }) => {
      const partialFreq = freq * harmonic;

      // Anything above hearing range is just wasted CPU
      if (partialFreq > 16000) return;

      const partialDuration = duration * life;
      const endTime = startTime + partialDuration;
      const level = baseVolume * partialVolume;

      const osc = this.audioContext.createOscillator();
      const gain = this.audioContext.createGain();

      osc.frequency.value = partialFreq;
      osc.type = "sine";

      gain.gain.setValueAtTime(0, startTime);
      gain.gain.linearRampToValueAtTime(level, startTime + attack);

      const decayEndTime = startTime + attack + decay;
      gain.gain.linearRampToValueAtTime(level * sustain, decayEndTime);

      const releaseStartTime = Math.max(decayEndTime, endTime - release);
      gain.gain.setValueAtTime(level * sustain, releaseStartTime);
      gain.gain.linearRampToValueAtTime(0, endTime);

      osc.connect(gain);
      gain.connect(output);

      osc.start(startTime);
      osc.stop(endTime);

      // Without this the partials keep ringing after Stop
      this.oscillators.push(osc);
    });
  }

  stop() {
    // Clear all pending timeouts
    this.pendingTimeouts.forEach(timeout => clearTimeout(timeout));
    this.pendingTimeouts = [];

    // Stop all oscillators
    this.oscillators.forEach(osc => {
      try {
        osc.stop();
      } catch (e) {}
    });
    this.oscillators = [];
    this.gains = [];

    // Silencing the oscillators leaves the reverb tail ringing for a couple of
    // seconds, which reads as "Stop didn't work". Duck the send briefly - the
    // short fade avoids a click - then restore it for the next play.
    const now = this.audioContext.currentTime;
    this.wetGain.gain.cancelScheduledValues(now);
    this.wetGain.gain.setValueAtTime(this.wetGain.gain.value, now);
    this.wetGain.gain.linearRampToValueAtTime(0, now + 0.12);
    this.wetGain.gain.setValueAtTime(REVERB_WET, now + 0.2);
  }

  addPendingTimeout(timeout) {
    this.pendingTimeouts.push(timeout);
  }
}

const STREAM_COLORS = {
  harmony: { idle: "rgba(240, 147, 251, 0.45)", active: "#ffd6fb" },
  melody: { idle: "rgba(102, 126, 234, 0.5)", active: "#c8d4ff" },
};

// How much horizontal space one second of music occupies once the roll starts
// scrolling. Higher spreads the notes out further.
const BASE_PIXELS_PER_SECOND = 90;

// Where the playhead sits while the roll scrolls underneath it
const PLAYHEAD_POSITION = 0.3;

// Piano roll: time runs left to right, pitch bottom to top. Short pieces are
// fitted to the canvas; longer ones keep a readable note size and scroll past a
// fixed playhead instead of being squeezed down to nothing.
function drawRoll(canvas, schedule, elapsed, activeIndices) {
  if (!canvas) return;

  const ratio = window.devicePixelRatio || 1;
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;
  if (!width || !height) return;

  if (canvas.width !== width * ratio || canvas.height !== height * ratio) {
    canvas.width = width * ratio;
    canvas.height = height * ratio;
  }

  const ctx = canvas.getContext("2d");
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  ctx.clearRect(0, 0, width, height);

  const { events, totalTime } = schedule;
  if (!events.length || !totalTime) return;

  const fits = totalTime * BASE_PIXELS_PER_SECOND <= width;
  const pixelsPerSecond = fits ? width / totalTime : BASE_PIXELS_PER_SECOND;
  const position = Math.max(elapsed, 0);
  const playheadX = fits ? position * pixelsPerSecond : width * PLAYHEAD_POSITION;
  const windowStart = fits ? 0 : position - playheadX / pixelsPerSecond;

  // Rows come from the pitches actually present, so the roll fits whatever key
  // the piece is written in
  let lowest = Infinity;
  let highest = -Infinity;
  events.forEach(event => {
    const midi = noteToMidi(event.note);
    if (midi === null) return;
    if (midi < lowest) lowest = midi;
    if (midi > highest) highest = midi;
  });
  if (lowest === Infinity) return;

  const rows = highest - lowest + 1;
  const rowHeight = height / rows;
  const active = new Set(activeIndices);

  events.forEach(event => {
    const midi = noteToMidi(event.note);
    if (midi === null) return;

    const x = (event.startTime - windowStart) * pixelsPerSecond;
    const w = Math.max(event.duration * pixelsPerSecond, 2);

    // Skip anything scrolled off either edge
    if (x + w < 0 || x > width) return;

    const y = height - (midi - lowest + 1) * rowHeight;
    const h = Math.max(rowHeight - 1, 2);

    const colors = STREAM_COLORS[event.stream] || STREAM_COLORS.melody;
    const isActive = active.has(event.index);

    ctx.fillStyle = isActive ? colors.active : colors.idle;
    if (isActive) {
      ctx.shadowColor = colors.active;
      ctx.shadowBlur = 12;
    }
    ctx.fillRect(x, y, w, h);
    ctx.shadowBlur = 0;
  });

  if (elapsed >= 0) {
    ctx.strokeStyle = "rgba(255, 255, 255, 0.75)";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(playheadX, 0);
    ctx.lineTo(playheadX, height);
    ctx.stroke();
  }
}

// Consonants are notated as eighths, which at 120bpm is a 0.25s stab - short
// enough to flit around the sustained vowels rather than sit with them. Letting
// them ring past their notated length is ordinary legato: notes still *start* on
// the same grid and the encoded sequence is untouched, they just overlap.
const CONSONANT_SUSTAIN = 2.4;

// How long a note should actually sound for, as opposed to how long it is
// written. Repeated notes are left alone - they rely on ending early to
// re-articulate, and stretching them would smear the repeat back into one tone.
function soundingDuration(duration, instrument, interval) {
  if (instrument !== "piano" || interval === 0) return duration;
  return duration * CONSONANT_SUSTAIN;
}

// Flatten either playback mode into one list of scheduled events. Audio and
// visuals both read from this, so what you see cannot drift from what you hear.
function buildRegularSchedule(audioData) {
  const tempo = audioData.tempo || 120;
  const beatDuration = 60 / tempo;
  const events = [];
  let totalTime = 0;
  let previousNote = null;

  for (let i = 0; i < audioData.notes.length; i++) {
    const noteData = audioData.notes[i];
    const note = noteData.note;
    const durMultiplier = parseFloat(noteData.duration) || 1;
    const noteDuration = beatDuration * durMultiplier;

    if (note && note !== "REST") {
      const originalChar = noteData.char || "";
      const instrument = getInstrumentForLetter(originalChar);
      const interval = intervalBetween(previousNote, note);

      events.push({
        note,
        startTime: totalTime,
        duration: soundingDuration(noteDuration, instrument, interval),
        instrument,
        interval,
        index: noteData.index,
        stream: "melody",
      });
      previousNote = note;
    }

    // Advance by the notated length, not the sounding one, so letting notes
    // ring does not slow the piece down
    totalTime += noteDuration;
  }

  return { events, totalTime };
}

function buildHarmonicSchedule(audioData) {
  const events = [];
  let totalTime = 0;

  // Each stream is its own voice, so movement is measured within a stream
  let previousHarmonyNote = null;
  let previousMelodyNote = null;

  (audioData.harmony || []).forEach(harmNote => {
    events.push({
      note: harmNote.note,
      startTime: harmNote.startTime,
      duration: harmNote.duration,
      instrument: "violin",
      interval: intervalBetween(previousHarmonyNote, harmNote.note),
      index: harmNote.index,
      stream: "harmony",
    });
    previousHarmonyNote = harmNote.note;
    totalTime = Math.max(totalTime, harmNote.startTime + harmNote.duration);
  });

  (audioData.melody || []).forEach(melodyNote => {
    const interval = intervalBetween(previousMelodyNote, melodyNote.note);
    events.push({
      note: melodyNote.note,
      startTime: melodyNote.startTime,
      duration: soundingDuration(melodyNote.duration, "piano", interval),
      instrument: "piano",
      interval,
      index: melodyNote.index,
      stream: "melody",
    });
    previousMelodyNote = melodyNote.note;
    totalTime = Math.max(totalTime, melodyNote.startTime + melodyNote.duration);
  });

  return { events, totalTime };
}

function MusicPlayer({ webAudioJson, noteCount, webAudioJsonHarmonic, originalText }) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [synth, setSynth] = useState(null);
  const [useHarmonic, setUseHarmonic] = useState(true);
  const [activeChars, setActiveChars] = useState([]);

  const canvasRef = useRef(null);
  const playerRef = useRef(null);
  const textRef = useRef(null);
  const frameRef = useRef(null);
  const scheduleRef = useRef({ events: [], totalTime: 0 });
  const startedAtRef = useRef(0);
  const activeKeyRef = useRef("");

  useEffect(() => {
    setSynth(new InstrumentalSynth());
  }, []);

  // A new message invalidates whatever the canvas is currently showing
  useEffect(() => {
    scheduleRef.current = { events: [], totalTime: 0 };
    setActiveChars([]);
    drawRoll(canvasRef.current, { events: [], totalTime: 0 }, -1, []);
    if (textRef.current) textRef.current.scrollTop = 0;
  }, [webAudioJson, webAudioJsonHarmonic]);

  // Keep the lit character in view. Only scrolls when it has actually left the
  // visible area, so the text advances a line at a time instead of twitching on
  // every character.
  useEffect(() => {
    const container = textRef.current;
    if (!container || activeChars.length === 0) return;

    const lit = container.querySelector(".char.active");
    if (!lit) return;

    const top = lit.offsetTop;
    const bottom = top + lit.offsetHeight;
    const viewTop = container.scrollTop;
    const viewBottom = viewTop + container.clientHeight;

    if (top < viewTop || bottom > viewBottom) {
      container.scrollTo({
        top: Math.max(top - container.clientHeight / 2, 0),
        behavior: "smooth",
      });
    }
  }, [activeChars]);

  const stopVisuals = () => {
    if (frameRef.current) {
      cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
    }
    activeKeyRef.current = "";
    setActiveChars([]);
    if (playerRef.current) {
      playerRef.current.style.setProperty("--audio-level", "0");
    }
    drawRoll(canvasRef.current, scheduleRef.current, -1, []);
  };

  const runVisuals = () => {
    const tick = () => {
      const schedule = scheduleRef.current;
      const elapsed = (performance.now() - startedAtRef.current) / 1000;

      const active = schedule.events.filter(
        event => elapsed >= event.startTime && elapsed < event.startTime + event.duration
      );
      const indices = active
        .map(event => event.index)
        .filter(index => index !== undefined);

      // Re-render the text only when the highlighted set actually changes,
      // rather than on every one of the 60 frames per second
      const key = indices.slice().sort((a, b) => a - b).join(",");
      if (key !== activeKeyRef.current) {
        activeKeyRef.current = key;
        setActiveChars(indices);
      }

      // The glow is driven straight from the output level, so it breathes with
      // the audio instead of running on its own clock
      if (playerRef.current && synth) {
        playerRef.current.style.setProperty(
          "--audio-level",
          synth.getLevel().toFixed(3)
        );
      }

      drawRoll(canvasRef.current, schedule, elapsed, indices);

      frameRef.current = requestAnimationFrame(tick);
    };

    frameRef.current = requestAnimationFrame(tick);
  };

  const handlePlay = async () => {
    if (!webAudioJson || !synth) return;

    // Choose which audio data to use
    const audioDataJson = useHarmonic ? webAudioJsonHarmonic : webAudioJson;
    if (!audioDataJson) return;

    // Clear any previous playback
    synth.stop();
    stopVisuals();

    try {
      const audioData = JSON.parse(audioDataJson);
      const schedule =
        useHarmonic && audioData.harmony && audioData.melody
          ? buildHarmonicSchedule(audioData)
          : buildRegularSchedule(audioData);

      if (schedule.events.length === 0) return;

      setIsPlaying(true);
      scheduleRef.current = schedule;
      startedAtRef.current = performance.now();

      schedule.events.forEach(event => {
        const timeout = setTimeout(() => {
          synth.playNote(event.note, event.duration, event.instrument, {
            interval: event.interval,
          });
        }, event.startTime * 1000);
        synth.addPendingTimeout(timeout);
      });

      const finalTimeout = setTimeout(() => {
        setIsPlaying(false);
        stopVisuals();
      }, schedule.totalTime * 1000);
      synth.addPendingTimeout(finalTimeout);

      runVisuals();
    } catch (err) {
      console.error("Error playing audio:", err);
      setIsPlaying(false);
      stopVisuals();
    }
  };

  const handleStop = () => {
    if (synth) {
      synth.stop();
      setIsPlaying(false);
      stopVisuals();
    }
  };

  // Leaving a running animation frame behind would keep drawing after unmount
  useEffect(() => {
    return () => {
      if (frameRef.current) cancelAnimationFrame(frameRef.current);
    };
  }, []);

  return (
    <div className="music-player" ref={playerRef}>
      <p className="instrument-info">
        🎻 Vowels: Violin • Consonants: Piano
      </p>

      <canvas className="note-roll" ref={canvasRef} />

      {originalText && (
        <p className="playing-text" ref={textRef}>
          {originalText.split("").map((char, index) => (
            <span
              key={index}
              className={activeChars.includes(index) ? "char active" : "char"}
            >
              {char === " " ? "\u00a0" : char}
            </span>
          ))}
        </p>
      )}

      <div className="player-controls">
        <label className="harmonic-toggle">
          <input
            type="checkbox"
            checked={useHarmonic}
            onChange={(e) => setUseHarmonic(e.target.checked)}
            disabled={isPlaying}
          />
          <span> Harmonic Mode</span>
        </label>
        <button
          className={`btn-play ${isPlaying ? "playing" : ""}`}
          onClick={handlePlay}
          disabled={isPlaying}
        >
          ▶ Play
        </button>
        <button
          className="btn-stop"
          onClick={handleStop}
          disabled={!isPlaying}
        >
          ⏹ Stop
        </button>
      </div>
      <p className="player-info">
        {isPlaying ? "🎵 Playing..." : `Ready to play ${noteCount} notes`}
      </p>
    </div>
  );
}

export default MusicPlayer;
