import wave
import numpy as np

from mido import (
    Message,
    MidiFile,
    MidiTrack,
    MetaMessage,
    bpm2tempo
)

INPUT_WAV = "./public/pubAssets/ray.wav"
OUTPUT_MIDI = "./ray-spectrum-mpe.mid"

WINDOW_SIZE = 8192
HOP_SIZE = 64

THRESHOLD = 12000

MIN_FREQ = 20
MAX_FREQ = 16000

MAX_BINS_PER_FRAME = 128

CHANNEL_COUNT = 15

with wave.open(INPUT_WAV, "rb") as wav:

    sample_rate = wav.getframerate()
    channels = wav.getnchannels()
    frames = wav.getnframes()

    audio_data = wav.readframes(frames)

samples = np.frombuffer(
    audio_data,
    dtype=np.int16
)

if channels == 2:

    samples = samples.reshape(-1, 2)
    samples = samples.mean(axis=1)

samples = samples.astype(np.float32)

samples /= np.max(np.abs(samples))

midi = MidiFile()

track = MidiTrack()
midi.tracks.append(track)

midi.ticks_per_beat = 480

tempo = bpm2tempo(132)

track.append(
    MetaMessage(
        "set_tempo",
        tempo=tempo,
        time=0
    )
)

ticks = int(
    (HOP_SIZE / sample_rate)
    * midi.ticks_per_beat
    * 12
)

window_function = np.hanning(WINDOW_SIZE)

channel_states = {}

for ch in range(CHANNEL_COUNT):

    channel_states[ch] = {
        "active": False,
        "note": None
    }

    track.append(
        Message(
            "control_change",
            channel=ch,
            control=121,
            value=0,
            time=0
        )
    )

first_frame = True

for start in range(
    0,
    len(samples) - WINDOW_SIZE,
    HOP_SIZE
):

    window = (
        samples[start:start + WINDOW_SIZE]
        * window_function
    )

    fft_result = np.fft.rfft(window)

    magnitudes = np.abs(fft_result)

    freqs = np.fft.rfftfreq(
        WINDOW_SIZE,
        d=1 / sample_rate
    )

    peak_indices = np.argpartition(
        magnitudes,
        -MAX_BINS_PER_FRAME
    )[-MAX_BINS_PER_FRAME:]

    peaks = []

    for i in peak_indices:

        freq = freqs[i]
        mag = magnitudes[i]

        if mag < THRESHOLD:
            continue

        if freq < MIN_FREQ:
            continue

        if freq > MAX_FREQ:
            continue

        midi_float = (
            69
            + 12
            * np.log2(freq / 440.0)
        )

        midi_note = int(np.floor(midi_float))

        if midi_note < 0 or midi_note > 127:
            continue

        fractional = midi_float - midi_note

        pitch_bend = int(
            fractional * 8192
        )

        pitch_bend = max(
            -8192,
            min(8191, pitch_bend)
        )

        velocity = int(
            min(
                127,
                max(
                    1,
                    mag / 15000
                )
            )
        )

        peaks.append({
            "note": midi_note,
            "pitch_bend": pitch_bend,
            "velocity": velocity,
            "magnitude": mag
        })

    peaks.sort(
        key=lambda x: x["magnitude"],
        reverse=True
    )

    peaks = peaks[:CHANNEL_COUNT]

    delta = ticks if not first_frame else 0

    first_frame = False

    used_channels = set()

    for peak in peaks:

        assigned_channel = None

        for ch in range(CHANNEL_COUNT):

            state = channel_states[ch]

            if (
                state["active"]
                and state["note"] == peak["note"]
            ):

                assigned_channel = ch
                break

        if assigned_channel is None:

            for ch in range(CHANNEL_COUNT):

                if not channel_states[ch]["active"]:

                    assigned_channel = ch
                    break

        if assigned_channel is None:
            continue

        used_channels.add(assigned_channel)

        state = channel_states[assigned_channel]

        if not state["active"]:

            track.append(
                Message(
                    "pitchwheel",
                    channel=assigned_channel,
                    pitch=peak["pitch_bend"],
                    time=delta
                )
            )

            delta = 0

            track.append(
                Message(
                    "note_on",
                    channel=assigned_channel,
                    note=peak["note"],
                    velocity=peak["velocity"],
                    time=0
                )
            )

            state["active"] = True
            state["note"] = peak["note"]

        else:

            track.append(
                Message(
                    "pitchwheel",
                    channel=assigned_channel,
                    pitch=peak["pitch_bend"],
                    time=delta
                )
            )

            delta = 0

    for ch in range(CHANNEL_COUNT):

        if ch in used_channels:
            continue

        state = channel_states[ch]

        if state["active"]:

            track.append(
                Message(
                    "note_off",
                    channel=ch,
                    note=state["note"],
                    velocity=0,
                    time=0
                )
            )

            state["active"] = False
            state["note"] = None

for ch in range(CHANNEL_COUNT):

    state = channel_states[ch]

    if state["active"]:

        track.append(
            Message(
                "note_off",
                channel=ch,
                note=state["note"],
                velocity=0,
                time=ticks
            )
        )

midi.save(OUTPUT_MIDI)

import os

print(
    "Saved MIDI:",
    os.path.abspath(OUTPUT_MIDI)
)