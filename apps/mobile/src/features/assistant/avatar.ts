/**
 * Le visage de l'assistant.
 *
 * Dans son propre module parce qu'un `require` d'image — la façon dont React
 * Native résout un asset — n'est ni un import ni une instruction ordinaire :
 * placé dans un écran, il se retrouve coincé entre deux règles de lint qui se
 * contredisent. Ici, il est importé comme n'importe quoi d'autre.
 */
export const ASSISTANT_AVATAR = require('../../../assets/assistant-avatar.png') as number
