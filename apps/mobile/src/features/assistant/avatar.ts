/**
 * The assistant's face.
 *
 * In a module of its own because an image `require` — the way React Native
 * resolves an asset — is neither an import nor an ordinary statement: placed
 * inside a screen, it ends up caught between two lint rules that contradict
 * each other. Here it is imported like anything else.
 */
export const ASSISTANT_AVATAR = require('../../../assets/assistant-avatar.png') as number
