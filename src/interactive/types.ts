/**
 * Shared types for the interactive CLI
 */

import type { DiscoveredApp } from '../emv-application.js';

export interface ReaderInfo {
    name: string;
    state: number;
    atr: Buffer | null;
}

export interface CardInfo {
    atr: Buffer | null;
    protocol: number;
    connected: boolean;
}

export interface DevicesLike {
    listReaders(): ReaderInfo[];
    start(): void;
    stop(): void;
    on(event: string, handler: (event: unknown) => void): void;
    once(event: string, handler: (event: unknown) => void): void;
    off(event: string, handler: (event: unknown) => void): void;
    getCard(readerName: string): CardInfo | null;
}

export interface CardInsertedEvent {
    reader: ReaderInfo;
    card: CardInfo;
}

// Use DiscoveredApp from emv-application.ts
export type AppInfo = DiscoveredApp;

export type Screen =
    | 'welcome'
    | 'readers'
    | 'waiting'
    | 'apps'
    | 'selected'
    | 'pin'
    | 'pin-result'
    | 'explore'
    | 'error';

export const SCARD_STATE_PRESENT = 0x20;
