/**
 * Card reads behind the interactive explorer
 */

import {
    parseGpoResponseBuffer,
    type AflEntry,
    type EmvApplication,
    type PdolBuildOptions,
    type RecordData,
} from '../emv-application.js';
import type { CardResponse } from '../types.js';

/**
 * Terminal data for GET PROCESSING OPTIONS while exploring: no amount, in US dollars.
 * Cards need PDOL data of the right shape to return their AIP and AFL; the values
 * themselves rarely matter.
 */
const EXPLORE_TERMINAL_DATA: PdolBuildOptions = { amount: 0, currencyCode: 0x0840 };

/**
 * AFL returned by GET PROCESSING OPTIONS, per application selection. Keyed by the FCI
 * from the selection, which is replaced when an application is selected again, so a
 * new selection never sees an old AFL.
 */
const aflBySelection = new WeakMap<Buffer, AflEntry[]>();

/**
 * Send GET PROCESSING OPTIONS for the selected application, remembering its AFL
 * so records can be read without sending GPO again (cards often refuse a second GPO).
 */
export async function processingOptions(emv: EmvApplication): Promise<CardResponse> {
    const response = await emv.initiateApplicationProcessing(EXPLORE_TERMINAL_DATA);
    const fci = emv.getSelectedFci();
    if (response.isOk() && fci) {
        aflBySelection.set(fci, parseGpoResponseBuffer(response.buffer).afl);
    }
    return response;
}

/**
 * Read the selected application's records: those listed in its AFL (from an earlier
 * GET PROCESSING OPTIONS, or by sending it now). Without an AFL, scan every SFI from
 * 1 to 30, moving to the next SFI at the first record that can't be read.
 */
export async function readApplicationRecords(emv: EmvApplication): Promise<RecordData[]> {
    const fci = emv.getSelectedFci();
    let afl = fci ? aflBySelection.get(fci) : undefined;
    if (!afl) {
        const gpo = await processingOptions(emv);
        afl = gpo.isOk() ? parseGpoResponseBuffer(gpo.buffer).afl : [];
    }
    if (afl.length > 0) {
        return emv.readAllRecords(afl);
    }

    const records: RecordData[] = [];
    for (let sfi = 1; sfi <= 30; sfi++) {
        for (let recordNumber = 1; recordNumber <= 10; recordNumber++) {
            const response = await emv.readRecord(sfi, recordNumber);
            if (!response.isOk()) break;
            records.push({ sfi, recordNumber, data: response.buffer });
        }
    }
    return records;
}
