import * as net from "net";
import IDMVersion from "./IDMVersion";
import IDMSegmentField from "./IDMSegmentField";
import IDMSegment from "./IDMSegment";
import { BERElement, ASN1Element, INTEGER } from "asn1-ts";
import { IDM_PDU, _decode_IDM_PDU } from "@wildboar/x500/src/lib/modules/IDMProtocolSpecification/IDM-PDU.ta";
import { Error as IDMError, _encode_Error } from "@wildboar/x500/src/lib/modules/IDMProtocolSpecification/Error.ta";
import { IdmReject, _encode_IdmReject } from "@wildboar/x500/src/lib/modules/IDMProtocolSpecification/IdmReject.ta";
import { Abort, _encode_Abort } from "@wildboar/x500/src/lib/modules/IDMProtocolSpecification/Abort.ta";
import type { IdmReject_reason } from "@wildboar/x500/src/lib/modules/IDMProtocolSpecification/IdmReject-reason.ta";
import { EventEmitter } from "events";
import type IDMEventEmitter from "./IDMEventEmitter";

// NOTE: It does not seem to clearly state what the code for version 2 is.
// TODO: Check for reused invoke IDs.

export default
class IDMConnection {
    // Buffer
    private nextExpectedField = IDMSegmentField.version;
    private awaitingBytes: number = 1;
    private buffer: Buffer = Buffer.allocUnsafe(0);
    private bufferIndex: number = 0;

    // IDM Segments
    private version: IDMVersion | undefined = undefined;
    private currentSegments: IDMSegment[] = [];
    private currentSegment: Partial<IDMSegment> = {};

    // IDM Packet
    // private bindInformation: IdmBind | undefined = undefined;

    // Event emitter
    public readonly events: IDMEventEmitter = new EventEmitter();

    constructor (
        readonly socket: net.Socket,
    ) {
        // super();
        this.socket.on("error", (e: Error) => {
            console.error(e.message);
            this.socket.removeAllListeners();
            process.exit(0);
        });

        this.socket.on("end", (hadError: boolean) => {
            console.log(hadError ? "Closing connection with error." : "Closed connection.");
        });

        this.socket.on("data", (data: Buffer) => {
            this.buffer = Buffer.concat([ this.buffer, data ]);
            while ((this.bufferIndex + this.awaitingBytes) <= this.buffer.length) {
                switch (this.nextExpectedField) {
                case (IDMSegmentField.version): {
                    const indicatedVersion = this.buffer.readUInt8(this.bufferIndex);
                    if (indicatedVersion === 1) {
                        this.version = IDMVersion.v1;
                        this.currentSegment.version = IDMVersion.v1;
                    } else if (indicatedVersion === 2) {
                        this.version = IDMVersion.v2;
                        this.currentSegment.version = IDMVersion.v2;
                    } else {
                        throw new Error(`Unrecognized IDM protocol version ${indicatedVersion}.`);
                    }
                    this.nextExpectedField = IDMSegmentField.final;
                    this.bufferIndex++;
                    break;
                }
                case (IDMSegmentField.final): {
                    this.currentSegment.final = Boolean(this.buffer.readUInt8(this.bufferIndex));
                    if (this.version === undefined) {
                        throw new Error("Invalid parser state.");
                    } else if (this.version === IDMVersion.v1) {
                        this.nextExpectedField = IDMSegmentField.length;
                        this.awaitingBytes = 4;
                    } else if (this.version === IDMVersion.v2) {
                        this.nextExpectedField = IDMSegmentField.encoding;
                        this.awaitingBytes = 2;
                    } else {
                        throw new Error();
                    }
                    this.bufferIndex++;
                    break;
                }
                case (IDMSegmentField.encoding): {
                    this.currentSegment.encoding = this.buffer.readUInt16BE(this.bufferIndex); // REVIEW:
                    this.bufferIndex += 2;
                    this.nextExpectedField = IDMSegmentField.length;
                    this.awaitingBytes = 4;
                    break;
                }
                case (IDMSegmentField.length): {
                    this.currentSegment.length = this.buffer.readUInt32BE(this.bufferIndex); // REVIEW:
                    this.awaitingBytes = this.currentSegment.length;
                    this.bufferIndex += 4;
                    this.nextExpectedField = IDMSegmentField.data;
                    break;
                }
                case (IDMSegmentField.data): {
                    if (this.currentSegment.length === undefined) {
                        throw new Error("Invalid parser state.");
                    }
                    this.currentSegment.data = this.buffer.slice(
                        this.bufferIndex,
                        (this.bufferIndex + this.currentSegment.length),
                    );
                    this.currentSegments.push(this.currentSegment as IDMSegment);
                    if (this.currentSegment.final) {
                        const pduBytes = Buffer.concat(this.currentSegments.map((s) => s.data));
                        console.log(pduBytes);
                        const ber = new BERElement();
                        ber.fromBytes(pduBytes);
                        this.handlePDU(_decode_IDM_PDU(ber));
                        this.currentSegments = [];
                    }
                    this.buffer = this.buffer.slice(this.bufferIndex + this.currentSegment.length);
                    this.bufferIndex = 0;
                    this.currentSegment = {};
                    this.nextExpectedField = IDMSegmentField.version;
                    this.awaitingBytes = 1;
                    break;
                }
                default: {
                    throw new Error(`Unrecognized IDM segment field ${this.nextExpectedField}`);
                }
                }
            }
        });
    }

    private handlePDU (pdu: IDM_PDU): void {
        if ("bind" in pdu) {
            this.events.emit("bind", pdu.bind);
        } else if ("bindResult" in pdu) {
            this.events.emit("bindResult", pdu.bindResult);
        } else if ("bindError" in pdu) {
            this.events.emit("bindError", pdu.bindError);
        } else if ("request" in pdu) {
            this.events.emit("request", pdu.request);
        } else if ("result" in pdu) {
            this.events.emit("result", pdu.result);
        } else if ("error" in pdu) {
            this.events.emit("error_", pdu.error);
        } else if ("reject" in pdu) {
            this.events.emit("reject", pdu.reject);
        } else if ("unbind" in pdu) {
            this.events.emit("unbind", pdu.unbind);
        } else if ("abort" in pdu) {
            this.events.emit("abort", pdu.abort);
        } else if ("startTLS" in pdu) {
            this.events.emit("startTLS", pdu.startTLS);
        } else if ("tLSResponse" in pdu) {
            this.events.emit("tLSResponse", pdu.tLSResponse);
        } else {
            console.log("Unrecognized IDM PDU.");
        }
        // if ("bind" in pdu) {
        //     if (pdu.bind.protocolID.toString() === dap_ip["&id"]?.toString()) {
        //         console.log("DAP detected.");
        //     }
        //     this.events.emit("bind", pdu.bind);
        // } else if ("unbind" in pdu) {
        //     this.events.emit("unbind", pdu.unbind);
        // } else if ("request" in pdu) {
        //     // call protocol.request
        // } else if ("startTLS" in pdu) {
        //     // upgrade to TLS.
        // } else {
        //     console.log("Unrecognized IDM packet type.");
        // }
    }

    public write (data: Uint8Array, encodings: number): void {
        const header = ((): Buffer => {
            switch (this.version) {
            case (IDMVersion.v1): {
                const VERSION_V1_BYTE: number = 0x01;
                const FINAL_BYTE: number = 0x01; // FIXME: Support larger responses.
                const ret = Buffer.alloc(6);
                ret.writeInt8(VERSION_V1_BYTE, 0);
                ret.writeInt8(FINAL_BYTE, 1);
                ret.writeInt32BE(data.length, 2);
                return ret;
            }
            case (IDMVersion.v2): {
                const VERSION_V2_BYTE: number = 0x02;
                const FINAL_BYTE: number = 0x01; // FIXME: Support larger responses.
                const ret = Buffer.alloc(7);
                ret.writeInt8(VERSION_V2_BYTE, 0);
                ret.writeInt8(FINAL_BYTE, 1);
                ret.writeInt16BE(encodings, 2);
                ret.writeInt32BE(data.length, 4);
                return ret;
            }
            default: {
                throw new Error();
            }
            }
        })();
        this.socket.write(Buffer.concat([
            header,
            data,
        ]));
    }

    public async writeError (invokeId: INTEGER, errcode: ASN1Element, error: ASN1Element): Promise<void> {
        const idmerr = new IDMError(invokeId, errcode, error);
        const result = _encode_Error(idmerr, () => new BERElement());
        this.write(result.toBytes(), 0);
    }

    public async writeReject (invokeID: INTEGER, reason: IdmReject_reason): Promise<void> {
        const rej = _encode_IdmReject(new IdmReject(invokeID, reason), () => new BERElement());
        this.write(rej.toBytes(), 0);
    }

    public async writeAbort (abort: Abort): Promise<void> {
        const a = _encode_Abort(abort, () => new BERElement());
        this.write(a.toBytes(), 0);
    }
}
