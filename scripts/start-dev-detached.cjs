const path = require("path");

const launcher = path.resolve(__dirname, "..", "打开AI创作辅助平台.cmd");

console.log("Legacy dev launcher disabled.");
console.log(`Use the bounded launcher instead: ${launcher}`);
console.log("This command exits immediately to avoid blocking Codex checks.");
