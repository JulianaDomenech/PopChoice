/**
 * Supabase Embeddings Preparation Script
 * 
 * This script processes movie content, generates vector embeddings using OpenAI,
 * and stores them in Supabase for semantic search functionality.
 * 
 * Features:
 * - Intelligent text chunking with guaranteed overlap
 * - Batch processing for efficient API usage
 * - Idempotent execution (clears table before insert)
 * - Progress tracking and error handling
 * 
 * Usage:
 *   node prep-supabase-embeddings.js
 * 
 * Environment Variables (.env):
 *   OPENAI_API_KEY=sk-...
 *   SUPABASE_URL=https://your-project.supabase.co
 *   SUPABASE_API_KEY=your-service-role-key
 * 
 * Note: Use service_role key (not anon) for this script as it requires
 * write permissions to clear and insert data.
 */

import 'dotenv/config';
import { openai, supabase } from './config.js';
import movies from './content.js';

// ============================================================================
// Configuration Constants
// ============================================================================

const CONFIG = {
  CHUNKING: {
    DEFAULT_CHUNK_SIZE: 500,
    DEFAULT_OVERLAP: 50,
    SENTENCE_SEARCH_WINDOW: 150 // Characters to search backwards for sentence boundary
  },
  API: {
    EMBEDDING_MODEL: 'text-embedding-ada-002',
    BATCH_SIZE: 100 // Number of embeddings to generate in parallel
  },
  DATABASE: {
    TABLE_NAME: 'movies',
    INSERT_BATCH_SIZE: 100 // Number of records to insert per batch
  },
  VERIFICATION: {
    MIN_WORD_OVERLAP: 3, // Minimum words that should overlap between chunks
    OVERLAP_CHECK_SIZE: 50 // Characters to check for overlap verification
  }
};

// ============================================================================
// Text Chunking Utilities
// ============================================================================

/**
 * Finds the best sentence boundary near a target position
 * @param {string} text - Full text to search
 * @param {number} targetPos - Target position to find boundary near
 * @param {number} searchStart - Start of search window
 * @returns {number} Position of sentence boundary, or targetPos if none found
 */
function findSentenceBoundary(text, targetPos, searchStart) {
  // Look backwards for period followed by space or newline
  for (let i = targetPos - 1; i >= searchStart; i--) {
    if (text[i] === '.' && (i === text.length - 1 || text[i + 1] === ' ' || text[i + 1] === '\n')) {
      return i + 1; // Include the period
    }
  }
  return -1; // No sentence boundary found
}

/**
 * Finds the best word boundary near a target position
 * @param {string} text - Full text to search
 * @param {number} targetPos - Target position
 * @param {number} searchStart - Start of search window
 * @returns {number} Position of word boundary, or -1 if none found
 */
function findWordBoundary(text, targetPos, searchStart) {
  const wordBoundary = text.lastIndexOf(' ', targetPos);
  return wordBoundary > searchStart ? wordBoundary + 1 : -1;
}

/**
 * Determines optimal chunk end position, preferring sentence boundaries
 * @param {string} text - Full text
 * @param {number} startPos - Start of current chunk
 * @param {number} idealEnd - Ideal end position (start + chunkSize)
 * @returns {number} Optimal end position
 */
function findOptimalChunkEnd(text, startPos, idealEnd) {
  if (idealEnd >= text.length) {
    return text.length;
  }

  const searchStart = Math.max(startPos, idealEnd - CONFIG.CHUNKING.SENTENCE_SEARCH_WINDOW);
  
  // Try sentence boundary first
  const sentenceEnd = findSentenceBoundary(text, idealEnd, searchStart);
  if (sentenceEnd > searchStart) {
    return sentenceEnd;
  }

  // Fall back to word boundary
  const wordEnd = findWordBoundary(text, idealEnd, searchStart);
  if (wordEnd > searchStart) {
    return wordEnd;
  }

  // Use ideal end if no boundary found
  return idealEnd;
}

/**
 * Calculates next chunk start position ensuring proper overlap
 * @param {string} text - Full text
 * @param {number} currentStart - Start of current chunk
 * @param {number} chunkEnd - End of current chunk
 * @param {number} overlap - Required overlap size
 * @returns {number} Start position for next chunk
 */
function calculateNextChunkStart(text, currentStart, chunkEnd, overlap) {
  const requiredOverlapStart = chunkEnd - overlap;
  let nextStart = requiredOverlapStart;

  // Ensure we always move forward
  if (nextStart <= currentStart) {
    nextStart = currentStart + Math.max(1, CONFIG.CHUNKING.DEFAULT_CHUNK_SIZE - overlap);
  }

  // Don't go past end of text
  if (nextStart >= text.length) {
    return text.length;
  }

  // Try to align to word boundary while maintaining overlap
  const spaceBefore = text.lastIndexOf(' ', nextStart);
  const spaceAfter = text.indexOf(' ', nextStart);

  if (spaceBefore >= requiredOverlapStart && spaceBefore < nextStart) {
    nextStart = spaceBefore + 1;
  } else if (spaceAfter > nextStart && spaceAfter <= chunkEnd && spaceAfter >= requiredOverlapStart) {
    nextStart = spaceAfter + 1;
  }

  // Final check: ensure overlap is preserved
  if (nextStart > requiredOverlapStart) {
    nextStart = requiredOverlapStart;
  }

  // Safety: ensure forward progress
  if (nextStart <= currentStart) {
    nextStart = currentStart + 1;
  }

  return nextStart;
}

/**
 * Chunks text into smaller pieces with guaranteed overlap for embedding
 * 
 * Overlap ensures context is preserved across chunk boundaries, which is
 * critical for accurate semantic search when content spans multiple chunks.
 * 
 * @param {string} text - The text to chunk
 * @param {number} chunkSize - Maximum characters per chunk (default: 500)
 * @param {number} overlap - Characters to overlap between chunks (default: 50)
 * @returns {string[]} Array of text chunks with guaranteed overlap
 */
function chunkText(text, chunkSize = CONFIG.CHUNKING.DEFAULT_CHUNK_SIZE, overlap = CONFIG.CHUNKING.DEFAULT_OVERLAP) {
  const chunks = [];
  let currentPos = 0;

  while (currentPos < text.length) {
    const idealEnd = Math.min(currentPos + chunkSize, text.length);
    const chunkEnd = findOptimalChunkEnd(text, currentPos, idealEnd);

    // Extract and trim chunk
    const chunk = text.slice(currentPos, chunkEnd).trim();
    if (chunk.length > 0) {
      chunks.push(chunk);
    }

    // Check if we've reached the end
    if (chunkEnd >= text.length) {
      break;
    }

    // Calculate next position with guaranteed overlap
    currentPos = calculateNextChunkStart(text, currentPos, chunkEnd, overlap);
  }

  return chunks;
}

/**
 * Verifies that chunks have proper overlap
 * @param {string[]} chunks - Array of text chunks
 * @param {string} movieTitle - Title of movie being processed (for logging)
 */
function verifyChunkOverlap(chunks, movieTitle) {
  if (chunks.length <= 1) {
    return; // No overlap needed for single chunk
  }

  console.log(`  → Verifying overlap between chunks...`);

  for (let i = 0; i < chunks.length - 1; i++) {
    const currentChunk = chunks[i];
    const nextChunk = chunks[i + 1];
    const overlapSize = CONFIG.VERIFICATION.OVERLAP_CHECK_SIZE;

    const currentEnd = currentChunk.slice(-overlapSize);
    const nextStart = nextChunk.slice(0, overlapSize);

    // Check for word-level overlap
    const currentEndWords = currentEnd.trim().split(/\s+/).filter(w => w.length > 0);
    const nextStartWords = nextStart.trim().split(/\s+/).filter(w => w.length > 0);

    let overlapCount = 0;
    for (let j = 0; j < Math.min(currentEndWords.length, nextStartWords.length); j++) {
      if (currentEndWords[currentEndWords.length - 1 - j] === nextStartWords[j]) {
        overlapCount++;
      } else {
        break;
      }
    }

    // Verify overlap exists
    const hasOverlap = overlapCount >= CONFIG.VERIFICATION.MIN_WORD_OVERLAP ||
      nextStart.toLowerCase().includes(currentEnd.slice(-20).toLowerCase()) ||
      currentEnd.toLowerCase().includes(nextStart.slice(0, 20).toLowerCase());

    if (hasOverlap) {
      console.log(`    ✓ Chunk ${i + 1} and ${i + 2} have overlapping content (${overlapCount} words overlap)`);
      console.log(`      Chunk ${i + 1} ends: "...${currentChunk.slice(-30)}"`);
      console.log(`      Chunk ${i + 2} starts: "${nextChunk.slice(0, 30)}..."`);
    } else {
      console.log(`    ⚠ Chunk ${i + 1} and ${i + 2} may not have proper overlap`);
      console.log(`      Chunk ${i + 1} ends: "...${currentChunk.slice(-30)}"`);
      console.log(`      Chunk ${i + 2} starts: "${nextChunk.slice(0, 30)}..."`);
    }
  }
}

// ============================================================================
// Embedding Generation
// ============================================================================

/**
 * Generates embeddings for all chunks
 * @param {Array<{movieTitle: string, chunkIndex: number, content: string}>} chunks - Chunks to embed
 * @returns {Promise<Array<{content: string, embedding: number[]}>>} Chunks with embeddings
 */
async function generateEmbeddings(chunks) {
  console.log('Generating embeddings...');

  const dataWithEmbeddings = await Promise.all(
    chunks.map(async (chunk, index) => {
      // Progress logging
      if ((index + 1) % 10 === 0) {
        console.log(`  → Processed ${index + 1}/${chunks.length} chunks...`);
      }

      try {
        const embeddingResponse = await openai.embeddings.create({
          model: CONFIG.API.EMBEDDING_MODEL,
          input: chunk.content
        });

        return {
          content: chunk.content,
          embedding: embeddingResponse.data[0].embedding
        };
      } catch (error) {
        console.error(`Error generating embedding for chunk ${index + 1}:`, error);
        throw error;
      }
    })
  );

  console.log(`\n✅ Generated ${dataWithEmbeddings.length} embeddings\n`);
  return dataWithEmbeddings;
}

// ============================================================================
// Database Operations
// ============================================================================

/**
 * Clears existing data from the movies table
 * Makes the script idempotent - safe to run multiple times
 * @returns {Promise<boolean>} True if successful, false otherwise
 */
async function clearTable() {
  console.log('Clearing existing data from movies table...');

  const { error } = await supabase
    .from(CONFIG.DATABASE.TABLE_NAME)
    .delete()
    .neq('id', 0); // Delete all rows (id != 0 matches all rows)

  if (error) {
    console.error('⚠️  Warning: Could not clear table:', error.message);
    console.log('Continuing with insert (may result in duplicates)...');
    return false;
  }

  console.log('✅ Table cleared successfully\n');
  return true;
}

/**
 * Inserts chunks with embeddings into Supabase in batches
 * @param {Array<{content: string, embedding: number[]}>} dataWithEmbeddings - Data to insert
 * @returns {Promise<number>} Number of successfully inserted records
 */
async function insertChunks(dataWithEmbeddings) {
  console.log('Inserting data into Supabase...');

  const batchSize = CONFIG.DATABASE.INSERT_BATCH_SIZE;
  let insertedCount = 0;

  for (let i = 0; i < dataWithEmbeddings.length; i += batchSize) {
    const batch = dataWithEmbeddings.slice(i, i + batchSize);
    const batchNumber = Math.floor(i / batchSize) + 1;

    try {
      const { data: insertedData, error } = await supabase
        .from(CONFIG.DATABASE.TABLE_NAME)
        .insert(batch)
        .select();

      if (error) {
        console.error(`❌ Error inserting batch ${batchNumber}:`, error);
        throw error;
      }

      insertedCount += insertedData ? insertedData.length : batch.length;
      console.log(`  → Inserted batch ${batchNumber} (${insertedCount}/${dataWithEmbeddings.length} chunks)`);
    } catch (error) {
      console.error(`Failed to insert batch ${batchNumber}:`, error);
      throw error;
    }
  }

  return insertedCount;
}

// ============================================================================
// Main Processing Function
// ============================================================================

/**
 * Main function to process movies, chunk content, and create embeddings
 * @param {Array<{title: string, content: string}>} moviesArray - Array of movie objects
 */
async function main(moviesArray) {
  console.log(`Processing ${moviesArray.length} movies...\n`);

  // Step 1: Chunk all movie content
  const allChunks = [];
  let totalChunks = 0;

  for (const movie of moviesArray) {
    console.log(`Chunking content for: ${movie.title}`);
    const chunks = chunkText(movie.content);
    console.log(`  → Created ${chunks.length} chunks`);

    // Verify overlap for multi-chunk movies
    verifyChunkOverlap(chunks, movie.title);

    totalChunks += chunks.length;

    // Store chunks with metadata
    chunks.forEach((chunk, index) => {
      allChunks.push({
        movieTitle: movie.title,
        chunkIndex: index,
        content: chunk
      });
    });
  }

  console.log(`\nTotal chunks to process: ${totalChunks}\n`);

  // Step 2: Generate embeddings
  const dataWithEmbeddings = await generateEmbeddings(allChunks);

  // Step 3: Clear existing data (idempotent operation)
  await clearTable();

  // Step 4: Insert chunks into Supabase
  const insertedCount = await insertChunks(dataWithEmbeddings);

  // Success summary
  console.log(`\n✅ Successfully embedded and stored ${insertedCount} chunks from ${moviesArray.length} movies!`);
  console.log('✅ Script completed - table is ready for vector search!');
}

// ============================================================================
// Script Execution
// ============================================================================

main(movies).catch(error => {
  console.error('\n❌ Script failed:', error);
  process.exit(1);
});
