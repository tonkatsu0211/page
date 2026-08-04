const fs = require("fs");
const wav = require("wav-decoder");
const { Midi } = require("@tonejs/midi");

const INPUT = "./public/pubAssets/ray.wav";
const OUTPUT = "output13.mid";

const FFT_SIZE = 1024;
const HOP_SIZE = 512;

const MIN_FREQ = 20;
const MAX_FREQ = 20000;

const MIN_DB = -70;

const NOTE_ON_THRESHOLD = 8;
const NOTE_OFF_THRESHOLD = 8;

function hann(n, N) {
    return 0.5 * (
        1 - Math.cos((2 * Math.PI * n) / (N - 1))
    );
}

function fft(re, im) {
    const n = re.length;

    if (n <= 1) return;

    const evenRe = new Array(n / 2);
    const evenIm = new Array(n / 2);

    const oddRe = new Array(n / 2);
    const oddIm = new Array(n / 2);

    for (let i = 0; i < n / 2; i++) {
        evenRe[i] = re[i * 2];
        evenIm[i] = im[i * 2];

        oddRe[i] = re[i * 2 + 1];
        oddIm[i] = im[i * 2 + 1];
    }

    fft(evenRe, evenIm);
    fft(oddRe, oddIm);

    for (let k = 0; k < n / 2; k++) {
        const t = (-2 * Math.PI * k) / n;

        const cos = Math.cos(t);
        const sin = Math.sin(t);

        const tre =
            cos * oddRe[k] -
            sin * oddIm[k];

        const tim =
            sin * oddRe[k] +
            cos * oddIm[k];

        re[k] = evenRe[k] + tre;
        im[k] = evenIm[k] + tim;

        re[k + n / 2] =
            evenRe[k] - tre;

        im[k + n / 2] =
            evenIm[k] - tim;
    }
}

function freqToMidi(freq) {
    return (
        69 + 12 * Math.log2(freq / 440)
    );
}

(async () => {
    console.log("loading wav...");

    const buffer = fs.readFileSync(INPUT);

    const audio = await wav.decode(buffer);

    const sampleRate = audio.sampleRate;

    const samples = audio.channelData[0];

    console.log("sampleRate =", sampleRate);
    console.log("samples =", samples.length);

    const midi = new Midi();

    const track = midi.addTrack();

    const previousEnergy = new Array(128).fill(0);

    const activeNotes = new Map();

    let frameIndex = 0;

    const totalFrames =
        Math.floor(
            (samples.length - FFT_SIZE) / HOP_SIZE
        );

    for (
        let offset = 0;
        offset + FFT_SIZE < samples.length;
        offset += HOP_SIZE
    ) {
        console.log(
            `frame ${frameIndex}/${totalFrames}`
        );

        const re = new Array(FFT_SIZE).fill(0);
        const im = new Array(FFT_SIZE).fill(0);

        for (let i = 0; i < FFT_SIZE; i++) {
            re[i] =
                samples[offset + i] *
                hann(i, FFT_SIZE);
        }

        fft(re, im);

        const midiEnergy =
            new Array(128).fill(0);
        const pitchBendMap = {};

        for (let i = 1; i < FFT_SIZE / 2; i++) {
            const freq =
                (i * sampleRate) / FFT_SIZE;

            if (
                freq < MIN_FREQ ||
                freq > MAX_FREQ
            ) {
                continue;
            }

            const mag = Math.sqrt(
                re[i] * re[i] +
                im[i] * im[i]
            );

            const db =
                20 * Math.log10(mag + 1e-12);

            if (db < MIN_DB) {
                continue;
            }

            const midiFloat =
                freqToMidi(freq);
            
            const midiNote =
                Math.floor(midiFloat);
            
            const bend =
                midiFloat - midiNote;
            
            if (
                midiNote < 0 ||
                midiNote > 127
            ) {
                continue;
            }
            
            midiEnergy[midiNote] += mag;
            
            if (!pitchBendMap[midiNote]) {
                pitchBendMap[midiNote] = [];
            }
            
            pitchBendMap[midiNote].push(bend);
        }

        const time =
            offset / sampleRate;

        for (
            let note = 0;
            note < 128;
            note++
        ) {
            const prev =
                previousEnergy[note];

            const curr =
                midiEnergy[note];

            const delta =
                curr - prev;

            if (
                delta > NOTE_ON_THRESHOLD &&
                !activeNotes.has(note)
            ) {
                let avgBend = 0;

                if (
                    pitchBendMap[note] &&
                    pitchBendMap[note].length
                ) {
                    avgBend =
                        pitchBendMap[note]
                            .reduce((a, b) => a + b, 0)
                        / pitchBendMap[note].length;
                }
                
                activeNotes.set(note, {
                    start: time,
                
                    velocity: Math.max(
                        0.05,
                        Math.min(
                            1,
                            Math.log10(curr + 1) / 4
                        )
                    ),
                
                    bend: avgBend
                });

                console.log(
                    `ON  ${note}`
                );
            }

            if (
                activeNotes.has(note) &&
                curr < NOTE_OFF_THRESHOLD
            ) {
                const noteData =
                    activeNotes.get(note);

                const duration =
                    time - noteData.start;

                if (duration > 0.03) {
                    track.addNote({
                        midi: note,
                        channel: note % 16,
                        time: noteData.start,
                        duration,
                        velocity:
                            noteData.velocity
                    });
                    
                    track.addPitchBend({
                        time: noteData.start,
                        channel: note % 16,
                        value:
                            (noteData.bend * 2) - 1
                    });

                    console.log(
                        `OFF ${note} dur=${duration.toFixed(2)}`
                    );
                }

                activeNotes.delete(note);
            }

            previousEnergy[note] =
                curr;
        }

        frameIndex++;
    }

    console.log("closing active notes...");

    const finalTime =
        samples.length / sampleRate;

    for (const [note, noteData] of activeNotes) {
        const duration =
            finalTime - noteData.start;

        if (duration > 0.03) {
            track.addNote({
                midi: note,
                channel: note % 16,
                time: noteData.start,
                duration,
                velocity:
                    noteData.velocity
            });
            
            track.addPitchBend({
                time: noteData.start,
                channel: note % 16,
                value:
                    (noteData.bend * 2) - 1
            });
        }
    }

    console.log("writing midi...");

    fs.writeFileSync(
        OUTPUT,
        Buffer.from(midi.toArray())
    );

    console.log("done");
})();