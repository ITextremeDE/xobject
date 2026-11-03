import {z} from 'zod';
/** One canonical spelling for UUID identities across API and MCP. */
export const uuidSchema=z.uuid().toLowerCase();
