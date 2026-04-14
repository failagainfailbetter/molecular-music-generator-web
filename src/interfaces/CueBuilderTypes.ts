/**
 * Types and defaults for the Cue Builder composition mode.
 *
 * A Cue is a single piece made of four named sections (A/B/C/D) that are
 * concatenated in time.  A global leitmotif is generated once and then
 * transformed per-section to give the piece motif-driven coherence.
 */

/** Shape of the leitmotif contour */
export type MotifContour = "rising" | "falling" | "arch" | "random-walk";

/** Strength of the melodic cadence at phrase endings */
export type CadenceStrength = "light" | "medium" | "strong";

/** Per-section settings (one entry for each of A / B / C / D) */
export interface SectionSettings {
    /** Number of bars in this section (2–32) */
    bars: number;
    /** Density / register / velocity driver (1 = sparse, 5 = dense/high) */
    intensity: number;
}

/** Full Cue Builder configuration stored in CompositionSource */
export interface CueBuilderSettings {
    enabled: boolean;
    /** Number of notes in the generated leitmotif */
    motifLength: 4 | 6 | 8;
    /** Melodic shape of the leitmotif */
    contour: MotifContour;
    /** How drastically the motif is transformed between sections (0–100) */
    variationDepth: number;
    /** How many bars make up one melodic phrase */
    phraseLength: 2 | 4 | 8;
    /** How strongly phrase endings resolve toward stable scale degrees */
    cadenceStrength: CadenceStrength;
    /** Four sections: A (intro), B (statement), C (development), D (finale) */
    sections: [SectionSettings, SectionSettings, SectionSettings, SectionSettings];
}

/** Sensible defaults – also used to initialise the Form state */
export const DEFAULT_CUE_SETTINGS: CueBuilderSettings = {
    enabled: false,
    motifLength: 6,
    contour: "arch",
    variationDepth: 35,
    phraseLength: 4,
    cadenceStrength: "medium",
    sections: [
        { bars: 4,  intensity: 1 },
        { bars: 8,  intensity: 3 },
        { bars: 8,  intensity: 4 },
        { bars: 4,  intensity: 5 },
    ],
};
