/**
 * Cue Builder composition service.
 *
 * Generates a single Composition consisting of four concatenated sections
 * (A / B / C / D) driven by a global leitmotif that is transformed per section.
 *
 * Output tracks:
 *   0 – Piano RH  (phrase-aware melody)
 *   1 – Piano LH  (bass / broken chords)
 *   2 – Strings   (sustained chord pad)
 *
 * No drums / percussion.
 */
import { CompositionSource } from "../interfaces/CompositionSource";
import { CueBuilderSettings, SectionSettings, MotifContour, CadenceStrength } from "../interfaces/CueBuilderTypes";
import Composition from "../model/Composition";
import Pattern from "../model/Pattern";
import Note from "../model/Note";
import { getMeasureDurationInSeconds } from "../utils/AudioMath";
import {
    parseScaleNotes,
    buildPitchLadder,
    clampLadder,
    findNearestLadderPos,
} from "../utils/ScaleUtil";

/* ── internal types ─────────────────────────────────────────────────────────── */

/**
 * One note in the leitmotif, expressed as a relative scale-step from the
 * previous note so transformations (transpose, invert, retrograde) are trivial.
 */
interface MotifToken {
    /** Scale-step relative to previous note (+1 = up one degree, -2 = down two, etc.) */
    step: number;
    /** Duration expressed in beats */
    durationBeats: number;
}

/* ── public entry point ─────────────────────────────────────────────────────── */

/**
 * Build a full cue Composition from a CompositionSource that has
 * `cueBuilder.enabled === true`.
 */
export function createCueComposition( props: CompositionSource ): Composition {
    const cue = props.cueBuilder!;

    /* ── timing constants ── */
    const MEASURE  = getMeasureDurationInSeconds( props.tempo, props.timeSigBeatAmount );
    const BEAT     = MEASURE / props.timeSigBeatUnit;
    const beatAmt  = props.timeSigBeatAmount;

    /* ── scale / pitch ladder ── */
    const scaleNotes = parseScaleNotes( props.scale );
    const scaleLen   = scaleNotes.length || 7;

    // Full ladder spanning the configured octave range (melody)
    const ladder = buildPitchLadder( scaleNotes, props.octaveLower, props.octaveUpper );

    // Narrow bass ladder: two octaves starting from octaveLower
    const bassLadder = buildPitchLadder(
        scaleNotes,
        props.octaveLower,
        Math.min( props.octaveLower + 1, props.octaveUpper )
    );

    /* ── composition container ── */
    const totalBars = cue.sections.reduce( ( s, sec ) => s + sec.bars, 0 );
    // patternLength=1 so totalMeasures = patternAmount = totalBars
    const out = new Composition(
        props.timeSigBeatAmount,
        props.timeSigBeatUnit,
        props.tempo,
        1,
        totalBars
    );

    /* ── tracks ── */
    const melodyPat  = new Pattern( "Piano RH" );
    const bassPat    = new Pattern( "Piano LH" );
    const stringsPat = new Pattern( "Strings" );
    out.patterns.push( melodyPat, bassPat, stringsPat );

    /* ── global leitmotif ── */
    const motif = generateMotif( cue.motifLength, cue.contour, scaleLen );

    /* ── render sections ── */
    let sectionStartBar = 0;

    cue.sections.forEach(( section, secIdx ) => {
        const sectionMotif = transformMotif( motif, secIdx, cue.variationDepth, scaleLen );

        // Piano RH
        buildSectionMelody(
            sectionMotif, section, cue, ladder, scaleLen,
            MEASURE, BEAT, beatAmt, sectionStartBar
        ).forEach( n => melodyPat.notes.push( n ) );

        // Piano LH
        buildSectionBass(
            section, bassLadder, scaleLen,
            MEASURE, BEAT, beatAmt, sectionStartBar
        ).forEach( n => bassPat.notes.push( n ) );

        // Strings pad
        buildSectionStrings(
            section, ladder, scaleLen,
            MEASURE, BEAT, beatAmt, sectionStartBar
        ).forEach( n => stringsPat.notes.push( n ) );

        sectionStartBar += section.bars;
    } );

    return out;
}

/* ── leitmotif generation ────────────────────────────────────────────────────── */

/**
 * Generate a leitmotif as a sequence of relative scale-step tokens.
 *
 * Contour:
 *   rising      – mostly ascending steps
 *   falling     – mostly descending steps
 *   arch        – rise to a peak ≈ 60% through, then fall
 *   random-walk – stepwise preference, either direction
 */
function generateMotif(
    length : number,
    contour: MotifContour,
    scaleLen: number
): MotifToken[] {
    // Durations pool for a neoclassical motif (quarter-note dominant)
    const DURATIONS = [ 0.5, 1, 1, 1, 1.5, 2 ];
    const tokens: MotifToken[] = [];

    for ( let i = 0; i < length; i++ ) {
        const t = length > 1 ? i / ( length - 1 ) : 0; // 0..1

        let step = 0;
        switch ( contour ) {
            case "rising":
                step = rnd() < 0.75 ? 1 : ( rnd() < 0.6 ? 2 : -1 );
                break;

            case "falling":
                step = rnd() < 0.75 ? -1 : ( rnd() < 0.6 ? -2 : 1 );
                break;

            case "arch":
                if ( t < 0.6 ) {
                    step = rnd() < 0.75 ? 1 : ( rnd() < 0.4 ? 0 : 2 );
                } else {
                    step = rnd() < 0.75 ? -1 : ( rnd() < 0.4 ? 0 : -2 );
                }
                break;

            case "random-walk":
            default:
                if ( rnd() < 0.15 ) {
                    step = 0; // occasional stay
                } else {
                    const dir = rnd() < 0.5 ? 1 : -1;
                    step = dir * ( rnd() < 0.7 ? 1 : 2 );
                }
                break;
        }

        // Prevent motif from immediately repeating the same note too often
        if ( i > 0 && step === 0 && tokens[ i - 1 ].step === 0 ) {
            step = 1;
        }

        tokens.push({
            step,
            durationBeats: DURATIONS[ Math.floor( rnd() * DURATIONS.length ) ],
        });
    }
    return tokens;
}

/* ── motif transformations ───────────────────────────────────────────────────── */

/**
 * Apply section-specific transformations to the base motif.
 *
 * Section 0 (A): base motif – intro, minimal change
 * Section 1 (B): transpose + possible rhythmic rotation
 * Section 2 (C): development – more drastic at high variationDepth
 * Section 3 (D): return toward base, intensified
 */
function transformMotif(
    motif        : MotifToken[],
    sectionIndex : number,
    variationDepth: number,
    scaleLen      : number
): MotifToken[] {
    let result = motif.map( t => ({ ...t }) ); // shallow clone

    const depth = variationDepth / 100; // 0..1

    switch ( sectionIndex ) {
        case 0: // A – intro: use as-is
            break;

        case 1: { // B – statement: gentle transpose up
            const shift = 2 + Math.round( depth * 2 ); // +2 to +4 steps up
            result = result.map( t => ({ ...t, step: t.step }) );
            // Raise starting position – encode as an offset on the first step
            result[ 0 ] = { ...result[ 0 ], step: result[ 0 ].step + shift };
            // Slight rhythmic shortening if depth is high
            if ( depth > 0.4 ) {
                result = rotateRhythm( result, 1 );
            }
            break;
        }

        case 2: { // C – development
            if ( depth > 0.7 ) {
                // Rare inversion: negate all steps
                result = result.map( t => ({ ...t, step: -t.step }) );
            } else if ( depth > 0.4 ) {
                // Rhythmic shift + transpose
                result = rotateRhythm( result, 2 );
                result[ 0 ] = { ...result[ 0 ], step: result[ 0 ].step + 3 };
            } else {
                // Mild transpose down
                result[ 0 ] = { ...result[ 0 ], step: result[ 0 ].step - 2 };
            }
            // Ornament: insert a passing tone between the 1st and 2nd notes
            if ( depth > 0.3 && result.length >= 2 ) {
                result = ornamentMotif( result );
            }
            break;
        }

        case 3: { // D – finale: return toward tonic, intensified
            // Small retrograde of rhythm for variety
            if ( depth > 0.5 ) {
                const revDurations = result.map( t => t.durationBeats ).reverse();
                result = result.map(( t, i ) => ({ ...t, durationBeats: revDurations[ i ] }));
            }
            // Nudge back toward starting pitch
            result[ 0 ] = { ...result[ 0 ], step: 0 };
            break;
        }
    }

    return result;
}

/** Rotate the duration sequence left by n positions (rhythm stays aligned to motif shape) */
function rotateRhythm( tokens: MotifToken[], n: number ): MotifToken[] {
    const durations = tokens.map( t => t.durationBeats );
    const rotated   = [ ...durations.slice( n ), ...durations.slice( 0, n ) ];
    return tokens.map(( t, i ) => ({ ...t, durationBeats: rotated[ i ] }));
}

/** Add a one-beat passing tone (stepwise) between the first two tokens */
function ornamentMotif( tokens: MotifToken[] ): MotifToken[] {
    const result = [ ...tokens ];
    // Insert a quarter-note passing-tone step between note 0 and note 1
    const passingStep = tokens[ 0 ].step > 0 ? 1 : -1;
    result.splice( 1, 0, { step: passingStep, durationBeats: 0.5 });
    return result;
}

/* ── melody generation ────────────────────────────────────────────────────────── */

/**
 * Generate Piano-RH melody notes for one section.
 */
function buildSectionMelody(
    motif        : MotifToken[],
    section      : SectionSettings,
    cue          : CueBuilderSettings,
    ladder       : Array<{ note: string; octave: number }>,
    scaleLen     : number,
    MEASURE      : number,
    BEAT         : number,
    beatAmt      : number,
    startMeasure : number
): Note[] {
    const notes: Note[] = [];
    const ladderLen    = ladder.length;

    // Intensity-driven register: higher intensity → higher starting position
    // Range is [25%..65%] of the ladder
    const registerFrac = 0.25 + ( section.intensity - 1 ) * 0.10;
    const basePos      = clampLadder( Math.round( ladderLen * registerFrac ), ladderLen );

    // Duration scaling: higher intensity → shorter notes (denser texture)
    const durScale = durationScaleForIntensity( section.intensity );

    const phraseBeats = cue.phraseLength * beatAmt;
    let   sectionBeat = 0;

    while ( sectionBeat < section.bars * beatAmt ) {
        const phraseEnd = Math.min( sectionBeat + phraseBeats, section.bars * beatAmt );
        const phraseDur = phraseEnd - sectionBeat;

        const phraseNotes = buildPhrase(
            motif, basePos, phraseDur, cue.cadenceStrength,
            scaleLen, ladder, ladderLen,
            durScale, BEAT, beatAmt, startMeasure, sectionBeat, MEASURE
        );
        phraseNotes.forEach( n => notes.push( n ) );
        sectionBeat += phraseDur;
    }

    return notes;
}

/**
 * Generate notes for a single phrase of `phraseTotalBeats` beats.
 *
 * Structure:
 *   – First (phraseTotalBeats − cadenceBeats) beats: motif walk
 *   – Last cadenceBeats: stepwise approach to cadence target
 */
function buildPhrase(
    motif         : MotifToken[],
    startLadderPos: number,
    phraseTotalBeats: number,
    cadenceStrength : CadenceStrength,
    scaleLen        : number,
    ladder          : Array<{ note: string; octave: number }>,
    ladderLen       : number,
    durScale        : number,
    BEAT            : number,
    beatAmt         : number,
    sectionStartMeasure: number,
    sectionBeatOffset  : number,
    MEASURE            : number
): Note[] {
    const notes: Note[] = [];
    const cadenceBeats = Math.min( 2, phraseTotalBeats );
    const fillBeats    = phraseTotalBeats - cadenceBeats;

    let pos         = startLadderPos;
    let beatOffset  = 0; // beats from phrase start
    let motifIdx    = 0;

    /* ── fill phase ── */
    while ( beatOffset < fillBeats ) {
        const token   = motif[ motifIdx % motif.length ];
        pos           = clampLadder( pos + token.step, ladderLen );

        const rawDur  = token.durationBeats * durScale;
        const dur     = Math.max( 0.25, Math.min( rawDur, fillBeats - beatOffset ) );

        notes.push( makeNote( ladder, pos, sectionStartMeasure, sectionBeatOffset + beatOffset, dur, BEAT, MEASURE ) );

        beatOffset += dur;
        motifIdx++;
    }

    /* ── cadence phase ── */
    const cadenceNotes = buildCadence(
        pos, cadenceStrength, scaleLen, ladderLen,
        cadenceBeats, ladder, BEAT, beatAmt,
        sectionStartMeasure, sectionBeatOffset + beatOffset, MEASURE
    );
    cadenceNotes.forEach( n => notes.push( n ) );

    return notes;
}

/**
 * Build 1–2 cadence notes that resolve toward a stable scale degree.
 *
 * Cadence targets (0-based scale-degree indices):
 *   strong  → 0  (tonic)
 *   medium  → 0 | 2 | 4  (tonic / mediant / dominant)
 *   light   → 1 | 4      (supertonic / dominant – open ending)
 */
function buildCadence(
    currentPos    : number,
    strength      : CadenceStrength,
    scaleLen      : number,
    ladderLen     : number,
    cadenceBeats  : number,
    ladder        : Array<{ note: string; octave: number }>,
    BEAT          : number,
    beatAmt       : number,
    sectionStartMeasure: number,
    beatOffset    : number,
    MEASURE       : number
): Note[] {
    const notes: Note[] = [];

    // Determine target degree index
    let targetDegree: number;
    switch ( strength ) {
        case "strong":
            targetDegree = 0;
            break;
        case "medium":
            targetDegree = [ 0, 2, 4 ][ Math.floor( rnd() * 3 ) ];
            break;
        case "light":
        default:
            targetDegree = rnd() < 0.5 ? 1 : 4;
            break;
    }
    // Clamp degree to available scale length
    targetDegree = Math.min( targetDegree, scaleLen - 1 );

    const targetPos   = findNearestLadderPos( targetDegree, scaleLen, currentPos, ladderLen );
    const approachPos = currentPos > targetPos
        ? clampLadder( targetPos + 1, ladderLen )
        : clampLadder( targetPos - 1, ladderLen );

    if ( cadenceBeats >= 2 ) {
        // Approach note (1 beat)
        notes.push( makeNote( ladder, approachPos, sectionStartMeasure, beatOffset, 1, BEAT, MEASURE ) );
        // Resolution note (remaining beats)
        notes.push( makeNote( ladder, targetPos, sectionStartMeasure, beatOffset + 1, cadenceBeats - 1, BEAT, MEASURE ) );
    } else {
        // Single cadence beat – go straight to target
        notes.push( makeNote( ladder, targetPos, sectionStartMeasure, beatOffset, cadenceBeats, BEAT, MEASURE ) );
    }

    return notes;
}

/* ── bass generation ─────────────────────────────────────────────────────────── */

/**
 * Piano LH bass line.
 *
 * Pattern by intensity:
 *   1–2  Root on beat 1, held for the bar
 *   3    Root (beats 1–2) + 5th (beats 3–4) in 4/4
 *   4    Root + 3rd + 5th arpeggiated per beat
 *   5    Dense broken-chord sixteenth pattern
 */
function buildSectionBass(
    section      : SectionSettings,
    bassLadder   : Array<{ note: string; octave: number }>,
    scaleLen     : number,
    MEASURE      : number,
    BEAT         : number,
    beatAmt      : number,
    startMeasure : number
): Note[] {
    const notes: Note[] = [];
    const lLen = bassLadder.length;

    // Degree positions in the bass ladder (0-based)
    const rootPos  = 0;
    const thirdPos = clampLadder( 2, lLen );
    const fifthPos = clampLadder( Math.min( 4, scaleLen - 1 ), lLen );

    for ( let bar = 0; bar < section.bars; bar++ ) {
        const sectionBeatStart = bar * beatAmt;

        if ( section.intensity <= 2 ) {
            // Root whole note (or full bar)
            notes.push( makeNote( bassLadder, rootPos, startMeasure, sectionBeatStart, beatAmt, BEAT, MEASURE ) );

        } else if ( section.intensity === 3 ) {
            // Root + 5th
            const half = beatAmt / 2;
            notes.push( makeNote( bassLadder, rootPos,  startMeasure, sectionBeatStart,        half, BEAT, MEASURE ) );
            notes.push( makeNote( bassLadder, fifthPos, startMeasure, sectionBeatStart + half, half, BEAT, MEASURE ) );

        } else if ( section.intensity === 4 ) {
            // Root – 3rd – 5th – Root arpeggiation per beat
            const beatPositions = [ rootPos, thirdPos, fifthPos, rootPos ];
            for ( let b = 0; b < beatAmt && b < beatPositions.length; b++ ) {
                notes.push( makeNote( bassLadder, beatPositions[ b ], startMeasure, sectionBeatStart + b, 1, BEAT, MEASURE ) );
            }

        } else {
            // Intensity 5: eighth-note broken chord
            const pattern = [ rootPos, fifthPos, thirdPos, fifthPos, rootPos, fifthPos, thirdPos, fifthPos ];
            for ( let e = 0; e < beatAmt * 2; e++ ) {
                const bp = pattern[ e % pattern.length ];
                notes.push( makeNote( bassLadder, bp, startMeasure, sectionBeatStart + e * 0.5, 0.5, BEAT, MEASURE ) );
            }
        }
    }

    return notes;
}

/* ── strings pad generation ──────────────────────────────────────────────────── */

/**
 * Strings pad: sustained chord tones covering entire bars.
 *
 * Uses a mid-register segment of the main ladder.
 * At higher intensity, voices are added (3rd, 5th alongside root).
 */
function buildSectionStrings(
    section      : SectionSettings,
    ladder       : Array<{ note: string; octave: number }>,
    scaleLen     : number,
    MEASURE      : number,
    BEAT         : number,
    beatAmt      : number,
    startMeasure : number
): Note[] {
    const notes: Note[] = [];
    const lLen = ladder.length;

    // Mid-register base (strings slightly above the bass, below the melody peak)
    const midBase = Math.round( lLen * 0.20 );

    const rootPos  = clampLadder( midBase, lLen );
    const thirdPos = clampLadder( midBase + 2, lLen );
    const fifthPos = clampLadder( midBase + Math.min( 4, scaleLen - 1 ), lLen );

    // Strings change harmony every 2 bars
    const harmonyCycle = 2;

    for ( let bar = 0; bar < section.bars; bar += harmonyCycle ) {
        const durBeats = Math.min( harmonyCycle * beatAmt, ( section.bars - bar ) * beatAmt );
        const sectionBeatStart = bar * beatAmt;

        // Root always present
        notes.push( makeNote( ladder, rootPos, startMeasure, sectionBeatStart, durBeats, BEAT, MEASURE ) );

        // 3rd from intensity 2, 5th from intensity 3
        if ( section.intensity >= 2 ) {
            notes.push( makeNote( ladder, thirdPos, startMeasure, sectionBeatStart, durBeats, BEAT, MEASURE ) );
        }
        if ( section.intensity >= 3 ) {
            notes.push( makeNote( ladder, fifthPos, startMeasure, sectionBeatStart, durBeats, BEAT, MEASURE ) );
        }
    }

    return notes;
}

/* ── helpers ─────────────────────────────────────────────────────────────────── */

/**
 * Construct a Note at the given ladder position with correct absolute offset
 * and measure number for AudioService scheduling.
 *
 * @param sectionStartMeasure  – first bar of the section (0-based)
 * @param sectionBeat          – beat offset within the section (0-based)
 */
function makeNote(
    ladder             : Array<{ note: string; octave: number }>,
    ladderPos          : number,
    sectionStartMeasure: number,
    sectionBeat        : number,
    durationBeats      : number,
    BEAT               : number,
    MEASURE            : number
): Note {
    const { note, octave } = ladder[ ladderPos ];
    const absoluteOffset   = sectionStartMeasure * MEASURE + sectionBeat * BEAT;
    const measure          = sectionStartMeasure + Math.floor( sectionBeat * BEAT / MEASURE );
    const duration         = durationBeats * BEAT;
    return new Note( note, octave, absoluteOffset, duration, measure );
}

/** Duration scale factor per intensity (higher = denser = shorter notes) */
function durationScaleForIntensity( intensity: number ): number {
    // intensity 1 → 2.0× (slow), intensity 5 → 0.5× (fast)
    return 2.0 - ( intensity - 1 ) * 0.375;
}

/** Simple [0, 1) random helper */
function rnd(): number { return Math.random(); }
