// This file makes the crypto module spyable in Jest tests.
// When TypeScript compiles `import * as crypto from 'crypto'` with esModuleInterop,
// it wraps the module in __importStar. By setting __esModule: true, __importStar
// returns the object directly (no wrapping), making all properties spyable.
const crypto = require('node:crypto');
module.exports = { ...crypto, __esModule: true };
