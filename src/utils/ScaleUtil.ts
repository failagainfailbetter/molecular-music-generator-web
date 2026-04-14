/**
 * Scale / key abstraction utilities for the Cue Builder mode.
 *
 * The existing codebase works with raw MIDI note names; this module adds the
 * minimal "scale degree" concept required for motif generation and phrase-aware
 * cadences without touching any existing code paths.
 */

/** All 12 chromatic pitch classes in ascending order */
export const CHROMATIC: string[] = [
    "C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B",
];

/**
 * Parse the comma-separated scale string (as stored in CompositionSource.scale)
 * into an ordered array of note names.  The first entry is treated as the tonic
 * (scale degree 1).
 */
export function parseScaleNotes( scale: string ): string[] {
    return scale.split( "," ).map( n => n.trim() ).filter( Boolean );
}

/**
 * Build a "pitch ladder" – an ordered array of { note, octave } pairs that
 * spans from octaveLower to octaveUpper (inclusive), ascending by scale step
 * within each octave.
 *
 * Example with scale ["C","D","E","F","G","A","B"], octaveLower=3, octaveUpper=5:
 *   C3, D3, E3, F3, G3, A3, B3, C4, D4 … B5
 */
export function buildPitchLadder(
    scaleNotes : string[],
    octaveLower: number,
    octaveUpper: number
): Array<{ note: string; octave: number }> {
    const ladder: Array<{ note: string; octave: number }> = [];
    for ( let oct = octaveLower; oct <= octaveUpper; oct++ ) {
        for ( const note of scaleNotes ) {
            ladder.push({ note, octave: oct });
        }
    }
    return ladder;
}

/**
 * Clamp a ladder index to the valid [0, ladderLength-1] range.
 */
export function clampLadder( pos: number, ladderLength: number ): number {
    return Math.max( 0, Math.min( ladderLength - 1, pos ) );
}

/**
 * Given a 0-based scale-degree index (0 = tonic, 2 = mediant, 4 = dominant …),
 * find the ladder position closest to `nearPos` that lands on that degree.
 *
 * Because the same degree recurs every scaleLen steps, we pick the occurrence
 * nearest to `nearPos` so voice-leading stays smooth.
 */
export function findNearestLadderPos(
    degreeIdx  : number,   // 0-based degree index within scaleNotes
    scaleLen   : number,
    nearPos    : number,
    ladderLength: number
): number {
    const candidates: number[] = [];
    for ( let i = degreeIdx; i < ladderLength; i += scaleLen ) {
        candidates.push( i );
    }
    if ( candidates.length === 0 ) return clampLadder( nearPos, ladderLength );
    return candidates.reduce(( best, pos ) =>
        Math.abs( pos - nearPos ) < Math.abs( best - nearPos ) ? pos : best
    , candidates[ 0 ] );
}

/**
 * Quantize a raw note name to the nearest note that exists in the scale.
 * Useful for snapping arbitrarily-computed pitches back to the key.
 */
export function quantizeToScale( note: string, scaleNotes: string[] ): string {
    if ( scaleNotes.includes( note ) ) return note;
    const noteIdx = CHROMATIC.indexOf( note );
    if ( noteIdx === -1 ) return scaleNotes[ 0 ];

    let bestDist = Infinity;
    let bestNote = scaleNotes[ 0 ];
    for ( const scaleNote of scaleNotes ) {
        const scaleIdx = CHROMATIC.indexOf( scaleNote );
        if ( scaleIdx === -1 ) continue;
        const dist = Math.min(
            Math.abs( noteIdx - scaleIdx ),
            12 - Math.abs( noteIdx - scaleIdx )
        );
        if ( dist < bestDist ) {
            bestDist = dist;
            bestNote = scaleNote;
        }
    }
    return bestNote;
}
