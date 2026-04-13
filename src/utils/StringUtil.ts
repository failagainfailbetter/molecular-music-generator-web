import { CompositionSource } from "../interfaces/CompositionSource";

/**
 * Generate a human-readable name for a composition.
 * Used as the stem of exported MIDI filenames.
 *
 * Named presets:  "<name>_<tempo>bpm"
 * Custom inputs:  "<notes>_<tempo>bpm_<note1Length>-<note2Length>"
 *
 * Notes in the scale are joined with hyphens, e.g. "C-D-Eb-F-G-Ab-Bb".
 */
export const getCompositionName = ( data: CompositionSource ): string => {
    const notes = data.scale.split( "," ).map( note => note.trim() );
    const scalePart = notes.join( "-" );
    if ( data.name ) {
        return `${data.name}_${data.tempo}bpm`;
    }
    return `${scalePart}_${data.tempo}bpm_${data.note1Length}-${data.note2Length}`;
};
