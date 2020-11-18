const net = require("net");
const asn1 = require("asn1-ts");
const { _encode_IDM_PDU } = require("x500-ts/dist/node/modules/IDMProtocolSpecification/IDM-PDU.ta");
const { IdmBind } = require("x500-ts/dist/node/modules/IDMProtocolSpecification/IdmBind.ta");
const { Request } = require("x500-ts/dist/node/modules/IDMProtocolSpecification/Request.ta");
const { dap_ip } = require("x500-ts/dist/node/modules/DirectoryIDMProtocols/dap-ip.oa");
const {
    DirectoryBindArgument,
    _encode_DirectoryBindArgument,
} = require("x500-ts/dist/node/modules/DirectoryAbstractService/DirectoryBindArgument.ta");
const {
    AbandonArgument,
    _encode_AbandonArgument,
} = require("x500-ts/dist/node/modules/DirectoryAbstractService/AbandonArgument.ta");
const {
    AbandonArgumentData,
    _encode_AbandonArgumentData,
} = require("x500-ts/dist/node/modules/DirectoryAbstractService/AbandonArgumentData.ta");
const {
    AddEntryArgument,
    _encode_AddEntryArgument,
} = require("x500-ts/dist/node/modules/DirectoryAbstractService/AddEntryArgument.ta");
const {
    AddEntryArgumentData,
    _encode_AddEntryArgumentData,
} = require("x500-ts/dist/node/modules/DirectoryAbstractService/AddEntryArgumentData.ta");
const {
    id_opcode_abandon,
} = require("x500-ts/dist/node/modules/CommonProtocolSpecification/id-opcode-abandon.va");
const {
    id_opcode_addEntry,
} = require("x500-ts/dist/node/modules/CommonProtocolSpecification/id-opcode-addEntry.va");
const {
    AttributeTypeAndValue,
} = require("x500-ts/dist/node/modules/InformationFramework/AttributeTypeAndValue.ta");

const BER = () => new BERElement();

function frame (ber) {
    const data = ber.toBytes();
    const lengthBytes = Buffer.allocUnsafe(4);
    lengthBytes.writeUInt32BE(data.length);
    return Buffer.from([
        0x01, // Version 1
        0x01, // Final packet
        ...lengthBytes,
        ...Buffer.from(data),
    ]);
}

const client = net.createConnection({
    host: "localhost",
    port: 4362,
}, () => {
    const hangup = () => {
        console.log("Hanging up.");
        client.end(() => {
            process.exit(0);
        });
    };

    if (process.platform === "win32") {
        const rl = require("readline").createInterface({
            input: process.stdin,
            output: process.stdout,
        });

        rl.on("SIGINT", function () {
            process.emit("SIGINT");
        });
    }
    process.on("SIGHUP", hangup);
    process.on("SIGINT", hangup);
    process.on("SIGTERM", hangup);
    process.on("SIGSTOP", hangup);
    process.on("SIGKILL", hangup);

    client.on("data", (data) => {
        console.log(data.toString("hex"));
    });

    client.on("end", (hadError) => {
        console.log(hadError ? "Unbound connection with error." : "Unbound connection.");
    });

    // Version 1 final packet
    // client.write(Buffer.from([
    //     0x01, // Version 1
    //     0x01, // Final packet
    //     0x00, 0x00, 0x00, 0x05, // Length = 5
    //     ...Buffer.from("HELLO"),
    // ]));

    // Version 2 final packet
    // client.write(Buffer.from([
    //     0x02, // Version 2
    //     0x01, // Final packet
    //     0x80, 0x00, // Only DER supported
    //     0x00, 0x00, 0x00, 0x05, // Length = 5
    //     ...Buffer.from("HELLO"),
    // ]));

    // Version 1 multiple packet
    // client.write(Buffer.from([
    //     0x01, // Version 1
    //     0x00, // Non-final packet
    //     0x00, 0x00, 0x00, 0x03, // Length = 3
    //     ...Buffer.from("HEL"),
    // ]));
    // client.write(Buffer.from([
    //     0x01, // Version 1
    //     0x01, // Final packet
    //     0x00, 0x00, 0x00, 0x02, // Length = 2
    //     ...Buffer.from("LO"),
    // ]));
    // ... followed by another packet
    // client.write(Buffer.from([
    //     0x01, // Version 1
    //     0x01, // Final packet
    //     0x00, 0x00, 0x00, 0x05, // Length = 5
    //     ...Buffer.from("WORLD"),
    // ]));

    // DAP Bind
    const dba = new DirectoryBindArgument(
        undefined,
        undefined,
    );
    const dapBind = {
        bind: new IdmBind(
            dap_ip["&id"],
            undefined,
            undefined,
            _encode_DirectoryBindArgument(dba, BER),
        ),
    };
    client.write(frame(_encode_IDM_PDU(dapBind, BER)));

    // DAP Abandon
    const aad = new AbandonArgumentData({ present: 1234 });
    const aa = {
        unsigned: aad,
    };
    const dapRequestAbandon = {
        request: new Request(
            102,
            id_opcode_abandon,
            _encode_AbandonArgument(aa, BER),
        ),
    };
    client.write(frame(_encode_IDM_PDU(dapRequestAbandon, BER)));

    // DAP Add Entry
    const aed = new AddEntryArgumentData(
        {
            rdnSequence: [
                [
                    new AttributeTypeAndValue(
                        new asn1.ObjectIdentifier([ 2, 5, 4, 3 ]),
                        new asn1.DERElement(
                            asn1.ASN1TagClass.universal,
                            asn1.ASN1Construction.primitive,
                            asn1.ASN1UniversalType.printableString,
                            "bigboi",
                        ),
                    ),
                ],
            ],
        },
        [],
        undefined,
    );
    const aea = {
        unsigned: aed,
    };
    const dapRequestAddEntry = {
        request: new Request(
            103,
            id_opcode_addEntry,
            _encode_AddEntryArgument(aea, BER),
        ),
    };
    client.write(frame(_encode_IDM_PDU(dapRequestAddEntry, BER)));

    // IDM Unbind.
    const idmUnbind = {
        unbind: null,
    };
    client.write(frame(_encode_IDM_PDU(idmUnbind, BER)));
});
