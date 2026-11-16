import React, { useState, useCallback } from 'react';
import { Box, Text, useInput } from 'ink';
import SelectInput from 'ink-select-input';
import {
    parseGpoResponseBuffer,
    type EmvApplication,
    type PdolBuildOptions,
    type RecordData,
} from '../../emv-application.js';
import { format as formatTlv, findTagInBuffer, formatGpoResponse } from '../../emv-tags.js';
import { Header, Footer, CardBox, StatusBar, LoadingSpinner } from '../components/index.js';
import { formatSw } from '../format.js';
import type { AppInfo } from '../types.js';

/**
 * Terminal data for GET PROCESSING OPTIONS while exploring: no amount, in US dollars.
 * Cards need PDOL data of the right shape to return their AIP and AFL; the values
 * themselves rarely matter.
 */
const EXPLORE_TERMINAL_DATA: PdolBuildOptions = { amount: 0, currencyCode: 0x0840 };

/**
 * Read the application's records: those listed in the AFL from GET PROCESSING OPTIONS,
 * or, without an AFL (for example when GPO was already done), every SFI from 1 to 30,
 * moving to the next SFI at the first record that can't be read.
 */
async function readRecords(emv: EmvApplication): Promise<RecordData[]> {
    const gpo = await emv.initiateApplicationProcessing(EXPLORE_TERMINAL_DATA);
    const afl = gpo.isOk() ? parseGpoResponseBuffer(gpo.buffer).afl : [];
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

interface ExploreScreenProps {
    emv: EmvApplication;
    app: AppInfo;
    onBack: () => void;
}

export function ExploreScreen({ emv, app, onBack }: ExploreScreenProps): React.JSX.Element {
    const [loading, setLoading] = useState(false);
    const [data, setData] = useState<{ tag: string; name: string; value: string }[]>([]);
    const [error, setError] = useState<string | null>(null);
    const [selectedAction, setSelectedAction] = useState<string | null>(null);

    useInput((_input, key) => {
        if (key.escape) {
            if (selectedAction) {
                setSelectedAction(null);
            } else {
                onBack();
            }
        }
    });

    const fetchData = useCallback(
        async (action: string) => {
            setLoading(true);
            setError(null);
            setData([]);

            try {
                switch (action) {
                    case 'gpo': {
                        const response =
                            await emv.initiateApplicationProcessing(EXPLORE_TERMINAL_DATA);
                        if (response.isOk()) {
                            const formatted = formatGpoResponse(response.buffer);
                            setData([
                                { tag: 'GPO', name: 'GET_PROCESSING_OPTIONS', value: formatted },
                            ]);
                        } else {
                            setError(`GET PROCESSING OPTIONS failed: SW=${formatSw(response)}`);
                        }
                        break;
                    }
                    case 'records': {
                        const records = (await readRecords(emv)).map((record) => ({
                            tag: `SFI${String(record.sfi)}:R${String(record.recordNumber)}`,
                            name: 'RECORD',
                            value:
                                formatTlv({
                                    buffer: record.data,
                                    sw1: 0x90,
                                    sw2: 0x00,
                                    isOk: () => true,
                                }) || record.data.toString('hex'),
                        }));
                        if (records.length === 0) {
                            setError('No records found');
                        } else {
                            setData(records);
                        }
                        break;
                    }
                    case 'pincount': {
                        const response = await emv.getData(0x9f17);
                        if (response.isOk()) {
                            const tagValue = findTagInBuffer(response.buffer, 0x9f17);
                            const count = tagValue?.[0];
                            setData([
                                {
                                    tag: '9F17',
                                    name: 'PIN_TRY_COUNT',
                                    value: count !== undefined ? String(count) : 'Unknown',
                                },
                            ]);
                        } else {
                            setError(`PIN try count not available: SW=${formatSw(response)}`);
                        }
                        break;
                    }
                    case 'atc': {
                        const response = await emv.getData(0x9f36);
                        if (response.isOk()) {
                            const tagValue = findTagInBuffer(response.buffer, 0x9f36);
                            const atcValue =
                                tagValue && tagValue.length >= 2
                                    ? tagValue.readUInt16BE(0)
                                    : undefined;
                            setData([
                                {
                                    tag: '9F36',
                                    name: 'APP_TRANSACTION_COUNTER',
                                    value: atcValue !== undefined ? String(atcValue) : 'Unknown',
                                },
                            ]);
                        } else {
                            setError(`ATC not available: SW=${formatSw(response)}`);
                        }
                        break;
                    }
                }
            } catch (err) {
                setError(err instanceof Error ? err.message : String(err));
            } finally {
                setLoading(false);
            }
        },
        [emv]
    );

    const items = [
        { label: '📊  Get Processing Options', value: 'gpo' },
        { label: '📁  Read All Records', value: 'records' },
        { label: '🔢  PIN Try Counter', value: 'pincount' },
        { label: '🔄  Application Transaction Counter', value: 'atc' },
        { label: '←   Back', value: 'back' },
    ];

    if (loading) {
        return (
            <Box flexDirection="column">
                <Header />
                <LoadingSpinner message="Reading card data..." />
            </Box>
        );
    }

    return (
        <Box flexDirection="column">
            <Header />
            <CardBox title={`Exploring: ${app.label ?? app.aid}`}>
                {error && <StatusBar message={error} type="error" />}
                {data.length > 0 && (
                    <Box flexDirection="column" marginBottom={1}>
                        {data.map((item, i) => (
                            <Box key={i} flexDirection="column" marginBottom={1}>
                                <Text color="cyan" bold>
                                    {item.tag} ({item.name}):
                                </Text>
                                <Text color="yellow" wrap="wrap">
                                    {item.value}
                                </Text>
                            </Box>
                        ))}
                    </Box>
                )}
                <SelectInput
                    items={items}
                    onSelect={(item) => {
                        if (item.value === 'back') {
                            onBack();
                        } else {
                            setSelectedAction(item.value);
                            void fetchData(item.value);
                        }
                    }}
                    itemComponent={({ isSelected, label }) =>
                        isSelected ? (
                            <Text color="cyan" bold>
                                {'▸ '}
                                {label}
                            </Text>
                        ) : (
                            <Text>
                                {'  '}
                                {label}
                            </Text>
                        )
                    }
                />
            </CardBox>
            <Footer
                hints={[
                    { keys: '↑↓', description: 'Navigate' },
                    { keys: 'Enter', description: 'Select' },
                    { keys: 'Esc', description: 'Back' },
                ]}
            />
        </Box>
    );
}
