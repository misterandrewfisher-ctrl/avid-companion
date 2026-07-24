/// <reference types="vite/client" />

declare module "@tauri-apps/api/core" {
  export function invoke<T = unknown>(cmd: string, args?: Record<string, unknown>): Promise<T>;
}
declare module "@tauri-apps/api/path" {
  export function appDataDir(): Promise<string>;
  export function join(...paths: string[]): Promise<string>;
  export function resolveResource(path: string): Promise<string>;
}
declare module "@tauri-apps/api/event" {
  export function listen<T = unknown>(event: string, handler: (e: { payload: T }) => void): Promise<() => void>;
  export function emit(event: string, payload?: unknown): Promise<void>;
}
declare module "@tauri-apps/plugin-shell" {
  export class Command {
    static create(program: string, args?: string[]): Command;
    spawn(): Promise<{ pid: number }>;
    execute(): Promise<{ code: number; stdout: string; stderr: string }>;
  }
  export function open(path: string): Promise<void>;
}
declare module "@tauri-apps/plugin-updater" {
  export function check(): Promise<null | {
    available: boolean;
    version: string;
    downloadAndInstall(cb?: (e: unknown) => void): Promise<void>;
  }>;
}
declare module "@tauri-apps/plugin-process" {
  export function relaunch(): Promise<void>;
  export function exit(code?: number): Promise<void>;
}
declare module "@tauri-apps/plugin-dialog" {
  export function open(options?: Record<string, unknown>): Promise<string | string[] | null>;
  export function message(msg: string, options?: Record<string, unknown>): Promise<void>;
}
declare module "@tauri-apps/plugin-fs" {
  export function readFile(path: string): Promise<Uint8Array>;
  export function writeFile(path: string, data: Uint8Array): Promise<void>;
  export function readTextFile(path: string): Promise<string>;
  export function writeTextFile(path: string, contents: string): Promise<void>;
  export function exists(path: string): Promise<boolean>;
  export function mkdir(path: string, options?: { recursive?: boolean }): Promise<void>;
  export function readDir(
    path: string
  ): Promise<Array<{ name: string; isDirectory: boolean; isFile: boolean }>>;
}
declare module "@tauri-apps/plugin-http" {
  export const fetch: typeof globalThis.fetch;
}
