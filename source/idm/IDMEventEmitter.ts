import type { IdmBind } from "x500-ts/dist/node/modules/IDMProtocolSpecification/IdmBind.ta";
import type { IdmBindResult } from "x500-ts/dist/node/modules/IDMProtocolSpecification/IdmBindResult.ta";
import type { IdmBindError } from "x500-ts/dist/node/modules/IDMProtocolSpecification/IdmBindError.ta";
import type { Request } from "x500-ts/dist/node/modules/IDMProtocolSpecification/Request.ta";
import type { IdmResult } from "x500-ts/dist/node/modules/IDMProtocolSpecification/IdmResult.ta";
import type { Error } from "x500-ts/dist/node/modules/IDMProtocolSpecification/Error.ta";
import type { IdmReject } from "x500-ts/dist/node/modules/IDMProtocolSpecification/IdmReject.ta";
import type { Unbind } from "x500-ts/dist/node/modules/IDMProtocolSpecification/Unbind.ta";
import type { Abort } from "x500-ts/dist/node/modules/IDMProtocolSpecification/Abort.ta";
import type { StartTLS } from "x500-ts/dist/node/modules/IDMProtocolSpecification/StartTLS.ta";
import type { TLSResponse } from "x500-ts/dist/node/modules/IDMProtocolSpecification/TLSResponse.ta";

type EventMap = Record<string, any>;

type EventKey<T extends EventMap> = string & keyof T;
type EventReceiver<T> = (params: T) => void;

// export default
interface Emitter<T extends EventMap> {
    on <K extends EventKey<T>> (eventName: K, fn: EventReceiver<T[K]>): void;
    off <K extends EventKey<T>> (eventName: K, fn: EventReceiver<T[K]>): void;
    emit <K extends EventKey<T>> (eventName: K, params: T[K]): void;
}

type IDMEventEmitter = Emitter<{
    bind: IdmBind;
    bindResult: IdmBindResult;
    bindError: IdmBindError;
    request: Request;
    result: IdmResult;
    error_: Error;
    reject: IdmReject;
    unbind: Unbind;
    abort: Abort;
    startTLS: StartTLS;
    tLSResponse: TLSResponse;
}>;

export default IDMEventEmitter;
