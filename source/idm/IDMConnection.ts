import * as net from "net";
// import * as stream from "stream";
import IDMVersion from "./IDMVersion";
import IDMSegmentField from "./IDMSegmentField";
import IDMSegment from "./IDMSegment";
// import * as x500 from "x500-ts";
import { BERElement } from "asn1-ts";
import { IDM_PDU, _decode_IDM_PDU } from "x500-ts/dist/node/modules/IDMProtocolSpecification/IDM-PDU.ta";
// import type { IdmBind } from "x500-ts/dist/node/modules/IDMProtocolSpecification/IdmBind.ta";
// import { dap_ip } from "x500-ts/dist/node/modules/DirectoryIDMProtocols/dap-ip.oa";
import { EventEmitter } from "events";
import type IDMEventEmitter from "./IDMEventEmitter";

// NOTE: It does not seem to clearly state what the code for version 2 is.

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
}
