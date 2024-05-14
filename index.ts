import * as fs from "fs";

async function serialize(object: any) {
    const stream = fs.createWriteStream("example.txt");
    return await Promise.race([
        new Promise((_, reject) => stream.on("error", reject)),
        (async function () {
            await serializeTo(stream, object);
            await new Promise((resolve) => stream.close(resolve));
        })(),
    ]);
}

async function serializeTo(handle: fs.WriteStream, value: any) {
    switch (typeof value) {
        case "number": {
            let num = value as number;

            await writeString(handle, "N");
            await writeInt(handle, num);
            break;
        }
        case "string": {
            const str = value as string;

            await writeString(handle, "S");
            await writeInt(handle, str.length);

            await writeString(handle, str);
            break;
        }
        case "object": {
            const entries = Object.entries(value);

            await writeString(handle, "O");
            await writeInt(handle, entries.length);
            for (let [k, v] of Object.entries(value)) {
                await serializeTo(handle, k);
                await serializeTo(handle, v);
            }
            break;
        }
        default:
            throw new Error("Unexpected type: " + typeof value);
    }
}

async function deserialize() {
    const stream = fs.createReadStream("example.txt", "utf8");
    stream.on("open", () => stream.pause());
    return await Promise.race([
        new Promise((_, reject) => stream.on("error", reject)),
        deserializeFrom(stream),
    ]);
}

async function deserializeFrom(handle: fs.ReadStream): Promise<any> {
    const kind = await readString(handle, 1);

    switch (kind) {
        case "N":
            return await readInt(handle);

        case "S":
            const len = await readInt(handle);
            return await readString(handle, len);

        case "O":
            let result = {};
            const count = await readInt(handle);
            for (let i = 0; i < count; i++) {
                const key = await deserializeFrom(handle);
                const value = await deserializeFrom(handle);
                result[key] = value;
            }
            return result;

        default:
            throw new Error("Unexpected type: " + JSON.stringify(kind));
    }
}

async function readString(handle: fs.ReadStream, length: number) {
    while (true) {
        const chunk = handle.read(length);
        if (chunk !== null) {
            return chunk;
        }

        await new Promise((resolve) => {
            function onReadable() {
                handle.removeListener("readable", onReadable);
                resolve({});
            }
            handle.addListener("readable", onReadable);
        });
    }
}

function writeString(handle: fs.WriteStream, str: string) {
    return new Promise((resolve) => {
        if (handle.write(str)) {
            resolve({});
            return;
        }

        function onDrain() {
            handle.removeListener("drain", onDrain);
            resolve({});
        }

        handle.addListener("drain", onDrain);
    });
}

async function writeInt(handle: fs.WriteStream, value: number) {
    await writeString(handle, value.toString());
}

async function readInt(handle: fs.ReadStream) {
    return +(await readString(handle, 1));
}

function createObject(layers: number) {
    if (layers <= 0) {
        return {
            a: 1,
            b: 2.0,
            c: "long",
        };
    } else {
        return [createObject(layers - 1), createObject(layers - 2)];
    }
}

async function main() {
    const original = createObject(10); //24

    console.log("Writing");

    const writePromise = serialize(original);
    let writeDone = false;
    writePromise.finally(() => (writeDone = true));
    while (!writeDone) {
        process.stdout.write(".");
        await new Promise((resolve) => setTimeout(resolve, 1000));
    }
    process.stdout.write("\n");
    await writePromise; // this will re-raise exceptions as needed

    console.log("Writing done, now reading");

    const readPromise = deserialize();
    let readDone = false;
    readPromise.finally(() => (readDone = true));
    while (!readDone) {
        process.stdout.write(".");
        await new Promise((resolve) => setTimeout(resolve, 1000));
    }
    process.stdout.write("\n");
    const read = await readPromise; // this will re-raise exceptions as needed

    console.log("Reading done");

    console.log("check", isEqual(original, read));
}

function isEqual(obj1: { [x: string]: any }, obj2: { [x: string]: any }) {
    const obj1Keys = Object.keys(obj1);
    const obj2Keys = Object.keys(obj2);

    if (obj1Keys.length !== obj2Keys.length) {
        return false;
    }

    for (let objKey of obj1Keys) {
        if (obj1[objKey] !== obj2[objKey]) {
            if (
                typeof obj1[objKey] == "object" &&
                typeof obj2[objKey] == "object"
            ) {
                if (!isEqual(obj1[objKey], obj2[objKey])) {
                    return false;
                }
            } else {
                return false;
            }
        }
    }

    return true;
}

main();
