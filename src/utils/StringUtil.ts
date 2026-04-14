import { ScaledCompositionSource } from "../interfaces/CompositionSource";

/**
 * Sanitize a string so it is safe to use as a filename on Windows and macOS.
 * Removes characters that are forbidden in Windows filenames and collapses whitespace.
 */
export const sanitizeFilename = ( name: string ): string =>
    name.replace( /[/\\:*?"<>|]/g, "" ).replace( /\s+/g, "_" );

/**
 * Generate a descriptive filename stem for a composition based on root note,
 * scale name (or "scale" fallback), and the exact note order in the scale.
 *
 * Format 3: "<root>_<scaleNameOrScale>_<note-order>"
 *
 * Examples:
 *   C_major_C-D-E-F-G-A-B
 *   C_scale_C-D-E-F-G-A-B   (when no named scale is selected)
 *   F_scale_F-G#-E-A-B-D-C  (after shuffle, no scale name)
 */
export const getCompositionName = ( data: ScaledCompositionSource ): string => {
    const notes = data.scale.split( "," ).map( note => note.trim() ).filter( Boolean );
    const noteOrder = notes.length ? notes.join( "-" ) : "C";
    const root = data.scaleSelect?.note || notes[ 0 ] || "C";
    const scaleName = data.scaleSelect?.name || "scale";

    return sanitizeFilename( `${root}_${scaleName}_${noteOrder}` );
};
