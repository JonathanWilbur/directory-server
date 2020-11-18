// const jsonSchemaToTypescript = require("json-schema-to-typescript");
// const compileFromFile = jsonSchemaToTypescript.compileFromFile;
// const fs = require("fs");
// const path = require("path");

// const ROOT_DIR = path.join(__dirname, "..");

// function *walkFiles (directoryName) {
//     const directorySet = new Set(fs.readdirSync(directoryName, { encoding: "utf8" }));
//     for (const entry of directorySet.values()) {
//         const fullEntryPath = path.join(directoryName, entry);
//         const stat = fs.statSync(fullEntryPath);
//         if (stat.isDirectory()) {
//             const subdirectory = walkFiles(fullEntryPath);
//             let iteration = subdirectory.next();
//             while (!iteration.done) {
//                 yield iteration.value;
//                 iteration = subdirectory.next();
//             }
//         } else if (stat.isFile()) {
//             yield fullEntryPath;
//         }
//     }
// }

// const files = Array.from(walkFiles(path.join(ROOT_DIR, "schema")));

// (async () => {
//     const compilations = await Promise.all(
//         files.map(async (file) => [ path.parse(file).name, await compileFromFile(file, {
//             unreachableDefinitions: true,
//         }) ]),
//     );
//     compilations.forEach((file) => {
//         const outPath = path.join(ROOT_DIR, "source", "interfaces", "generated", (file[0] + ".ts"));
//         fs.writeFileSync(outPath, file[1].replace(/\r?\n/ug, "\r\n"));
//     });
// })();
