import { ScaledCompositionSource } from "../interfaces/CompositionSource";

/**
 * Sanitize a string so it is safe to use as a filename on Windows and macOS.
 * Removes characters that are forbidden in Windows filenames and collapses whitespace.
 */
export const sanitizeFilename = ( name: string ): string =>
    name.replace( /[/\\:*?"<>|]/g, "" ).replace( /\s+/g, "_" );

/**
 * Generate a descriptive filename stem for a composition based on root note,
 * optional scale name, and the exact note order in the scale.
 *
 * Format:
 *   "<root>_<scaleName>_<note-order>"  – when a named scale is selected
 *   "<root>_<note-order>"              – when no scale name is present
 *
 * Examples:
 *   C_major_C-D-E-F-G-A-B
 *   F_F-G#-E-A-B-D-C        (after shuffle, no scale name)
 */
export const getCompositionName = ( data: ScaledCompositionSource ): string => {
    const notes = data.scale.split( "," ).map( note => note.trim() ).filter( Boolean );
    const noteOrder = notes.join( "-" );
    const root = data.scaleSelect?.note || notes[ 0 ] || "scale";
    const scaleName = data.scaleSelect?.name;

    const stem = scaleName
        ? `${root}_${scaleName}_${noteOrder}`
        : `${root}_${noteOrder}`;

    return sanitizeFilename( stem );
};
