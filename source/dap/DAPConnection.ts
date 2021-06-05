import { Context } from "../types";
import IDMConnection from "../idm/IDMConnection";
import type {
    DirectoryBindArgument,
} from "@wildboar/x500/src/lib/modules/DirectoryAbstractService/DirectoryBindArgument.ta";
import type { Request } from "@wildboar/x500/src/lib/modules/IDMProtocolSpecification/Request.ta";
// import * as CommonProtocolSpecification from "x500-ts/dist/node/CommonProtocolSpecification";
import { id_opcode_abandon } from "@wildboar/x500/src/lib/modules/CommonProtocolSpecification/id-opcode-abandon.va";
import { id_opcode_addEntry } from "@wildboar/x500/src/lib/modules/CommonProtocolSpecification/id-opcode-addEntry.va";
import {
    AbandonArgument,
    _decode_AbandonArgument,
} from "@wildboar/x500/src/lib/modules/DirectoryAbstractService/AbandonArgument.ta";
import {
    AddEntryArgument,
    _decode_AddEntryArgument,
} from "@wildboar/x500/src/lib/modules/DirectoryAbstractService/AddEntryArgument.ta";
import type {
    AddEntryArgumentData,
} from "@wildboar/x500/src/lib/modules/DirectoryAbstractService/AddEntryArgumentData.ta";
import * as mongo from "mongodb";
import abandon from "./operations/abandon";

let db!: mongo.Db;
mongo.MongoClient.connect("mongodb://localhost:27017", function (err, client) {
    if (err) {
        throw err;
    }
    console.log("Connected successfully to server");
    db = client.db("directory");
});

export default
class DAPConnection {
    private handleAddEntry (data: AddEntryArgumentData): void {
        const entries = db.collection("entries");
        const attributes = db.collection("attributes");
        const rdnSequence = data.object.rdnSequence.flatMap((rnds) => rnds.map((atav) => ({
            type: atav.type_.nodes,
            value: {
                any: atav.value.toBytes(),
            },
        })));
        entries.insertOne({
            rdnSequence,
        }, (err, res) => {
            if (err) {
                throw err;
            }
            attributes.insertMany(rdnSequence.map((rdn) => ({
                ...rdn,
                entry: res.insertedId,
            })));
        });
    }

    private async handleRequest (request: Request): Promise<void> {
        if ("local" in request.opcode) {
            // abandon, administerPassword, changePassword should be easy to implement.
            switch (request.opcode.local) {
            case ((id_opcode_abandon as { local: number }).local): {
                const arg: AbandonArgument = _decode_AbandonArgument(request.argument);
                const data = ("signed" in arg)
                    ? arg.signed.toBeSigned
                    : arg.unsigned;
                await abandon(this.ctx, this, data);
                break;
            }
            case ((id_opcode_addEntry as { local: number }).local): {
                const addEntry: AddEntryArgument = _decode_AddEntryArgument(request.argument);
                const data = ("signed" in addEntry)
                    ? addEntry.signed.toBeSigned
                    : addEntry.unsigned;
                this.handleAddEntry(data);
                break;
            }
            default: {
                console.log("Unsupported DAP opcode.");
            }
            }
        } else {
            console.log("Not a valid DAP opcode.");
        }
    }

    constructor (
        readonly ctx: Context,
        readonly idm: IDMConnection,
        readonly bind: DirectoryBindArgument,
    ) {
        console.log("DAP connection established.");
        // Check bind credentials.
        idm.events.on("request", this.handleRequest.bind(this));
    }
}
