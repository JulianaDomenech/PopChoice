import OpenAI from 'openai';
import { createClient } from "@supabase/supabase-js";

// Determine if we're in Node.js (for prep script) or browser (Vite)
const isNode = typeof process !== 'undefined' && process.versions && process.versions.node;

/** OpenAI config */
// Use process.env for Node.js, import.meta.env for browser (Vite)
const openaiApiKey = isNode 
  ? process.env.OPENAI_API_KEY 
  : (import.meta.env?.VITE_OPENAI_API_KEY || import.meta.env?.OPENAI_API_KEY);

if (!openaiApiKey) {
  const envVar = isNode ? 'OPENAI_API_KEY' : 'VITE_OPENAI_API_KEY';
  console.warn(`OpenAI API key is missing. Make sure ${envVar} is set in your .env file.`);
}

export const openai = new OpenAI({
  apiKey: openaiApiKey || 'dummy-key',
  dangerouslyAllowBrowser: !isNode
});

/** Supabase config */
const supabaseUrl = isNode
  ? process.env.SUPABASE_URL
  : (import.meta.env?.VITE_SUPABASE_URL || import.meta.env?.SUPABASE_URL);

const supabaseKey = isNode
  ? process.env.SUPABASE_API_KEY
  : (import.meta.env?.VITE_SUPABASE_API_KEY || import.meta.env?.SUPABASE_API_KEY);

if (!supabaseUrl) {
  const envVar = isNode ? 'SUPABASE_URL' : 'VITE_SUPABASE_URL';
  console.warn(`Supabase URL is missing. Make sure ${envVar} is set in your .env file.`);
}
if (!supabaseKey) {
  const envVar = isNode ? 'SUPABASE_API_KEY' : 'VITE_SUPABASE_API_KEY';
  console.warn(`Supabase API key is missing. Make sure ${envVar} is set in your .env file.`);
}

export const supabase = createClient(supabaseUrl || 'https://dummy.supabase.co', supabaseKey || 'dummy-key');