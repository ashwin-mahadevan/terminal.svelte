/**
 * Copyright (c) 2017 The xterm.js authors. All rights reserved.
 * @license MIT
 */

import type { IDisposable } from '$lib/common/Lifecycle';
import type { ParserState } from '$lib/common/parser/Constants';
import type { Params } from '$lib/common/parser/Params';

/** sequence params serialized to js arrays */
export type ParamsArray = (number | number[])[];

/**
 * Internal state of EscapeSequenceParser.
 * Used as argument of the error handler to allow
 * introspection at runtime on parse errors.
 * Return it with altered values to recover from
 * faulty states (not yet supported).
 * Set `abort` to `true` to abort the current parsing.
 */
export interface IParsingState {
	// position in parse string
	position: number;
	// actual character code
	code: number;
	// current parser state
	currentState: ParserState;
	// collect buffer with intermediate characters
	collect: number;
	// params buffer
	params: Params;
	// should abort (default: false)
	abort: boolean;
}

/**
 * Command handler interfaces.
 */

/**
 * CSI handler types.
 * Note: `params` is borrowed.
 */
export type CsiHandlerType = (params: Params) => boolean | Promise<boolean>;
export type CsiFallbackHandlerType = (ident: number, params: Params) => void;

/**
 * DCS handler types.
 */
export interface IDcsHandler {
	/**
	 * Called when a DCS command starts.
	 * Prepare needed data structures here.
	 * Note: `params` is borrowed.
	 */
	hook(params: Params): void;
	/**
	 * Incoming payload chunk.
	 * Note: `params` is borrowed.
	 */
	put(data: Uint32Array, start: number, end: number): void;
	/**
	 * End of DCS command. `success` indicates whether the
	 * command finished normally or got aborted, thus final
	 * execution of the command should depend on `success`.
	 * To save memory also cleanup data structures here.
	 */
	unhook(success: boolean): boolean | Promise<boolean>;
}
export type DcsFallbackHandlerType = (
	ident: number,
	action: 'HOOK' | 'PUT' | 'UNHOOK',
	// TODO: Fix this upstream type error.
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	payload?: any
) => void;

/**
 * ESC handler types.
 */
export type EscHandlerType = () => boolean | Promise<boolean>;
export type EscFallbackHandlerType = (identifier: number) => void;

/**
 * EXECUTE handler types.
 */
export type ExecuteHandlerType = (ident?: number) => boolean;
export type ExecuteFallbackHandlerType = (ident: number) => void;

/**
 * OSC handler types.
 */
export interface IOscHandler {
	/**
	 * Announces start of this OSC command.
	 * Prepare needed data structures here.
	 */
	start(): void;
	/**
	 * Incoming data chunk.
	 * Note: Data is borrowed.
	 */
	put(data: Uint32Array, start: number, end: number): void;
	/**
	 * End of OSC command. `success` indicates whether the
	 * command finished normally or got aborted, thus final
	 * execution of the command should depend on `success`.
	 * To save memory also cleanup data structures here.
	 */
	end(success: boolean): boolean | Promise<boolean>;
}
export type OscFallbackHandlerType = (
	ident: number,
	action: 'START' | 'PUT' | 'END',
	// TODO: Fix this upstream type error.
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	payload?: any
) => void;

/**
 * APC handler types.
 */
export interface IApcHandler {
	/**
	 * Announces start of this APC command.
	 * Prepare needed data structures here.
	 */
	start(): void;
	/**
	 * Incoming data chunk.
	 */
	put(data: Uint32Array, start: number, end: number): void;
	/**
	 * End of APC command. `success` indicates whether the
	 * command finished normally or got aborted, thus final
	 * execution of the command should depend on `success`.
	 * To save memory also cleanup data structures here.
	 */
	end(success: boolean): boolean | Promise<boolean>;
}
export type ApcFallbackHandlerType = (
	ident: number,
	action: 'START' | 'PUT' | 'END',
	// TODO: Fix this upstream type error.
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	payload?: any
) => void;

/**
 * PRINT handler types.
 */
export type PrintHandlerType = (data: Uint32Array, start: number, end: number) => void;
export type PrintFallbackHandlerType = PrintHandlerType;

/**
 * Subparser interfaces.
 * The subparsers are instantiated in `EscapeSequenceParser` and
 * called during `EscapeSequenceParser.parse`.
 */
interface ISubParser<T, U> extends IDisposable {
	reset(): void;
	registerHandler(ident: number, handler: T): IDisposable;
	clearHandler(ident: number): void;
	setHandlerFallback(handler: U): void;
	put(data: Uint32Array, start: number, end: number): void;
}

export interface IOscParser extends ISubParser<IOscHandler, OscFallbackHandlerType> {
	start(): void;
	end(success: boolean, promiseResult?: boolean): void | Promise<boolean>;
}

export interface IDcsParser extends ISubParser<IDcsHandler, DcsFallbackHandlerType> {
	hook(ident: number, params: Params): void;
	unhook(success: boolean, promiseResult?: boolean): void | Promise<boolean>;
}

export interface IApcParser extends ISubParser<IApcHandler, ApcFallbackHandlerType> {
	start(ident: number): void;
	end(success: boolean, promiseResult?: boolean): void | Promise<boolean>;
}

/**
 * Interface to denote a specific ESC, CSI or DCS handler slot.
 * The values are used to create an integer respresentation during handler
 * regristation before passed to the subparsers as `ident`.
 * The integer translation is made to allow a faster handler access
 * in `EscapeSequenceParser.parse`.
 */
export interface IFunctionIdentifier {
	prefix?: string;
	intermediates?: string;
	final: string;
}

export interface IHandlerCollection<T> {
	[key: string]: T[];
}

/**
 * Types for async parser support.
 */

// type of saved stack state in parser
export const enum ParserStackType {
	NONE = 0,
	FAIL,
	RESET,
	CSI,
	ESC,
	OSC,
	DCS,
	APC
}

// aggregate of resumable handler lists
export type ResumableHandlersType = CsiHandlerType[] | EscHandlerType[];

// saved stack state of the parser
export interface IParserStackState {
	state: ParserStackType;
	handlers: ResumableHandlersType;
	handlerPos: number;
	transition: number;
	chunkPos: number;
}

// saved stack state of subparser (OSC and DCS)
export interface ISubParserStackState {
	paused: boolean;
	loopPosition: number;
	fallThrough: boolean;
}
