/**
 * Augment the Window interface to expose the Electron preload API when
 * the app is running as a packaged desktop application.
 */
declare global {
    interface Window {
        electronAPI?: {
            saveMidi: ( data: string, filename: string ) => Promise<string>;
        };
    }
}

/**
 * Save given data as a file on disk.
 *
 * In the Electron desktop build the file is written directly to
 * Documents/Molecular Music Generator/ via the IPC bridge defined in
 * electron/preload.js, and the resolved file path is returned.
 *
 * In a normal browser context a download is triggered via an anchor element.
 * When working with Blob URLs you can revoke these immediately after this
 * invocation to free resources.
 *
 * @param {String} data as String, base64 encoded content (data URI)
 * @param {String} fileName name of file
 * @returns {Promise<string|undefined>} resolved file path (Electron only)
 */
export const saveAsFile = async ( data: string, fileName: string ): Promise<string | undefined> => {
    // Use Electron IPC when running as a packaged / electron-dev app.
    if ( typeof window !== "undefined" && window.electronAPI?.saveMidi ) {
        return window.electronAPI.saveMidi( data, fileName );
    }

    // Fallback: browser download via anchor element.
    const anchor  = document.createElement( "a" );
    anchor.style.display = "none";
    anchor.href = data;
    anchor.setAttribute( "download", fileName );

    // Safari has no download attribute
    if ( typeof anchor.download === "undefined" ) {
        anchor.setAttribute( "target", "_blank" );
    }
    document.body.appendChild( anchor );
    anchor.click();
    document.body.removeChild( anchor );
    return undefined;
};
