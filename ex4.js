//Definició de variables
const idleSection1 = document.getElementById('idleSection1');
const idleSection2 = document.getElementById('idleSection2');
const goToIdle2Btn = document.getElementById('goToIdle2Btn');
const evaluatingSection = document.getElementById('evaluatingSection');
const startBtn = document.getElementById('startBtn');
const listenBtn = document.getElementById('listenBtn');
const nextBtn = document.getElementById('nextBtn'); 
const voiceBtns = document.querySelectorAll('.voice-btn');
const backBtn = document.getElementById('backBtn');
const repeatBtn = document.getElementById('repeatBtn');
const WHITE_KEYS = [0, 2, 4, 5, 7, 9, 11];

const bufferSize = 2048; 

let smoothedPitchFreq = 0;
const smoothingFactor = 0.08;
let totalAttempts = 0;
let totalScore = 0;
let totalMaxScore = 0; 
let MIN_FREQ;
let MAX_FREQ;
let selectedVoice = null;
let audioCtx;
let analyser;
let dataArray;
let source;
let isListening = false;
let animationId;
let stream;
let micGain;
let isWaitingForSilence = false; 
let silenceFrames = 0;
let allowedIntervalIndices = []; 
let allowedAccidentals = [];


let SEQUENCE_LENGTH = 6; 
let targetSequenceNotes = []; 
let sungSequenceNotes = []; 
let isProcessingNext = false;
let currentPitchStableFrames = 0; 
let lastDetectedMidi = -1;

// DICCIONARI D'ENARMÒNICS I ORTOGRAFIA

const ENHARMONICS = {
    0:  [{l: 'c', a: 'n', o: 0}, {l: 'b', a: '#', o: -1}, {l: 'd', a: 'bb', o: 0}], 
    1:  [{l: 'c', a: '#', o: 0}, {l: 'd', a: 'b', o: 0}, {l: 'b', a: '##', o: -1}], 
    2:  [{l: 'd', a: 'n', o: 0}, {l: 'c', a: '##', o: 0}, {l: 'e', a: 'bb', o: 0}], 
    3:  [{l: 'd', a: '#', o: 0}, {l: 'e', a: 'b', o: 0}, {l: 'f', a: 'bb', o: 0}], 
    4:  [{l: 'e', a: 'n', o: 0}, {l: 'f', a: 'b', o: 0}, {l: 'd', a: '##', o: 0}], 
    5:  [{l: 'f', a: 'n', o: 0}, {l: 'e', a: '#', o: 0}, {l: 'g', a: 'bb', o: 0}], 
    6:  [{l: 'f', a: '#', o: 0}, {l: 'g', a: 'b', o: 0}, {l: 'e', a: '##', o: 0}], 
    7:  [{l: 'g', a: 'n', o: 0}, {l: 'f', a: '##', o: 0}, {l: 'a', a: 'bb', o: 0}], 
    8:  [{l: 'g', a: '#', o: 0}, {l: 'a', a: 'b', o: 0}],                           
    9:  [{l: 'a', a: 'n', o: 0}, {l: 'g', a: '##', o: 0}, {l: 'b', a: 'bb', o: 0}], 
    10: [{l: 'a', a: '#', o: 0}, {l: 'b', a: 'b', o: 0}, {l: 'c', a: 'bb', o: 1}],  
    11: [{l: 'b', a: 'n', o: 0}, {l: 'c', a: 'b', o: 1}, {l: 'a', a: '##', o: 0}]   
};

// Genera una ortografia a l'atzar per a un MIDI
// isTenorOffset suma 1 a l'octava visual si l'usuari és tenor (perquè utilitza clau 8vb)
function getSpellingForMidi(midi, isTenorOffset = 0) {
    if (midi < 0) return null;
    const pitchClass = midi % 12;
    const baseOctave = Math.floor(midi / 12) - 1 + isTenorOffset;
    
    const options = ENHARMONICS[pitchClass];
    
    const validOptions = options.filter(choice => {
        if (choice.a === 'n') return true; 
        if (choice.a === '#' || choice.a === 'b') return true; 
        if (allowedAccidentals.includes('double') && (choice.a === '##' || choice.a === 'bb')) return true;
        return false;
    });

    const finalOptions = validOptions.length > 0 ? validOptions : options;
    const choice = finalOptions[Math.floor(Math.random() * finalOptions.length)];
    
    return {
        midi: midi,
        key: `${choice.l}/${baseOctave + choice.o}`,
        acc: choice.a,
        nameUI: `${choice.l.toUpperCase()}${choice.a === 'n' ? '' : choice.a}${baseOctave + choice.o}`
    };
}

function validarOpciones() {
    const activeAccs = document.querySelectorAll('.acc-btn.selected');
    const activeInts = document.querySelectorAll('.int-btn.selected');

    allowedAccidentals = Array.from(activeAccs).map(b => b.dataset.acc);
    allowedIntervalIndices = Array.from(activeInts).map(b => parseInt(b.dataset.index));

    if (allowedIntervalIndices.length === 0) {
        startBtn.disabled = true;
    } else {
        startBtn.disabled = false; 
    }
}

const settingsModal = document.getElementById('settingsModal');
const openSettingsBtn = document.getElementById('openSettingsBtn');
const closeSettingsBtn = document.getElementById('closeSettingsBtn');

openSettingsBtn.addEventListener('click', () => {
    settingsModal.style.display = 'flex';
});

closeSettingsBtn.addEventListener('click', () => {
    settingsModal.style.display = 'none';

     generateChallenge(); 
});


voiceBtns.forEach(btn => {
    btn.addEventListener('click', () => {
        voiceBtns.forEach(b => b.classList.remove('selected'));
        btn.classList.add('selected');
        
        MIN_FREQ = parseFloat(btn.dataset.min);
        MAX_FREQ = parseFloat(btn.dataset.max);
        
        selectedVoice = btn.textContent;
        goToIdle2Btn.disabled = false;
        console.log(`Tessitura seleccionada: ${selectedVoice} (${MIN_FREQ}-${MAX_FREQ} Hz)`);
    });
});
goToIdle2Btn.addEventListener('click', () => {
    idleSection1.style.display = 'none';
    idleSection2.style.display = 'block';
});

const allIntBtns = document.querySelectorAll('.int-btn');

allIntBtns.forEach(btn => {
    btn.addEventListener('click', (e) => {
        const clickedIndex = e.target.dataset.index;
        
        const matchingBtns = document.querySelectorAll(`.int-btn[data-index="${clickedIndex}"]`);
        
        matchingBtns.forEach(b => b.classList.toggle('selected'));
        
        validarOpciones();
    });
});

const allAccBtns = document.querySelectorAll('.acc-btn');


allAccBtns.forEach(btn => {

    btn.addEventListener('click', (e) => {
        const clickedAcc = e.target.dataset.acc;
        const matchingBtns = document.querySelectorAll(`.acc-btn[data-acc="${clickedAcc}"]`);
        matchingBtns.forEach(b => b.classList.toggle('selected'));
        validarOpciones();

    });

});

const lengthBtns = document.querySelectorAll('.len-btn');
lengthBtns.forEach(btn => {
    btn.addEventListener('click', (e) => {
        lengthBtns.forEach(b => b.classList.remove('selected'));
        e.target.classList.add('selected');
        
        SEQUENCE_LENGTH = parseInt(e.target.dataset.len);
        console.log(`Nova llargada: ${SEQUENCE_LENGTH} notes`);
    });
});


startBtn.addEventListener('click', async() => {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    try {
        stream = await navigator.mediaDevices.getUserMedia({ 
            audio:true, echoCancellation:false, noiseSuppression: false, autoGainControl: false
        });

        source = audioCtx.createMediaStreamSource(stream);
        micGain = audioCtx.createGain();
        micGain.gain.value = 0;
        
        analyser = audioCtx.createAnalyser();
        analyser.fftSize = bufferSize;
        
        source.connect(micGain);
        micGain.connect(analyser);
        
        dataArray = new Float32Array(bufferSize);
        setTimeout(() => {
            idleSection2.style.display = 'none';
            evaluatingSection.style.display = 'flex';
            document.body.classList.add('evaluating-mode');
            generateChallenge();
        }, 300);
        validarOpciones();
    } catch (err) {
        console.error("Error micro:", err);
        alert("S'ha d'accedir al micròfon per poder fer l'exercisi.");
    }

});


const tipsBtn = document.getElementById('tipsBtn');
const tipsDropdown = document.getElementById('tipsDropdown');
tipsBtn.addEventListener('click', (event) => {
    event.stopPropagation(); 
    tipsDropdown.classList.toggle('hidden');
});

document.addEventListener('click', (event) => {
    if (!tipsDropdown.classList.contains('hidden')) {
        if (!tipsDropdown.contains(event.target) && event.target !== tipsBtn) {
            tipsDropdown.classList.add('hidden');
        }
    }
});

listenBtn.addEventListener('click', async () => {
    if (!isListening) {
        if(audioCtx.state === 'suspended') await audioCtx.resume();
        micGain.gain.value = 1;
        listenBtn.textContent = "Aturar micròfon";
        listenBtn.style.backgroundColor = "#ca483a"; 
        listenBtn.style.color = "#fff";
        isListening = true;
        update();
    } else {
        stopMic();
    }
});

nextBtn.addEventListener('click', () => {
    stopMic();
    generateChallenge();
});
referenceBtn.addEventListener('click', async () => {
    if (!audioCtx) {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (audioCtx.state === 'suspended') {
        await audioCtx.resume();
    }


    const osc = audioCtx.createOscillator();
    const gainNode = audioCtx.createGain();

    osc.type = 'sine';
    osc.frequency.value = 440; 

    osc.connect(gainNode);
    gainNode.connect(audioCtx.destination);

    const now = audioCtx.currentTime;
    gainNode.gain.setValueAtTime(0, now);
    gainNode.gain.linearRampToValueAtTime(0.3, now + 0.5); // Puja el volum fins al 30%
    gainNode.gain.setValueAtTime(0.3, now + 0.8);          // Manté el so 1.5 segons
    gainNode.gain.linearRampToValueAtTime(0, now + 1.5);   // S'apaga suaument fins als 2 segons

    osc.start(now);
    osc.stop(now + 1.5);

});


function getClefInfo() {
    let clef = 'treble';
    let isTenor = false;

    if (selectedVoice) {
        const veu = selectedVoice.toLowerCase();
        if (veu.includes('tenor')) {
            clef = 'treble';
            isTenor = true;
        } else if (veu.includes('baix')) {
            clef = 'bass';
        }
    }
    return { clef, isTenor };
}

function generateChallenge() {
    totalAttempts++; 
    updateScoreUI();
    isWaitingForSilence = false;
    silenceFrames = 0;
    
    const minMidiVoice = freqToMidi(MIN_FREQ);
    const maxMidiVoice = freqToMidi(MAX_FREQ);
    const { isTenor } = getClefInfo();
    const tenorOffset = isTenor ? 1 : 0;

    targetSequenceNotes = [];
    sungSequenceNotes = [];
    isProcessingNext = false;
    currentPitchStableFrames = 0;
    lastDetectedMidi = -1;

    for (let i = 0; i < SEQUENCE_LENGTH; i++) {
        let nextMidi;

        if (i === 0) {
            nextMidi = Math.floor(Math.random() * (maxMidiVoice - minMidiVoice + 1)) + minMidiVoice;
        } else {

            let validNoteFound = false;
            let prevMidi = targetSequenceNotes[i - 1].midi;

            while (!validNoteFound) {
                const randomIdx = allowedIntervalIndices[Math.floor(Math.random() * allowedIntervalIndices.length)];
                const intervalSemitones = randomIdx + 1; 
                
                const direction = Math.random() < 0.5 ? 1 : -1;
                const testMidi = prevMidi + (intervalSemitones * direction);

                if (testMidi >= minMidiVoice && testMidi <= maxMidiVoice) {
                    nextMidi = testMidi;
                    validNoteFound = true;
                }
            }
        }

        const noteObj = getSpellingForMidi(nextMidi, tenorOffset);
        targetSequenceNotes.push(noteObj);
    }

    console.log("Seqüència generada:", targetSequenceNotes.map(n => n.nameUI));

    drawTargetStaff(targetSequenceNotes);
    drawSungStaff(sungSequenceNotes); 
}

function stopMic() {
    isListening = false;
    if (micGain) micGain.gain.value = 0;
    listenBtn.textContent = "Cantar ara";
    listenBtn.style.backgroundColor = ""; 
    listenBtn.style.color="";
    if (animationId) cancelAnimationFrame(animationId);
}

//Detecció de pitch
function yinDetector(buffer, sampleRate) {
    const size = buffer.length / 2;
    const yinBuffer = new Float32Array(size);

    for (let tau = 0; tau < size; tau++) {
        for (let i = 0; i < size; i++) {
            let delta = buffer[i] - buffer[i + tau];
            yinBuffer[tau] += delta * delta;
        }
    }

    yinBuffer[0] = 1;
    let runningSum = 0;
    for (let tau = 1; tau < size; tau++) {
        runningSum += yinBuffer[tau];
        yinBuffer[tau] *= tau / runningSum;
    }

    let tauFound = -1;
    for (let tau = 1; tau < size; tau++) {
        if (yinBuffer[tau] < 0.15) {
            while (tau + 1 < size && yinBuffer[tau + 1] < yinBuffer[tau]) tau++;
            tauFound = tau;
            break;
        }
    }
    return (tauFound === -1) ? -1 : sampleRate / tauFound;
}

function freqToMidi(freq) {
    if (!freq || freq <= 0) return -1;
    return Math.round(12 * Math.log2(freq / 440) + 69);
}

function midiToFreq(midi) {
    return 440 * Math.pow(2, (midi - 69) / 12);
}


//Avaluació de l'exercici
function update() {
    if (!isListening || isProcessingNext) return;
    animationId = requestAnimationFrame(update);
    
    if (analyser) {
        analyser.getFloatTimeDomainData(dataArray);
        
        // 1. Calcular l'RMS per a detectar silencis
        let rms = 0;
        for (let i = 0; i < dataArray.length; i++) {
            rms += dataArray[i] * dataArray[i];
        }
        rms = Math.sqrt(rms / dataArray.length);

        const pitchFreq = yinDetector(dataArray, audioCtx.sampleRate);
        
        const isSilence = (pitchFreq === -1 || pitchFreq < 50 || rms < 0.005);

        if (isWaitingForSilence) {
            if (isSilence) {
                silenceFrames++;
                if (silenceFrames > 10) { 
                    isWaitingForSilence = false;
                    silenceFrames = 0;
                    currentPitchStableFrames = 0;
                    lastDetectedMidi = -1;
                    console.log("¡Silencio detectado! Listo para la siguiente nota.");
                }
            } else {
                silenceFrames = 0; 
            }
            return; 
        }

        if (!isSilence) {
            const currentMidi = freqToMidi(pitchFreq);
            const targetFreq = midiToFreq(currentMidi);
            const centsDiff = 1200 * Math.log2(pitchFreq/targetFreq);

            if(Math.abs(centsDiff) < 25) {
                if (currentMidi === lastDetectedMidi) {
                    currentPitchStableFrames++;
                } else {
                    currentPitchStableFrames = 1;
                    lastDetectedMidi = currentMidi;
                }
                if(currentPitchStableFrames ===5){
                    const { isTenor } = getClefInfo();
                    const tenorOffset = isTenor ? 1 : 0;
                    
                    let sungObj;
                    const expectedObj = targetSequenceNotes[sungSequenceNotes.length];
                    
                    if (currentMidi === expectedObj.midi) {
                        sungObj = expectedObj; 
                    } else {
                        sungObj = getSpellingForMidi(currentMidi, tenorOffset); 
                    }

                    sungSequenceNotes.push(sungObj);
                    console.log(`¡Nota capturada!: ${sungObj.nameUI}`);
                    
                    drawSungStaff(sungSequenceNotes);

                    isWaitingForSilence = true;
                    silenceFrames = 0;
                    
                    if (sungSequenceNotes.length === SEQUENCE_LENGTH) {
                        evaluateCompleteSequence();
                    }
                }
            } else {
                 currentPitchStableFrames = 0;
            }
        } else {
            currentPitchStableFrames = 0;
        }}
    }

function evaluateCompleteSequence() {
    isProcessingNext = true;
    
    let currentSequenceScore = 0; // Puntuació de la ronda actual

    for (let i = 0; i < SEQUENCE_LENGTH; i++) {
        const targetMidi = targetSequenceNotes[i].midi;
        const sungMidi = sungSequenceNotes[i].midi;

        if (sungMidi === targetMidi) {
            // Nota verda:1punt
            currentSequenceScore += 1;
        } else if (i > 0) {
            // Nota groga:0,5 punts
            const targetInterval = targetMidi - targetSequenceNotes[i - 1].midi;
            const sungInterval = sungMidi - sungSequenceNotes[i - 1].midi;
            
            if (targetInterval === sungInterval) {
                currentSequenceScore += 0.5;
            }
        }
        // vermella i suma 0 punts.
    }

    totalScore += currentSequenceScore;
    totalMaxScore += SEQUENCE_LENGTH;

    if (currentSequenceScore === SEQUENCE_LENGTH) {
        document.body.classList.add('flash-success');
        setTimeout(() => document.body.classList.remove('flash-success'), 500);
    }

    updateScoreUI();
    console.log(`Secuencia acabada. Puntos ganados: ${currentSequenceScore} / ${SEQUENCE_LENGTH}`);
    
    stopMic();
    setTimeout(() => generateChallenge(), 500);
}

//Dibuixar els pentagrames amb Vexflow

const { Renderer, Stave, StaveNote, Voice, Formatter, Accidental } = Vex.Flow;

function drawTargetStaff(sequenceNotes) {
    const container = document.getElementById('targetStaff');
    if (!container) return; 
    container.innerHTML = ""; 

    const renderer = new Renderer(container, Renderer.Backends.SVG);
    const staffWidth = (SEQUENCE_LENGTH * 80) + 70; 
    renderer.resize(staffWidth, 150);
    const context = renderer.getContext();
    const stave = new Stave(10, 20, staffWidth - 20);
    
    const { clef, isTenor } = getClefInfo();
    if (isTenor) stave.addClef(clef, 'default', '8vb').setContext(context).draw();
    else stave.addClef(clef).setContext(context).draw();

    if (sequenceNotes.length === 0) return;

    const notes = sequenceNotes.map(noteObj => {
        let staveNote = new StaveNote({ keys: [noteObj.key], duration: "w", clef: clef });
        if (noteObj.acc !== "n") staveNote.addModifier(new Accidental(noteObj.acc));
        return staveNote;
    });

    const voice = new Voice({ num_beats: SEQUENCE_LENGTH * 4, beat_value: 4 });
    voice.addTickables(notes);
    
    new Formatter().joinVoices([voice]).formatToStave([voice], stave);
    
    voice.draw(context, stave);
}

function drawSungStaff(sequenceNotes) {
    const container = document.getElementById('sungStaff');
    if (!container) return;
    container.innerHTML = ""; 

    const staffWidth = (SEQUENCE_LENGTH * 80) + 70; 

    const renderer = new Renderer(container, Renderer.Backends.SVG);
    renderer.resize(staffWidth, 150);
    const context = renderer.getContext();
    const stave = new Stave(10, 20, staffWidth - 20);
    
    const { clef, isTenor } = getClefInfo();
    if (isTenor) stave.addClef(clef, 'default', '8vb').setContext(context).draw();
    else stave.addClef(clef).setContext(context).draw();

    if (sequenceNotes.length === 0) return; 

    const notes = sequenceNotes.map((noteObj, index) => {
        let staveNote = new StaveNote({ keys: [noteObj.key], duration: "w", clef: clef });
        if (noteObj.acc !== "n") staveNote.addModifier(new Accidental(noteObj.acc));

        let color = "#ca483a";
        
        if (targetSequenceNotes[index] !== undefined) {
            const targetMidi = targetSequenceNotes[index].midi;
            if (noteObj.midi === targetMidi) {
                color = "#41a234"; 
            } 
            else if (index > 0) {
                const targetInterval = targetMidi - targetSequenceNotes[index - 1].midi;
                const sungInterval = noteObj.midi - sequenceNotes[index - 1].midi;
                if (targetInterval === sungInterval) color = "#d4b300";
            }
        }

        staveNote.setStyle({ fillStyle: color, strokeStyle: color });
        if(staveNote.setLedgerLineStyle) staveNote.setLedgerLineStyle({strokeStyle: color});
        return staveNote;
    });

    // Silencis fantasmes per col·locar les rodones on toca segons l'exercici del pentagrama superior
    let fillNotes = [];
    for(let i = sequenceNotes.length; i < SEQUENCE_LENGTH; i++) {
        let ghostRest = new StaveNote({ keys: ["b/4"], duration: "wr", clef: clef });
        ghostRest.setStyle({fillStyle: "transparent", strokeStyle: "transparent"}); 
        fillNotes.push(ghostRest);
    }

    const voice = new Voice({ num_beats: SEQUENCE_LENGTH * 4, beat_value: 4 });
    voice.addTickables(notes.concat(fillNotes));
    
    new Formatter().joinVoices([voice]).formatToStave([voice], stave);
    
    voice.draw(context, stave);
}

//Actualització de l'score
function updateScoreUI() {
    if (totalMaxScore === 0) return; 

    const percentage = Math.round((totalScore / totalMaxScore) * 100);
    
    document.getElementById('hits').textContent = `${percentage}%`;
}


backBtn.addEventListener('click', () => {
    stopMic();
    if (stream) {
        stream.getTracks().forEach(track => track.stop());
        stream = null; 
    }
    startBtn.disabled = true;
    voiceBtns.forEach(btn => btn.classList.remove('selected'));
    window.location.href = "index.html"; 
});