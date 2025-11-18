/**
 * Configuration Module
 * 
 * Centralizes API client configuration for OpenAI and Supabase.
 * Handles environment variable loading for both Node.js and browser environments.
 * 
 * Environment Variables:
 * - Node.js: Uses process.env (for scripts like prep-supabase-embeddings.js)
 * - Browser (Vite): Uses import.meta.env with VITE_ prefix
 * 
 * Required Variables:
 * - OPENAI_API_KEY / VITE_OPENAI_API_KEY: OpenAI API key
 * - SUPABASE_URL / VITE_SUPABASE_URL: Supabase project URL
 * - SUPABASE_API_KEY / VITE_SUPABASE_API_KEY: Supabase API key (service_role for scripts, anon for browser)
 */

import OpenAI from 'openai';
import { createClient } from '@supabase/supabase-js';

// ============================================================================
// Environment Detection
// ============================================================================

/**
 * Determines if code is running in Node.js environment
 * @returns {boolean} True if running in Node.js
 */
function isNodeEnvironment() {
  return typeof process !== 'undefined' 
    && process.versions 
    && process.versions.node;
}

const isNode = isNodeEnvironment();

// ============================================================================
// Environment Variable Helpers
// ============================================================================

/**
 * Gets environment variable based on current environment
 * @param {string} nodeKey - Environment variable name for Node.js
 * @param {string} viteKey - Environment variable name for Vite/browser
 * @returns {string|undefined} Environment variable value
 */
function getEnvVar(nodeKey, viteKey) {
  if (isNode) {
    return process.env[nodeKey];
  }
  return import.meta.env?.[viteKey] || import.meta.env?.[nodeKey];
}

/**
 * Logs a warning if a required environment variable is missing
 * @param {string} key - Environment variable name
 * @param {string} envType - 'Node.js' or 'Browser'
 */
function warnMissingKey(key, envType) {
  const envVar = isNode ? key : `VITE_${key}`;
  console.warn(
    `⚠️  ${key} is missing. ` +
    `Make sure ${envVar} is set in your .env file. ` +
    `(Running in ${envType} environment)`
  );
}

// ============================================================================
// OpenAI Configuration
// ============================================================================

const openaiApiKey = getEnvVar('OPENAI_API_KEY', 'VITE_OPENAI_API_KEY');

if (!openaiApiKey) {
  warnMissingKey('OPENAI_API_KEY', isNode ? 'Node.js' : 'Browser');
}

/**
 * OpenAI client instance
 * @type {OpenAI}
 */
export const openai = new OpenAI({
  apiKey: openaiApiKey || 'dummy-key',
  dangerouslyAllowBrowser: !isNode // Only allow browser usage in browser environment
});

// ============================================================================
// Supabase Configuration
// ============================================================================

const supabaseUrl = getEnvVar('SUPABASE_URL', 'VITE_SUPABASE_URL');
const supabaseKey = getEnvVar('SUPABASE_API_KEY', 'VITE_SUPABASE_API_KEY');

if (!supabaseUrl) {
  warnMissingKey('SUPABASE_URL', isNode ? 'Node.js' : 'Browser');
}

if (!supabaseKey) {
  warnMissingKey('SUPABASE_API_KEY', isNode ? 'Node.js' : 'Browser');
}

/**
 * Supabase client instance
 * @type {import('@supabase/supabase-js').SupabaseClient}
 */
export const supabase = createClient(
  supabaseUrl || 'https://dummy.supabase.co',
  supabaseKey || 'dummy-key'
);
